/**
 * crawl-run v2 — 상세/목록 페이지 모두 지원 + JSON-LD 기반 상세 파싱
 *   POST /crawl-run               → 스케줄 매칭된 active 타겟만 실행
 *   POST /crawl-run {"force":true} → 모든 active 타겟 즉시 실행 (결과도 응답에 포함)
 *   POST /crawl-run {"target_id":1, "dry":true} → DB 저장 없이 결과만 반환 (프리뷰)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', 'Cache-Control': 'no-cache' };
const KST_OFFSET_MIN = 9 * 60;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

interface Target {
  id: number; brand: string; label: string; url: string; active: boolean;
  category1: string | null; category2: string | null; category3: string | null; category4: string | null;
  schedule_hour: number | null; schedule_minute: number | null; schedule_days: string[] | null;
  last_run_at: string | null; last_hash: string | null;
}
interface ScrapedOption { name: string; values: string[]; }
interface ScrapedSku { combo: string[]; price: number; orig_price: number; }
interface Nutrition {
  serving_size_g?: number; calories?: number;
  protein_g?: number; carb_g?: number; fat_g?: number;
  sugar_g?: number; saturated_fat_g?: number; trans_fat_g?: number;
  cholesterol_mg?: number; sodium_mg?: number;
}
interface ScrapedProduct {
  name: string; link: string;
  sale_price: number; original_price: number;
  thumbnail: string | null; short_desc: string | null;
  options: ScrapedOption[]; option_skus: ScrapedSku[];
  nutrition: Nutrition; breadcrumbs: string[];
  status?: 'new' | 'updated' | 'unchanged';
}

const krw = (v: unknown): number => {
  const n = +String(v ?? '').replace(/[^0-9.]/g, '');
  return isFinite(n) ? Math.round(n) : 0;
};
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const first = (s: string | undefined | null) => (s ?? '').trim();

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function fetchText(url: string, timeoutMs = 25000): Promise<string> {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// ─── 스케줄 매칭 ─────────────────────────────────────────
function isDue(t: Target, nowUtc: Date): boolean {
  if (!t.active || t.schedule_hour == null || !t.schedule_days?.length) return false;
  const kst = new Date(nowUtc.getTime() + KST_OFFSET_MIN * 60_000);
  if (!t.schedule_days.includes(WEEKDAYS[kst.getUTCDay()])) return false;
  const targetMin = t.schedule_hour * 60 + (t.schedule_minute ?? 0);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (Math.abs(nowMin - targetMin) > 7) return false;
  if (t.last_run_at && nowUtc.getTime() - new Date(t.last_run_at).getTime() < 30 * 60_000) return false;
  return true;
}

// ─── JSON-LD 추출 ────────────────────────────────────────
function collectLdJson(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* skip */ }
  }
  return out;
}
function flattenLd(roots: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      out.push(o);
      if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(walk);
      if (Array.isArray(o['hasVariant'])) (o['hasVariant'] as unknown[]).forEach(walk);
    }
  };
  roots.forEach(walk);
  return out;
}

function pickPrice(offers: unknown): { price: number; orig: number } {
  if (!offers) return { price: 0, orig: 0 };
  const arr = Array.isArray(offers) ? offers : [offers];
  let price = 0, orig = 0;
  for (const o of arr as Record<string, unknown>[]) {
    const p = krw(o.price ?? (o.lowPrice ?? 0));
    if (p > 0 && !price) price = p;
    const specs = o.priceSpecification;
    if (Array.isArray(specs)) {
      for (const s of specs as Record<string, unknown>[]) {
        const sp = krw(s.price);
        const type = String(s.priceType ?? '');
        if (type.toLowerCase().includes('strikethrough')) orig = Math.max(orig, sp);
        else if (!price) price = sp;
      }
    }
  }
  if (!orig) orig = price;
  return { price, orig };
}

function readAdditional(p: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const props = p.additionalProperty;
  if (Array.isArray(props)) {
    for (const x of props as Record<string, unknown>[]) {
      const name = String(x.name ?? '').trim();
      const value = String(x.value ?? '').trim();
      if (name && value) out[name] = value;
    }
  }
  const w = p.weight as Record<string, unknown> | undefined;
  if (w?.value) out['weight'] = `${w.value}${w.unitText ?? 'g'}`;
  return out;
}

