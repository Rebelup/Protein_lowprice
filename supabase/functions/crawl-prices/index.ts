/**
 * crawl-prices — 가격 변동 / 신규 상품·이벤트 감지 → admin 알림
 * DB 규칙: crawl_alerts, crawl_logs에만 INSERT 가능
 *          events / products 테이블에는 절대 쓰지 않음
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface Product {
  name: string; brand: string; store: string;
  original_price: number; sale_price: number;
  link: string; thumbnail?: string; emoji?: string;
}
interface Event {
  brand: string; brand_label: string; name: string;
  discount_pct?: number; link?: string; end_date?: string; description?: string;
}
interface SiteResult { site: string; products: Product[]; events: Event[]; error?: string; }
interface ShopifyProduct {
  title: string; handle: string; images: { src: string }[];
  variants: { price: string; compare_at_price: string | null }[];
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', 'Cache-Control': 'no-cache' };

const krw = (v: unknown) => { const n = +String(v ?? '').replace(/[^0-9]/g, ''); return isNaN(n) ? 0 : n; };
const fmtW = (n: number) => `₩${n.toLocaleString()}`;

async function get(url: string, json = false): Promise<string> {
  const r = await fetch(url, {
    headers: { ...HEADERS, Accept: json ? 'application/json' : 'text/html' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}
const getJson = async <T>(url: string) => JSON.parse(await get(url, true)) as T;

async function scrapeShopify(base: string, brand: string, store: string, emoji: string): Promise<Product[]> {
  const prods: Product[] = [];
  for (let page = 1; page <= 10; page++) {
    const d = await getJson<{ products: ShopifyProduct[] }>(`${base}/products.json?limit=250&page=${page}`);
    if (!d.products?.length) break;
    for (const p of d.products) {
      const v = p.variants[0]; if (!v) continue;
      const sale = krw(v.price); if (!sale) continue;
      prods.push({
        name: p.title, brand, store,
        original_price: krw(v.compare_at_price) || sale, sale_price: sale,
        link: `${base}/products/${p.handle}`,
        thumbnail: p.images[0]?.src, emoji,
      });
    }
    if (d.products.length < 250) break;
  }
  return prods;
}

async function scrapeBSN(): Promise<SiteResult> {
  try {
    const products = await scrapeShopify('https://www.bsn.co.kr', 'bsn', 'BSN', '💪');
    const events: Event[] = [];
    try {
      const h = await get('https://www.bsn.co.kr/pages/lets-bsn');
      const disc = h.match(/(\d+)\s*%/)?.[1];
      const end = h.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
      events.push({
        brand: 'bsn', brand_label: 'BSN', name: "BSN Let's BSN 이벤트",
        discount_pct: disc ? +disc : undefined,
        end_date: end ? `${end[1]}-${end[2]}-${end[3]}` : undefined,
        link: 'https://www.bsn.co.kr/pages/lets-bsn',
      });
    } catch { /* skip */ }
    return { site: 'BSN', products, events };
  } catch (e) {
    return { site: 'BSN', products: [], events: [], error: (e as Error).message };
  }
}

async function scrapeON(): Promise<SiteResult> {
  const BASE = 'https://www.optimumnutrition.com/ko-kr';
  try {
    const products = await scrapeShopify(BASE, 'on', 'ON 공식몰', '🥇');
    const events: Event[] = [];
    try {
      const h = await get(`${BASE}/pages/promotions`);
      const disc = h.match(/(\d+)\s*%/)?.[1];
      if (disc) events.push({
        brand: 'on', brand_label: 'Optimum Nutrition', name: 'ON 공식몰 프로모션',
        discount_pct: +disc, link: `${BASE}/pages/promotions`,
      });
    } catch { /* skip */ }
    return { site: 'ON', products, events };
  } catch (e) {
    return { site: 'ON', products: [], events: [], error: (e as Error).message };
  }
}

