/**
 * crawl-run — 스케줄에 따라 모니터링 대상을 크롤링.
 * - crawl_targets 기반 (브랜드/URL/스케줄/카테고리 매핑 포함)
 * - 목록 페이지 → 상품 상세 → 가격·이미지·옵션 추출
 * - products 테이블에 upsert (link 키 기준)
 * - 카테고리는 target.category1..4 로 고정 매핑 (관리자가 정해둔 것만 사용)
 * - 변경/신규 발생 시 crawl_alerts 기록
 *
 * 호출 형태:
 *   POST /crawl-run               → 스케줄 체크 (현재 KST 시각과 일치하는 타겟만)
 *   POST /crawl-run {"force":true} → 모든 active 타겟 즉시 실행
 *   POST /crawl-run {"target_id":1} → 특정 타겟 즉시 실행
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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
  id: number;
  brand: string;
  label: string;
  url: string;
  active: boolean;
  category1: string | null;
  category2: string | null;
  category3: string | null;
  category4: string | null;
  schedule_hour: number | null;
  schedule_minute: number | null;
  schedule_days: string[] | null;
  last_run_at: string | null;
  last_hash: string | null;
}

interface ScrapedOption { name: string; values: string[]; }
interface ScrapedSku { combo: string[]; price: number; orig_price: number; }
interface ScrapedProduct {
  name: string;
  link: string;
  sale_price: number;
  original_price: number;
  thumbnail: string | null;
  short_desc: string | null;
  options: ScrapedOption[];
  option_skus: ScrapedSku[];
}

const krw = (v: unknown): number => {
  const n = +String(v ?? '').replace(/[^0-9]/g, '');
  return isFinite(n) ? n : 0;
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}
async function fetchJson<T>(url: string, timeoutMs = 20000): Promise<T> {
  return JSON.parse(await fetchText(url, timeoutMs)) as T;
}

// ─── 스케줄 판정 ───────────────────────────────────────────
function isDue(t: Target, nowUtc: Date): boolean {
  if (!t.active) return false;
  if (t.schedule_hour == null) return false;
  if (!t.schedule_days || !t.schedule_days.length) return false;
  const kst = new Date(nowUtc.getTime() + KST_OFFSET_MIN * 60_000);
  const weekday = WEEKDAYS[kst.getUTCDay()];
  if (!t.schedule_days.includes(weekday)) return false;
  const hh = kst.getUTCHours();
  const mm = kst.getUTCMinutes();
  const targetMin = t.schedule_hour * 60 + (t.schedule_minute ?? 0);
  const nowMin = hh * 60 + mm;
  if (Math.abs(nowMin - targetMin) > 7) return false;
  if (t.last_run_at) {
    const last = new Date(t.last_run_at).getTime();
    if (nowUtc.getTime() - last < 30 * 60_000) return false;
  }
  return true;
}

// ─── Shopify 크롤러 ───────────────────────────────────────
interface ShopifyVariant {
  price: string; compare_at_price: string | null;
  option1: string | null; option2: string | null; option3: string | null;
  available: boolean;
}
interface ShopifyProduct {
  title: string; handle: string; body_html: string;
  images: { src: string }[];
  options?: { name: string; values: string[] }[];
  variants: ShopifyVariant[];
}

function shopifyBase(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // /ko-kr/collections/foo → base = origin + /ko-kr
    const locale = parts[0] && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0]) ? `/${parts[0]}` : '';
    return `${u.origin}${locale}`;
  } catch {
    return null;
  }
}

async function isShopify(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/products.json?limit=1`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j?.products);
  } catch {
    return false;
  }
}

function mapShopifyProduct(p: ShopifyProduct, base: string): ScrapedProduct | null {
  if (!p.variants?.length) return null;
  const link = `${base}/products/${p.handle}`;
  const opts: ScrapedOption[] = (p.options || [])
    .filter((o) => o.name && o.name.toLowerCase() !== 'title' && o.values?.length && !(o.values.length === 1 && o.values[0]?.toLowerCase() === 'default title'))
    .map((o) => ({ name: o.name, values: o.values.slice(0, 50) }));

  const skus: ScrapedSku[] = [];
  for (const v of p.variants) {
    const sale = krw(v.price);
    if (!sale) continue;
    const orig = krw(v.compare_at_price) || sale;
    const combo = [v.option1, v.option2, v.option3].filter((x): x is string => !!x && x.toLowerCase() !== 'default title');
    if (!combo.length && opts.length) continue;
    skus.push({ combo, price: sale, orig_price: orig });
  }
  const firstPriced = p.variants.find((v) => krw(v.price) > 0) ?? p.variants[0];
  const sale = krw(firstPriced?.price);
  if (!sale) return null;
  const orig = krw(firstPriced?.compare_at_price) || sale;
  const shortDesc = (p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || null;

  return {
    name: p.title.trim(),
    link,
    sale_price: sale,
    original_price: orig,
    thumbnail: p.images?.[0]?.src ?? null,
    short_desc: shortDesc,
    options: opts,
    option_skus: opts.length ? skus : [],
  };
}

async function scrapeShopifyListing(listingUrl: string): Promise<ScrapedProduct[]> {
  const base = shopifyBase(listingUrl);
  if (!base) return [];
  const out: ScrapedProduct[] = [];

  let collectionHandle: string | null = null;
  try {
    const u = new URL(listingUrl);
    const m = u.pathname.match(/\/collections\/([^/]+)/);
    if (m) collectionHandle = m[1];
  } catch { /* ignore */ }

  const endpoint = collectionHandle
    ? `${base}/collections/${collectionHandle}/products.json`
    : `${base}/products.json`;

  for (let page = 1; page <= 10; page++) {
    try {
      const d = await fetchJson<{ products: ShopifyProduct[] }>(`${endpoint}?limit=250&page=${page}`);
      if (!d.products?.length) break;
      for (const p of d.products) {
        const mapped = mapShopifyProduct(p, base);
        if (mapped) out.push(mapped);
      }
      if (d.products.length < 250) break;
    } catch {
      break;
    }
  }
  return out;
}