// ─── 영양성분 추출 (1회 제공량 기준만) ────────────────────
const NUTRI_RE: Array<[RegExp, keyof Nutrition]> = [
  [/(?:열량|칼로리)[^0-9]{0,15}(\d+(?:\.\d+)?)\s*(?:kcal|㎉)/i, 'calories'],
  [/단백질[을은]?[^0-9]{0,10}(\d+(?:\.\d+)?)\s*g/i, 'protein_g'],
  [/탄수화물[을은]?[^0-9]{0,10}(\d+(?:\.\d+)?)\s*g/i, 'carb_g'],
  [/(?<!포화|트랜스)지방[을은]?[^0-9]{0,10}(\d+(?:\.\d+)?)\s*g/i, 'fat_g'],
  [/당류[을은]?[^0-9]{0,10}(\d+(?:\.\d+)?)\s*g/i, 'sugar_g'],
  [/포화지방[산]?[^0-9]{0,10}(\d+(?:\.\d+)?)\s*g/i, 'saturated_fat_g'],
  [/트랜스지방[산]?[^0-9]{0,10}(\d+(?:\.\d+)?)\s*g/i, 'trans_fat_g'],
  [/콜레스테롤[^0-9]{0,10}(\d+(?:\.\d+)?)\s*mg/i, 'cholesterol_mg'],
  [/나트륨[^0-9]{0,10}(\d+(?:\.\d+)?)\s*mg/i, 'sodium_mg'],
];

// 1회 제공량 구간을 찾아 그 문맥 내에서만 영양성분 추출.
// 다른 기준 (100g당/1봉지당/일일권장량) 구간은 제외.
function extractNutrition(text: string): Nutrition {
  const out: Nutrition = {};
  if (!text) return out;

  // 1회 제공량 값 먼저 추출
  const svRe = /1회\s*제공량[^0-9]*?(\d+(?:\.\d+)?)\s*(?:g|ml|그램)/i;
  const sv = text.match(svRe);
  if (sv) out.serving_size_g = parseFloat(sv[1]);

  // 1회 제공량 문맥 잘라내기: "1회 제공량" 이후 ~2000자, 단 "100g당/일일권장량/일일기준치" 앞까지.
  let ctx = '';
  if (sv) {
    const startIdx = (sv.index ?? 0);
    const slice = text.slice(startIdx, startIdx + 2500);
    const endRe = /(?:100\s*g\s*당|1일\s*영양성분\s*기준치|일일권장량|일일기준치|Nutritional\s*Information\s*per\s*100)/i;
    const endM = slice.match(endRe);
    ctx = endM ? slice.slice(0, endM.index ?? slice.length) : slice;
  } else {
    // 1회 제공량이 안 보이면 안전하게 "영양성분" 섹션만 사용
    const nutSec = text.match(/영양\s*정보[\s\S]{0,2000}|영양\s*성분[\s\S]{0,2000}/i);
    ctx = nutSec ? nutSec[0] : '';
  }
  if (!ctx) return out;

  for (const [re, key] of NUTRI_RE) {
    const m = ctx.match(re);
    if (m) (out as Record<string, number>)[key] = parseFloat(m[1]);
  }
  return out;
}

// ─── 브레드크럼 ─────────────────────────────────────────
function extractBreadcrumbs(lds: Record<string, unknown>[]): string[] {
  for (const o of lds) {
    if (o['@type'] === 'BreadcrumbList' && Array.isArray(o.itemListElement)) {
      return (o.itemListElement as Record<string, unknown>[])
        .map((x) => String((x.name ?? (x.item as Record<string, unknown>)?.name) ?? '').trim())
        .filter(Boolean);
    }
  }
  return [];
}