async function scrapeMyProtein(): Promise<SiteResult> {
  const BASE = 'https://www.myprotein.co.kr';
  const products: Product[] = [];
  const CATS: [string][] = [['/c/protein/?pageSize=96'], ['/c/creatine/?pageSize=96'], ['/c/amino-acids/?pageSize=96'], ['/c/vitamins-and-supplements/?pageSize=96']];

  for (const [path] of CATS) {
    try {
      const html = await get(`${BASE}${path}`);
      const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
      const pp = m ? ((JSON.parse(m[1])?.props?.pageProps ?? {}) as Record<string, unknown>) : {};
      const list = (pp?.products as Record<string, unknown> | undefined)?.products
        ?? (pp?.categoryPage as Record<string, unknown> | undefined)?.products ?? [] as unknown[];
      for (const p of list as Record<string, unknown>[]) {
        const price = (p?.price ?? {}) as Record<string, unknown>;
        const sale = krw(price?.value ?? 0); if (!sale) continue;
        const url = String(p?.url ?? p?.canonicalUrl ?? '');
        products.push({
          name: String(p.title ?? p.name ?? ''), brand: 'myprotein', store: '마이프로틴',
          original_price: krw(price?.rrp ?? sale), sale_price: sale,
          link: url.startsWith('http') ? url : `${BASE}${url}`,
          thumbnail: ((p?.images as Record<string, unknown>)?.list as { url: string }[])?.[0]?.url,
          emoji: '🔵',
        });
      }
    } catch { /* skip */ }
  }

  const events: Event[] = [];
  try {
    const h = await get(`${BASE}/c/voucher-codes/`);
    const discs = [...h.matchAll(/(\d+)\s*%/g)].map((m) => +m[1]).filter((n) => n > 0 && n <= 80);
    const max = discs.length ? Math.max(...discs) : 0;
    if (max) events.push({ brand: 'myprotein', brand_label: '마이프로틴', name: '마이프로틴 할인코드 모음', discount_pct: max, link: `${BASE}/c/voucher-codes/` });
  } catch { /* skip */ }

  return { site: 'MyProtein', products, events };
}

async function scrapeNSStore(): Promise<SiteResult> {
  const BASE = 'https://www.ns-store.co.kr';
  const products: Product[] = [];
  const events: Event[] = [];
  const seen = new Set<string>();

  const codes = ['0100000001', '0100000002', '0100000003', '0100000004', '001001', '001002', '002001'];
  for (const code of codes) {
    try {
      const html = await get(`${BASE}/goods/goods_list.php?cateCd=${code}`);
      const re = /href="(\/goods\/goods_view\.php\?goodsNo=(\d+)[^"]*)"[\s\S]{0,2500}?class="[^"]*(?:goods_name|item_name|prd_name)[^"]*"[^>]*>\s*([^<]{3,100})\s*<[\s\S]{0,800}?class="[^"]*(?:sale_?price|final_?price|goods_price)[^"]*"[^>]*>\s*([\d,]+)/g;
      for (const m of html.matchAll(re)) {
        const sale = krw(m[4]); if (!sale) continue;
        const link = `${BASE}${m[1]}`; if (seen.has(link)) continue;
        seen.add(link);
        products.push({ name: m[3].trim(), brand: 'ns', store: 'NS스토어', original_price: sale, sale_price: sale, link, emoji: '🟢' });
      }
    } catch { /* skip */ }
  }

  try {
    const html = await get(`${BASE}/event/event_list.php`);
    const re = /href="(\/event\/event_view\.php\?[^"]+)"[\s\S]{0,600}?(?:class="[^"]*(?:subject|tit)[^"]*"|<strong>)\s*([^<]{5,100})/g;
    for (const m of [...html.matchAll(re)].slice(0, 5)) {
      events.push({ brand: 'ns', brand_label: 'NS스토어', name: m[2].trim().replace(/\s+/g, ' '), link: `${BASE}${m[1]}` });
    }
  } catch { /* skip */ }

  return { site: 'NSStore', products, events };
}