// ─── NEXT_DATA (myprotein 등) 크롤러 ─────────────────────
interface NextDataProduct {
  title?: string; name?: string; url?: string; canonicalUrl?: string;
  price?: { value?: unknown; rrp?: unknown };
  images?: { list?: { url: string }[] };
  variants?: { sku?: string; price?: { value?: unknown }; options?: { value: string }[] }[];
}
async function scrapeNextDataListing(listingUrl: string): Promise<ScrapedProduct[]> {
  const out: ScrapedProduct[] = [];
  try {
    const html = await fetchText(listingUrl);
    const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
    if (!m) return [];
    const j = JSON.parse(m[1]);
    const pp = (j?.props?.pageProps ?? {}) as Record<string, unknown>;
    const list = ((pp?.products as Record<string, unknown> | undefined)?.products
      ?? (pp?.categoryPage as Record<string, unknown> | undefined)?.products
      ?? []) as NextDataProduct[];
    const origin = new URL(listingUrl).origin;
    for (const p of list) {
      const sale = krw(p?.price?.value ?? 0);
      if (!sale) continue;
      const orig = krw(p?.price?.rrp ?? sale) || sale;
      const rel = String(p?.url ?? p?.canonicalUrl ?? '');
      out.push({
        name: String(p.title ?? p.name ?? '').trim(),
        link: rel.startsWith('http') ? rel : `${origin}${rel}`,
        sale_price: sale,
        original_price: orig,
        thumbnail: p?.images?.list?.[0]?.url ?? null,
        short_desc: null,
        options: [],
        option_skus: [],
      });
    }
  } catch { /* empty */ }
  return out;
}

// ─── 범용 HTML 목록 크롤러 (fallback) ───────────────────
async function scrapeGenericListing(listingUrl: string): Promise<ScrapedProduct[]> {
  const out: ScrapedProduct[] = [];
  const seen = new Set<string>();
  try {
    const html = await fetchText(listingUrl);
    const origin = new URL(listingUrl).origin;
    const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g;
    for (const m of html.matchAll(anchorRe)) {
      const href = m[1];
      if (!/goods|product|item/i.test(href)) continue;
      const abs = href.startsWith('http') ? href : (href.startsWith('/') ? origin + href : null);
      if (!abs) continue;
      if (seen.has(abs)) continue;
      const nameRaw = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (nameRaw.length < 3 || nameRaw.length > 160) continue;
      seen.add(abs);
      out.push({
        name: nameRaw, link: abs,
        sale_price: 0, original_price: 0,
        thumbnail: null, short_desc: null,
        options: [], option_skus: [],
      });
      if (out.length >= 80) break;
    }
  } catch { /* empty */ }
  return out;
}

// ─── 상세 페이지 보강 (가격·이미지 보충) ─────────────────
async function enrichDetail(p: ScrapedProduct): Promise<ScrapedProduct> {
  if (p.sale_price && p.thumbnail) return p;
  try {
    const html = await fetchText(p.link, 15000);
    if (!p.thumbnail) {
      const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      if (og) p.thumbnail = og[1];
    }
    if (!p.sale_price) {
      const ld = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (ld) {
        try {
          const j = JSON.parse(ld[1]);
          const offers = j.offers ?? j['@graph']?.find?.((g: Record<string, unknown>) => g.offers)?.offers;
          const priceRaw = Array.isArray(offers) ? offers[0]?.price : offers?.price;
          const price = krw(priceRaw);
          if (price) { p.sale_price = price; p.original_price = p.original_price || price; }
        } catch { /* ignore */ }
      }
    }
    if (!p.short_desc) {
      const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      if (desc) p.short_desc = desc[1].slice(0, 300);
    }
  } catch { /* skip */ }
  return p;
}