// ─── 상세 페이지 파싱 (JSON-LD 기반) ─────────────────────
function parseDetailPage(html: string, url: string): ScrapedProduct | null {
  const lds = flattenLd(collectLdJson(html));
  const products = lds.filter((o) => {
    const t = String(o['@type'] ?? '');
    return t === 'Product' || t === 'ProductGroup';
  });
  if (!products.length) return null;

  const group = products.find((p) => p['@type'] === 'ProductGroup') ?? products[0];
  const variants = products.filter((p) => p['@type'] === 'Product' && (p !== group));
  const name = String(group.name ?? '').trim();
  if (!name) return null;

  const topImg = Array.isArray(group.image) ? (group.image as string[])[0] : (group.image as string) ?? null;
  const topDesc = String(group.description ?? '').trim() || null;
  const short = topDesc ? topDesc.slice(0, 300) : null;

  const { price: topP, orig: topO } = pickPrice(group.offers);

  // 옵션 & SKU 조합 (각 variant에서 추출)
  const optionMap = new Map<string, Set<string>>();
  const orderedKeys: string[] = [];
  const rawSkus: Array<{ add: Record<string, string>; price: number; orig: number }> = [];
  const source = variants.length ? variants : [group];
  for (const v of source) {
    const add = readAdditional(v as Record<string, unknown>);
    for (const k of Object.keys(add)) {
      if (!add[k]) continue;
      if (!optionMap.has(k)) { optionMap.set(k, new Set()); orderedKeys.push(k); }
      optionMap.get(k)!.add(add[k]);
    }
    const { price, orig } = pickPrice((v as Record<string, unknown>).offers);
    if (price > 0) rawSkus.push({ add, price, orig });
  }

  // 차원 정규화: 일부 variant에 없는 dim은 coverage를 보고 제거
  //   coverage < 30% 인 옵션 그룹은 노이즈로 판단해 드랍 (e.g. myprotein weight 30/106)
  // 차원 유지: 10% 이상 나오는 dim은 옵션으로 유지. 부족한 SKU는 그 dim을 공란으로 두고 combo 길이를 줄여 저장.
  const skuCount = rawSkus.length;
  const finalKeys = orderedKeys.filter((k) => {
    const covered = rawSkus.filter((s) => s.add[k]).length;
    return skuCount === 0 || covered / skuCount >= 0.10;
  });

  // SKU 중복 제거: (combo, price) 키. combo는 값만 남기고 길이는 가변.
  // 동일 combo(차원 생략 포함)에서 가장 싼 가격만 유지.
  // myprotein처럼 같은 flavour에 weight 태그 누락으로 여러 가격이 겹쳐오는 경우 정리됨.
  const byCombo = new Map<string, ScrapedSku>();
  for (const s of rawSkus) {
    const combo = finalKeys.map((k) => s.add[k] ?? '').filter(Boolean);
    const key = combo.join('\x00');
    const ex = byCombo.get(key);
    if (!ex || s.price < ex.price) {
      byCombo.set(key, { combo, price: s.price, orig_price: s.orig });
    }
  }
  const skus: ScrapedSku[] = [...byCombo.values()];

  // 실제 SKU combo에 등장한 값만 option.values 에 유지 (빈 값 제거)
  const usedVals: Record<string, Set<string>> = {};
  finalKeys.forEach((k) => { usedVals[k] = new Set(); });
  for (const s of skus) {
    for (let i = 0; i < finalKeys.length; i++) {
      if (s.combo[i]) usedVals[finalKeys[i]].add(s.combo[i]);
    }
  }
  const options: ScrapedOption[] = finalKeys
    .map((k) => ({ name: k, values: [...usedVals[k]] }))
    .filter((o) => o.values.length > 0);

  // 대표 가격
  let sale = topP;
  let orig = topO;
  if (!sale && skus.length) {
    sale = Math.min(...skus.map((s) => s.price));
    orig = Math.max(...skus.map((s) => s.orig_price));
  }
  if (!sale) return null;

  // 영양성분 + 브레드크럼
  const textBody = stripHtml(html.slice(0, 400000));
  const nutrition = extractNutrition(topDesc + ' ' + textBody);
  const breadcrumbs = extractBreadcrumbs(lds);

  return {
    name, link: url,
    sale_price: sale, original_price: orig || sale,
    thumbnail: topImg,
    short_desc: short,
    options, option_skus: skus,
    nutrition, breadcrumbs,
  };
}