// ── 변경 감지 및 알림 생성 (DB 쓰기는 crawl_alerts만) ──────────────

async function detectAndAlert(prods: Product[], evts: Event[]): Promise<number> {
  const alerts: Record<string, unknown>[] = [];

  // 상품 비교
  if (prods.length) {
    const { data: existing } = await supabase
      .from('products').select('sale_price, original_price, link')
      .in('link', prods.map((p) => p.link));
    const exMap = new Map((existing ?? []).map((e) => [e.link, e]));

    for (const p of prods) {
      const ex = exMap.get(p.link);
      if (!ex) {
        alerts.push({
          brand: p.brand, label: '새 상품 발견',
          url: p.link, seen: false,
          snippet: `${p.name} | 판매가 ${fmtW(p.sale_price)}${p.original_price > p.sale_price ? ` (정가 ${fmtW(p.original_price)})` : ''}`,
        });
      } else if (ex.sale_price !== p.sale_price || ex.original_price !== p.original_price) {
        const parts: string[] = [`${p.name}`];
        if (ex.sale_price !== p.sale_price) parts.push(`판매가 ${fmtW(ex.sale_price)} → ${fmtW(p.sale_price)}`);
        if (ex.original_price !== p.original_price) parts.push(`정가 ${fmtW(ex.original_price)} → ${fmtW(p.original_price)}`);
        alerts.push({ brand: p.brand, label: '가격 변동', url: p.link, seen: false, snippet: parts.join(' | ') });
      }
    }
  }

  // 이벤트 비교
  if (evts.length) {
    const brands = [...new Set(evts.map((e) => e.brand))];
    const { data: existing } = await supabase.from('events').select('brand, name').in('brand', brands);
    const exSet = new Set((existing ?? []).map((e) => `${e.brand}::${e.name}`));

    for (const e of evts) {
      if (!exSet.has(`${e.brand}::${e.name}`)) {
        const parts = [e.name];
        if (e.discount_pct) parts.push(`할인율 ${e.discount_pct}%`);
        if (e.end_date) parts.push(`종료 ${e.end_date}`);
        alerts.push({
          brand: e.brand, label: `새 이벤트 감지 — ${e.brand_label}`,
          url: e.link ?? '', seen: false, snippet: parts.join(' | '),
        });
      }
    }
  }

  if (alerts.length) {
    await supabase.from('crawl_alerts').insert(alerts);
  }
  return alerts.length;
}

// ── 메인 핸들러 ───────────────────────────────────────────────────

const SCRAPERS: Record<string, () => Promise<SiteResult>> = {
  bsn: scrapeBSN, on: scrapeON, myprotein: scrapeMyProtein, nsstore: scrapeNSStore,
};

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({})) as { sites?: string[] };
  const targets = (body.sites ?? Object.keys(SCRAPERS)).filter((s) => SCRAPERS[s]);

  const summary: Record<string, unknown> = {};
  const allProds: Product[] = [], allEvts: Event[] = [];

  await Promise.allSettled(
    targets.map(async (s) => {
      try {
        const r = await SCRAPERS[s]();
        allProds.push(...r.products);
        allEvts.push(...r.events);
        summary[s] = { products: r.products.length, events: r.events.length, error: r.error ?? null };
      } catch (e) {
        summary[s] = { error: (e as Error).message };
      }
    }),
  );

  const alertCount = await detectAndAlert(allProds, allEvts);
  const now = new Date().toISOString();

  await supabase.from('crawl_logs').insert({
    ran_at: now, summary: { type: 'prices', total_products: allProds.length, total_events: allEvts.length, alerts: alertCount, ...summary },
  });

  return new Response(
    JSON.stringify({ ok: true, ran_at: now, alerts: alertCount, summary }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