// ─── 타겟 1건 실행 ─────────────────────────────────────────
async function runTarget(t: Target): Promise<{ products: number; alerts: number; error?: string }> {
  const started = new Date().toISOString();
  try {
    const base = shopifyBase(t.url);
    let products: ScrapedProduct[] = [];
    if (base && await isShopify(base)) {
      products = await scrapeShopifyListing(t.url);
    }
    if (!products.length) {
      products = await scrapeNextDataListing(t.url);
    }
    if (!products.length) {
      products = await scrapeGenericListing(t.url);
      // 가격이 비어있는 경우가 많으니 상위 20개만 상세 보강
      const enriched: ScrapedProduct[] = [];
      for (const p of products.slice(0, 20)) enriched.push(await enrichDetail(p));
      products = enriched.filter((p) => p.sale_price > 0);
    }

    const hash = await sha256(products.map((p) => `${p.link}|${p.sale_price}`).sort().join('\n'));

    // 기존 상품 조회 (변경 감지용)
    const links = products.map((p) => p.link);
    const { data: existing } = links.length
      ? await supabase.from('products').select('id, link, sale_price, original_price').in('link', links)
      : { data: [] as { id: number; link: string; sale_price: number; original_price: number }[] };
    const existMap = new Map((existing ?? []).map((e) => [e.link, e]));

    const alerts: Record<string, unknown>[] = [];
    const now = new Date().toISOString();
    const brandLabel = t.label || t.brand;

    const rows = products.map((p) => {
      const opts = p.options?.length ? p.options : [];
      const skus = p.option_skus?.length ? p.option_skus : [];
      return {
        name: p.name,
        brand: t.brand,
        store: brandLabel,
        emoji: '💊',
        thumbnail: p.thumbnail,
        short_desc: p.short_desc,
        original_price: p.original_price || p.sale_price,
        sale_price: p.sale_price,
        link: p.link,
        scrape_url: t.url,
        category1: t.category1,
        category2: t.category2,
        category3: t.category3,
        category4: t.category4,
        options: opts,
        option_skus: skus,
        updated_at: now,
      };
    }).filter((r) => r.sale_price > 0);

    // 알림 수집
    for (const r of rows) {
      const ex = existMap.get(r.link);
      if (!ex) {
        alerts.push({
          target_id: t.id, brand: t.brand,
          label: '새 상품 발견', url: r.link, seen: false,
          snippet: `${r.name} | ₩${r.sale_price.toLocaleString()}`,
        });
      } else if (ex.sale_price !== r.sale_price || ex.original_price !== r.original_price) {
        const parts = [r.name];
        if (ex.sale_price !== r.sale_price) parts.push(`판매가 ₩${ex.sale_price.toLocaleString()} → ₩${r.sale_price.toLocaleString()}`);
        if (ex.original_price !== r.original_price) parts.push(`정가 ₩${ex.original_price.toLocaleString()} → ₩${r.original_price.toLocaleString()}`);
        alerts.push({
          target_id: t.id, brand: t.brand,
          label: '가격 변동', url: r.link, seen: false,
          snippet: parts.join(' | '),
        });
      }
    }

    // upsert
    if (rows.length) {
      const { error: upErr } = await supabase.from('products').upsert(rows, { onConflict: 'link', ignoreDuplicates: false });
      if (upErr) throw new Error(`upsert: ${upErr.message}`);
    }

    if (alerts.length) {
      await supabase.from('crawl_alerts').insert(alerts);
    }

    await supabase.from('crawl_targets').update({
      last_hash: hash,
      last_checked_at: now,
      last_run_at: now,
      last_run_status: 'ok',
      last_run_summary: { products: rows.length, alerts: alerts.length, ran_at: started },
    }).eq('id', t.id);

    return { products: rows.length, alerts: alerts.length };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    await supabase.from('crawl_targets').update({
      last_run_at: new Date().toISOString(),
      last_run_status: 'error',
      last_run_summary: { error: msg, ran_at: started },
    }).eq('id', t.id);
    return { products: 0, alerts: 0, error: msg };
  }
}

// ─── HTTP 엔트리 ───────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  let body: { force?: boolean; target_id?: number } = {};
  try { body = await req.json(); } catch { /* no body */ }

  try {
    const { data: targets, error } = await supabase.from('crawl_targets').select('*').eq('active', true);
    if (error) throw new Error(error.message);

    const now = new Date();
    let picked: Target[] = [];
    if (body.target_id) {
      picked = (targets ?? []).filter((t) => t.id === body.target_id);
    } else if (body.force) {
      picked = targets ?? [];
    } else {
      picked = (targets ?? []).filter((t) => isDue(t as Target, now));
    }

    let totalProducts = 0, totalAlerts = 0;
    const details: Record<string, unknown>[] = [];

    for (const t of picked) {
      const r = await runTarget(t as Target);
      totalProducts += r.products;
      totalAlerts += r.alerts;
      details.push({ id: t.id, label: t.label, ...r });
    }

    await supabase.from('crawl_logs').insert({
      ran_at: now.toISOString(),
      summary: { type: 'crawl-run', checked: picked.length, products: totalProducts, alerts: totalAlerts, details, force: !!body.force },
    });

    return new Response(
      JSON.stringify({ ok: true, checked: picked.length, products: totalProducts, alerts: totalAlerts, details }),
      { headers: CORS },
    );
  } catch (err) {
    console.error('[crawl-run] FATAL:', err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message ?? String(err) }),
      { status: 500, headers: CORS },
    );
  }
});