// ─── Shopify 목록 ───────────────────────────────────────
interface ShopifyProduct {
  title: string; handle: string; body_html: string;
  images: { src: string }[]; options?: { name: string; values: string[] }[];
  variants: { price: string; compare_at_price: string | null; option1: string | null; option2: string | null; option3: string | null }[];
}
function shopifyBase(u: string): string | null {
  try {
    const x = new URL(u);
    const parts = x.pathname.split('/').filter(Boolean);
    const locale = parts[0] && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0]) ? `/${parts[0]}` : '';
    return `${x.origin}${locale}`;
  } catch { return null; }
}
async function isShopify(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/products.json?limit=1`, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j?.products);
  } catch { return false; }
}
function mapShopify(p: ShopifyProduct, base: string): ScrapedProduct | null {
  if (!p.variants?.length) return null;
  const firstV = p.variants.find((v) => krw(v.price) > 0) ?? p.variants[0];
  const sale = krw(firstV.price);
  if (!sale) return null;
  const orig = krw(firstV.compare_at_price) || sale;
  const opts: ScrapedOption[] = (p.options ?? [])
    .filter((o) => o.name && o.name.toLowerCase() !== 'title' && o.values?.length &&
      !(o.values.length === 1 && o.values[0]?.toLowerCase() === 'default title'))
    .map((o) => ({ name: o.name, values: o.values.slice(0, 50) }));
  const skus: ScrapedSku[] = [];
  for (const v of p.variants) {
    const pr = krw(v.price); if (!pr) continue;
    const combo = [v.option1, v.option2, v.option3].filter((x): x is string => !!x && x.toLowerCase() !== 'default title');
    if (opts.length && !combo.length) continue;
    skus.push({ combo, price: pr, orig_price: krw(v.compare_at_price) || pr });
  }
  return {
    name: p.title.trim(),
    link: `${base}/products/${p.handle}`,
    sale_price: sale, original_price: orig,
    thumbnail: p.images?.[0]?.src ?? null,
    short_desc: stripHtml(p.body_html ?? '').slice(0, 300) || null,
    options: opts, option_skus: opts.length ? skus : [],
    nutrition: extractNutrition(stripHtml(p.body_html ?? '')),
    breadcrumbs: [],
  };
}
async function scrapeShopifyListing(url: string): Promise<ScrapedProduct[]> {
  const base = shopifyBase(url); if (!base) return [];
  let handle: string | null = null;
  try { handle = new URL(url).pathname.match(/\/collections\/([^/]+)/)?.[1] ?? null; } catch { /* ignore */ }
  const ep = handle ? `${base}/collections/${handle}/products.json` : `${base}/products.json`;
  const out: ScrapedProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const r = await fetch(`${ep}?limit=250&page=${page}`, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (!r.ok) break;
      const d = await r.json() as { products?: ShopifyProduct[] };
      if (!d.products?.length) break;
      for (const p of d.products) { const m = mapShopify(p, base); if (m) out.push(m); }
      if (d.products.length < 250) break;
    } catch { break; }
  }
  return out;
}

// ─── HTML 목록 (링크만 뽑아서 상세 진입) ──────────────────
async function scrapeListingAsDetails(url: string): Promise<ScrapedProduct[]> {
  let html = '';
  try { html = await fetchText(url); } catch { return []; }
  const origin = new URL(url).origin;
  const seen = new Set<string>();
  const detailLinks: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1];
    if (!/\/p\/|\/product\/|\/goods\/|\/products\//i.test(href)) continue;
    const abs = href.startsWith('http') ? href : (href.startsWith('/') ? origin + href : null);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    detailLinks.push(abs);
    if (detailLinks.length >= 24) break;
  }
  const out: ScrapedProduct[] = [];
  for (const link of detailLinks) {
    try {
      const h = await fetchText(link, 18000);
      const p = parseDetailPage(h, link);
      if (p) out.push(p);
    } catch { /* skip */ }
  }
  return out;
}

// ─── 1개 타겟 실행 ──────────────────────────────────────
function isDetailUrl(u: string): boolean {
  try { return /\/p\/|\/product\/|\/products\/|\/goods\/goods_view/i.test(new URL(u).pathname); }
  catch { return false; }
}

async function runTarget(t: Target, dry = false): Promise<{ products: ScrapedProduct[]; alerts: number; error?: string }> {
  const started = new Date().toISOString();
  try {
    let products: ScrapedProduct[] = [];

    if (isDetailUrl(t.url)) {
      const html = await fetchText(t.url);
      const p = parseDetailPage(html, t.url);
      if (p) products = [p];
    } else {
      const base = shopifyBase(t.url);
      if (base && await isShopify(base)) {
        products = await scrapeShopifyListing(t.url);
      }
      if (!products.length) {
        products = await scrapeListingAsDetails(t.url);
      }
    }

    const validProducts = products.filter((p) => p.sale_price > 0);

    const links = validProducts.map((p) => p.link);
    const { data: existing } = links.length
      ? await supabase.from('products').select('id, link, sale_price, original_price').in('link', links)
      : { data: [] as { id: number; link: string; sale_price: number; original_price: number }[] };
    const exMap = new Map((existing ?? []).map((e) => [e.link, e]));

    const alerts: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    const brandLabel = t.label || t.brand;

    const rows = validProducts.map((p) => {
      const ex = exMap.get(p.link);
      if (!ex) p.status = 'new';
      else if (ex.sale_price !== p.sale_price || ex.original_price !== p.original_price) p.status = 'updated';
      else p.status = 'unchanged';

      if (p.status === 'new') {
        alerts.push({ target_id: t.id, brand: t.brand, label: '새 상품 발견', url: p.link, seen: false,
          snippet: `${p.name} | ₩${p.sale_price.toLocaleString()}` });
      } else if (p.status === 'updated' && ex) {
        const parts = [p.name];
        if (ex.sale_price !== p.sale_price) parts.push(`판매가 ₩${ex.sale_price.toLocaleString()} → ₩${p.sale_price.toLocaleString()}`);
        if (ex.original_price !== p.original_price) parts.push(`정가 ₩${ex.original_price.toLocaleString()} → ₩${p.original_price.toLocaleString()}`);
        alerts.push({ target_id: t.id, brand: t.brand, label: '가격 변동', url: p.link, seen: false, snippet: parts.join(' | ') });
      }

      return {
        name: p.name, brand: t.brand, store: brandLabel, emoji: '💊',
        thumbnail: p.thumbnail, short_desc: p.short_desc,
        original_price: p.original_price || p.sale_price, sale_price: p.sale_price,
        link: p.link, scrape_url: t.url,
        category1: t.category1, category2: t.category2, category3: t.category3, category4: t.category4,
        options: p.options, option_skus: p.option_skus,
        calories: p.nutrition.calories ?? null, serving_size_g: p.nutrition.serving_size_g ?? null,
        protein_g: p.nutrition.protein_g ?? null, carb_g: p.nutrition.carb_g ?? null, fat_g: p.nutrition.fat_g ?? null,
        sugar_g: p.nutrition.sugar_g ?? null, saturated_fat_g: p.nutrition.saturated_fat_g ?? null,
        trans_fat_g: p.nutrition.trans_fat_g ?? null, cholesterol_mg: p.nutrition.cholesterol_mg ?? null,
        sodium_mg: p.nutrition.sodium_mg ?? null, updated_at: now,
      };
    });

    if (!dry && rows.length) {
      const { error } = await supabase.from('products').upsert(rows, { onConflict: 'link', ignoreDuplicates: false });
      if (error) throw new Error(`upsert: ${error.message}`);
    }
    if (!dry && alerts.length) await supabase.from('crawl_alerts').insert(alerts);

    const hash = await sha256(validProducts.map((p) => `${p.link}|${p.sale_price}`).sort().join('\n'));
    if (!dry) {
      await supabase.from('crawl_targets').update({
        last_hash: hash, last_checked_at: now, last_run_at: now, last_run_status: 'ok',
        last_run_summary: { products: rows.length, alerts: alerts.length, ran_at: started },
      }).eq('id', t.id);
    }

    return { products: validProducts, alerts: alerts.length };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (!dry) {
      await supabase.from('crawl_targets').update({
        last_run_at: new Date().toISOString(), last_run_status: 'error',
        last_run_summary: { error: msg, ran_at: started },
      }).eq('id', t.id);
    }
    return { products: [], alerts: 0, error: msg };
  }
}

// ─── HTTP 엔트리 ──────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  let body: { force?: boolean; target_id?: number; dry?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }

  try {
    const { data: targets, error } = await supabase.from('crawl_targets').select('*').eq('active', true);
    if (error) throw new Error(error.message);

    const now = new Date();
    let picked: Target[] = [];
    if (body.target_id) picked = (targets ?? []).filter((t) => t.id === body.target_id);
    else if (body.force) picked = targets ?? [];
    else picked = (targets ?? []).filter((t) => isDue(t as Target, now));

    let totalProducts = 0, totalAlerts = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const t of picked) {
      const r = await runTarget(t as Target, !!body.dry);
      totalProducts += r.products.length;
      totalAlerts += r.alerts;
      results.push({
        target_id: t.id, label: t.label || t.brand, brand: t.brand, url: t.url,
        category1: t.category1, category2: t.category2, category3: t.category3, category4: t.category4,
        products: r.products, alerts: r.alerts, error: r.error ?? null,
      });
    }

    if (!body.dry) {
      await supabase.from('crawl_logs').insert({
        ran_at: now.toISOString(),
        summary: { type: 'crawl-run', checked: picked.length, products: totalProducts, alerts: totalAlerts, force: !!body.force },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, checked: picked.length, products: totalProducts, alerts: totalAlerts, results }),
      { headers: CORS },
    );
  } catch (err) {
    console.error('[crawl-run] FATAL:', err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message ?? String(err) }), { status: 500, headers: CORS });
  }
});
