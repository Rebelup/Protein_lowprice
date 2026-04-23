// crawl-run v5 — schedule-aware scraper
// - parse Shopify /products.json and generic detail pages via JSON-LD
// - dedupe SKUs per combo (keep cheapest)
// - infer missing weight from price tier when the product has >=1 tagged weight
// - per-serving nutrition extraction (anchored at "1회 제공량")
// - canonical link strips tracking params so upserts don't duplicate

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const H = { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', 'Cache-Control': 'no-cache' };
const KST = 9 * 60;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type Rec = Record<string, unknown>;

interface Target {
  id: number; brand: string; label: string; url: string; active: boolean;
  category1: string | null; category2: string | null; category3: string | null; category4: string | null;
  schedule_hour: number | null; schedule_minute: number | null; schedule_days: string[] | null;
  last_run_at: string | null; last_hash: string | null;
}
interface Opt { name: string; values: string[]; }
interface Sku { combo: string[]; price: number; orig_price: number; }
interface Nutri {
  serving_size_g?: number; calories?: number;
  protein_g?: number; carb_g?: number; fat_g?: number;
  sugar_g?: number; saturated_fat_g?: number; trans_fat_g?: number;
  cholesterol_mg?: number; sodium_mg?: number;
}
interface Prod {
  name: string; link: string;
  sale_price: number; original_price: number;
  thumbnail: string | null; short_desc: string | null;
  options: Opt[]; option_skus: Sku[];
  nutrition: Nutri; breadcrumbs: string[];
  status?: 'new' | 'updated' | 'unchanged';
}

const krw = (v: unknown) => { const n = +String(v ?? '').replace(/[^0-9.]/g, ''); return Number.isFinite(n) ? Math.round(n) : 0; };
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function sha256(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function fetchText(url: string, ms = 25000) {
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function isDue(t: Target, now: Date): boolean {
  if (!t.active || t.schedule_hour == null || !t.schedule_days?.length) return false;
  const kst = new Date(now.getTime() + KST * 60_000);
  if (!t.schedule_days.includes(DAYS[kst.getUTCDay()])) return false;
  const target = t.schedule_hour * 60 + (t.schedule_minute ?? 0);
  const cur = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  if (Math.abs(cur - target) > 7) return false;
  if (t.last_run_at && now.getTime() - new Date(t.last_run_at).getTime() < 30 * 60_000) return false;
  return true;
}

function canonical(u: string): string {
  try {
    const url = new URL(u);
    const drop = /^(affil|thg_ppc_campaign|gclid|fbclid|utm_|source|ref|tag|variation)/i;
    const keep: [string, string][] = [];
    url.searchParams.forEach((v, k) => { if (!drop.test(k)) keep.push([k, v]); });
    url.search = '';
    for (const [k, v] of keep) url.searchParams.append(k, v);
    return url.toString();
  } catch { return u; }
}

function collectLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) { try { out.push(JSON.parse(m[1].trim())); } catch { /* skip */ } }
  return out;
}
function flatten(roots: unknown[]): Rec[] {
  const out: Rec[] = [];
  const walk = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') {
      const o = v as Rec;
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
  for (const o of arr as Rec[]) {
    const p = krw(o.price ?? o.lowPrice ?? 0);
    if (p > 0 && !price) price = p;
    const specs = o.priceSpecification;
    if (Array.isArray(specs)) {
      for (const s of specs as Rec[]) {
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

function readAdd(p: Rec): Record<string, string> {
  const out: Record<string, string> = {};
  const props = p.additionalProperty;
  if (Array.isArray(props)) {
    for (const x of props as Rec[]) {
      const n = String(x.name ?? '').trim();
      const v = String(x.value ?? '').trim();
      if (n && v) out[n] = v;
    }
  }
  const w = p.weight as Rec | undefined;
  if (w?.value) out['weight'] = `${w.value}${w.unitText ?? 'g'}`;
  return out;
}

const NUTRI_RE: Array<[RegExp, keyof Nutri]> = [
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
function extractNutri(text: string): Nutri {
  const out: Nutri = {};
  if (!text) return out;
  const svRe = /1회\s*제공량[^0-9]*?(\d+(?:\.\d+)?)\s*(?:g|ml|그램)/i;
  const sv = text.match(svRe);
  if (sv) out.serving_size_g = parseFloat(sv[1]);
  let ctx = '';
  if (sv) {
    const slice = text.slice(sv.index ?? 0, (sv.index ?? 0) + 2500);
    const end = slice.match(/(?:100\s*g\s*당|1일\s*영양성분\s*기준치|일일권장량|일일기준치|per\s*100)/i);
    ctx = end ? slice.slice(0, end.index ?? slice.length) : slice;
  } else {
    const sec = text.match(/영양\s*정보[\s\S]{0,2000}|영양\s*성분[\s\S]{0,2000}/i);
    ctx = sec ? sec[0] : '';
  }
  if (!ctx) return out;
  for (const [re, key] of NUTRI_RE) {
    const m = ctx.match(re);
    if (m) (out as Record<string, number>)[key] = parseFloat(m[1]);
  }
  return out;
}

function extractCrumbs(lds: Rec[]): string[] {
  for (const o of lds) {
    if (o['@type'] === 'BreadcrumbList' && Array.isArray(o.itemListElement)) {
      return (o.itemListElement as Rec[])
        .map((x) => String((x.name ?? (x.item as Rec)?.name) ?? '').trim())
        .filter(Boolean);
    }
  }
  return [];
}

// Price-tier weight inference:
// Build (price -> weight) lookup from tagged variants. For each untagged SKU,
// find the tagged price within +/- 5% and adopt its weight. If no match, the
// SKU stays without weight and UI falls back to "default" cluster.
function inferWeight(rawSkus: Array<{ add: Record<string, string>; price: number }>, key: string): void {
  const tagged: Array<{ price: number; val: string }> = [];
  for (const s of rawSkus) if (s.add[key]) tagged.push({ price: s.price, val: s.add[key] });
  if (!tagged.length) return;
  for (const s of rawSkus) {
    if (s.add[key]) continue;
    let best: { diff: number; val: string } | null = null;
    for (const t of tagged) {
      const diff = Math.abs(t.price - s.price) / Math.max(t.price, s.price);
      if (diff > 0.05) continue;
      if (!best || diff < best.diff) best = { diff, val: t.val };
    }
    if (best) s.add[key] = best.val;
  }
}

function parseDetail(html: string, url: string): Prod | null {
  const lds = flatten(collectLd(html));
  const products = lds.filter((o) => ['Product', 'ProductGroup'].includes(String(o['@type'] ?? '')));
  if (!products.length) return null;

  const group = products.find((p) => p['@type'] === 'ProductGroup') ?? products[0];
  const variants = products.filter((p) => p['@type'] === 'Product' && p !== group);
  const name = String(group.name ?? '').trim();
  if (!name) return null;

  const thumb = Array.isArray(group.image) ? (group.image as string[])[0] : (group.image as string) ?? null;
  const desc = String(group.description ?? '').trim() || null;
  const short = desc ? desc.slice(0, 300) : null;
  const { price: topP, orig: topO } = pickPrice(group.offers);

  const orderedKeys: string[] = [];
  const rawSkus: Array<{ add: Record<string, string>; price: number; orig: number }> = [];
  const source = variants.length ? variants : [group];
  for (const v of source) {
    const add = readAdd(v as Rec);
    for (const k of Object.keys(add)) if (!orderedKeys.includes(k)) orderedKeys.push(k);
    const { price, orig } = pickPrice((v as Rec).offers);
    if (price > 0) rawSkus.push({ add, price, orig });
  }

  // Price-tier inference (only for dims with partial coverage)
  for (const k of orderedKeys) {
    const cov = rawSkus.filter((s) => s.add[k]).length / Math.max(rawSkus.length, 1);
    if (cov > 0.1 && cov < 1) inferWeight(rawSkus, k);
  }

  // Keep dims with >=10% coverage after inference
  const skuN = rawSkus.length;
  const finalKeys = orderedKeys.filter((k) => {
    const cov = rawSkus.filter((s) => s.add[k]).length;
    return skuN === 0 || cov / skuN >= 0.1;
  });

  // Dedupe per combo, keep cheapest
  const byCombo = new Map<string, Sku>();
  for (const s of rawSkus) {
    const combo = finalKeys.map((k) => s.add[k] ?? '').filter(Boolean);
    const key = combo.join('\x00');
    const ex = byCombo.get(key);
    if (!ex || s.price < ex.price) byCombo.set(key, { combo, price: s.price, orig_price: s.orig });
  }
  const skus = [...byCombo.values()];

  // Only keep option values that actually appear in a SKU combo
  const used: Record<string, Set<string>> = {};
  finalKeys.forEach((k) => { used[k] = new Set(); });
  for (const s of skus) for (let i = 0; i < finalKeys.length; i++) if (s.combo[i]) used[finalKeys[i]].add(s.combo[i]);
  const options: Opt[] = finalKeys.map((k) => ({ name: k, values: [...used[k]] })).filter((o) => o.values.length > 0);

  let sale = topP, orig = topO;
  if (!sale && skus.length) {
    sale = Math.min(...skus.map((s) => s.price));
    orig = Math.max(...skus.map((s) => s.orig_price));
  }
  if (!sale) return null;

  const body = strip(html.slice(0, 400000));
  const nutrition = extractNutri((desc ?? '') + ' ' + body);
  return {
    name, link: canonical(url),
    sale_price: sale, original_price: orig || sale,
    thumbnail: thumb, short_desc: short,
    options, option_skus: skus,
    nutrition, breadcrumbs: extractCrumbs(lds),
  };
}

// Shopify
interface ShopP {
  title: string; handle: string; body_html: string;
  images: { src: string }[]; options?: { name: string; values: string[] }[];
  variants: { price: string; compare_at_price: string | null; option1: string | null; option2: string | null; option3: string | null }[];
}
function shopBase(u: string): string | null {
  try {
    const x = new URL(u);
    const parts = x.pathname.split('/').filter(Boolean);
    const loc = parts[0] && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0]) ? `/${parts[0]}` : '';
    return `${x.origin}${loc}`;
  } catch { return null; }
}
async function isShop(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/products.json?limit=1`, { headers: H, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j?.products);
  } catch { return false; }
}
function mapShop(p: ShopP, base: string): Prod | null {
  if (!p.variants?.length) return null;
  const fv = p.variants.find((v) => krw(v.price) > 0) ?? p.variants[0];
  const sale = krw(fv.price);
  if (!sale) return null;
  const orig = krw(fv.compare_at_price) || sale;
  const opts: Opt[] = (p.options ?? [])
    .filter((o) => o.name && o.name.toLowerCase() !== 'title' && o.values?.length &&
      !(o.values.length === 1 && o.values[0]?.toLowerCase() === 'default title'))
    .map((o) => ({ name: o.name, values: o.values.slice(0, 50) }));
  const byCombo = new Map<string, Sku>();
  for (const v of p.variants) {
    const pr = krw(v.price); if (!pr) continue;
    const combo = [v.option1, v.option2, v.option3].filter((x): x is string => !!x && x.toLowerCase() !== 'default title');
    if (opts.length && !combo.length) continue;
    const key = combo.join('\x00');
    const ex = byCombo.get(key);
    const op = krw(v.compare_at_price) || pr;
    if (!ex || pr < ex.price) byCombo.set(key, { combo, price: pr, orig_price: op });
  }
  return {
    name: p.title.trim(),
    link: canonical(`${base}/products/${p.handle}`),
    sale_price: sale, original_price: orig,
    thumbnail: p.images?.[0]?.src ?? null,
    short_desc: strip(p.body_html ?? '').slice(0, 300) || null,
    options: opts, option_skus: opts.length ? [...byCombo.values()] : [],
    nutrition: extractNutri(strip(p.body_html ?? '')),
    breadcrumbs: [],
  };
}
async function scrapeShop(url: string): Promise<Prod[]> {
  const base = shopBase(url); if (!base) return [];
  let handle: string | null = null;
  try { handle = new URL(url).pathname.match(/\/collections\/([^/]+)/)?.[1] ?? null; } catch { /* ignore */ }
  const ep = handle ? `${base}/collections/${handle}/products.json` : `${base}/products.json`;
  const out: Prod[] = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const r = await fetch(`${ep}?limit=250&page=${page}`, { headers: H, signal: AbortSignal.timeout(20000) });
      if (!r.ok) break;
      const d = await r.json() as { products?: ShopP[] };
      if (!d.products?.length) break;
      for (const p of d.products) { const m = mapShop(p, base); if (m) out.push(m); }
      if (d.products.length < 250) break;
    } catch { break; }
  }
  const byLink = new Map<string, Prod>();
  for (const p of out) if (!byLink.has(p.link)) byLink.set(p.link, p);
  return [...byLink.values()];
}

async function scrapeListing(url: string): Promise<Prod[]> {
  let html = '';
  try { html = await fetchText(url); } catch { return []; }
  const origin = new URL(url).origin;
  const seen = new Set<string>();
  const links: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  for (const m of html.matchAll(re)) {
    let href = m[1];
    const q = href.indexOf('?');
    if (q !== -1) href = href.slice(0, q);
    if (!/\/p\/|\/product\/|\/goods\/|\/products\//i.test(href)) continue;
    const abs = href.startsWith('http') ? href : (href.startsWith('/') ? origin + href : null);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    links.push(abs);
    if (links.length >= 24) break;
  }
  const out: Prod[] = [];
  for (const link of links) {
    try {
      const h = await fetchText(link, 18000);
      const p = parseDetail(h, link);
      if (p) out.push(p);
    } catch { /* skip */ }
  }
  return out;
}

function isDetail(u: string): boolean {
  try { return /\/p\/|\/product\/|\/products\/|\/goods\/goods_view/i.test(new URL(u).pathname); }
  catch { return false; }
}

async function runTarget(t: Target, dry = false): Promise<{ products: Prod[]; alerts: number; error?: string }> {
  const started = new Date().toISOString();
  try {
    let products: Prod[] = [];
    if (isDetail(t.url)) {
      const html = await fetchText(t.url);
      const p = parseDetail(html, t.url);
      if (p) products = [p];
    } else {
      const base = shopBase(t.url);
      if (base && await isShop(base)) products = await scrapeShop(t.url);
      if (!products.length) products = await scrapeListing(t.url);
    }
    const byLink = new Map<string, Prod>();
    for (const p of products) if (!byLink.has(p.link)) byLink.set(p.link, p);
    const valid = [...byLink.values()].filter((p) => p.sale_price > 0);

    const links = valid.map((p) => p.link);
    const { data: existing } = links.length
      ? await db.from('products').select('id, link, sale_price, original_price').in('link', links)
      : { data: [] as { id: number; link: string; sale_price: number; original_price: number }[] };
    const ex = new Map((existing ?? []).map((e) => [e.link, e]));

    const alerts: Rec[] = [];
    const now = new Date().toISOString();
    const label = t.label || t.brand;
    const rows = valid.map((p) => {
      const e = ex.get(p.link);
      if (!e) p.status = 'new';
      else if (e.sale_price !== p.sale_price || e.original_price !== p.original_price) p.status = 'updated';
      else p.status = 'unchanged';
      if (p.status === 'new') {
        alerts.push({
          target_id: t.id, brand: t.brand, label: '새 상품 발견', url: p.link, seen: false,
          snippet: `${p.name} | ₩${p.sale_price.toLocaleString()}`,
        });
      } else if (p.status === 'updated' && e) {
        const parts = [p.name];
        if (e.sale_price !== p.sale_price) parts.push(`판매가 ₩${e.sale_price.toLocaleString()} → ₩${p.sale_price.toLocaleString()}`);
        if (e.original_price !== p.original_price) parts.push(`정가 ₩${e.original_price.toLocaleString()} → ₩${p.original_price.toLocaleString()}`);
        alerts.push({
          target_id: t.id, brand: t.brand, label: '가격 변동', url: p.link, seen: false,
          snippet: parts.join(' | '),
        });
      }
      return {
        name: p.name, brand: t.brand, store: label, emoji: '💊',
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
      const { error } = await db.from('products').upsert(rows, { onConflict: 'link', ignoreDuplicates: false });
      if (error) throw new Error(`upsert: ${error.message}`);
    }
    if (!dry && alerts.length) await db.from('crawl_alerts').insert(alerts);

    const hash = await sha256(valid.map((p) => `${p.link}|${p.sale_price}`).sort().join('\n'));
    if (!dry) {
      await db.from('crawl_targets').update({
        last_hash: hash, last_checked_at: now, last_run_at: now, last_run_status: 'ok',
        last_run_summary: { products: rows.length, alerts: alerts.length, ran_at: started },
      }).eq('id', t.id);
    }
    return { products: valid, alerts: alerts.length };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (!dry) {
      await db.from('crawl_targets').update({
        last_run_at: new Date().toISOString(), last_run_status: 'error',
        last_run_summary: { error: msg, ran_at: started },
      }).eq('id', t.id);
    }
    return { products: [], alerts: 0, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  let body: { force?: boolean; target_id?: number; dry?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }
  try {
    const { data: targets, error } = await db.from('crawl_targets').select('*').eq('active', true);
    if (error) throw new Error(error.message);
    const now = new Date();
    let picked: Target[] = [];
    if (body.target_id) picked = (targets ?? []).filter((t) => t.id === body.target_id);
    else if (body.force) picked = targets ?? [];
    else picked = (targets ?? []).filter((t) => isDue(t as Target, now));

    let totalP = 0, totalA = 0;
    const results: Rec[] = [];
    for (const t of picked) {
      const r = await runTarget(t as Target, !!body.dry);
      totalP += r.products.length;
      totalA += r.alerts;
      results.push({
        target_id: t.id, label: t.label || t.brand, brand: t.brand, url: t.url,
        admin_title: (t as Rec).admin_title ?? null,
        category1: t.category1, category2: t.category2, category3: t.category3, category4: t.category4,
        products: r.products, alerts: r.alerts, error: r.error ?? null,
      });
    }
    if (!body.dry) {
      await db.from('crawl_logs').insert({
        ran_at: now.toISOString(),
        summary: { type: 'crawl-run', checked: picked.length, products: totalP, alerts: totalA, force: !!body.force },
      });
    }
    return new Response(
      JSON.stringify({ ok: true, checked: picked.length, products: totalP, alerts: totalA, results }),
      { headers: CORS },
    );
  } catch (err) {
    console.error('[crawl-run]', err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message ?? String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
