/**
 * crawl-prices Edge Function
 * Sites: BSN Korea, Optimum Nutrition (Shopify), MyProtein (Next.js), NS Store (Cafe24)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface ScrapedProduct {
  name: string; brand: string; store: string; category: string;
  original_price: number; sale_price: number; link: string;
  thumbnail?: string; emoji?: string;
}
interface ScrapedEvent {
  brand: string; brand_label: string; name: string; description?: string;
  discount_pct?: number; color?: string; active: boolean;
  start_date?: string; end_date?: string; link?: string;
  conditions?: string[]; coupon_code?: string; coupon_note?: string;
}
interface SiteResult { site: string; products: ScrapedProduct[]; events: ScrapedEvent[]; error?: string; }
interface ShopifyProduct {
  title: string; product_type: string; tags: string[]; handle: string;
  images: { src: string }[]; variants: { price: string; compare_at_price: string | null }[];
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const BASE_HEADERS = { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8', 'Cache-Control': 'no-cache' };

async function fetchText(url: string, ref = '', json = false): Promise<string> {
  const r = await fetch(url, {
    headers: {
      ...BASE_HEADERS,
      Accept: json ? 'application/json' : 'text/html,application/xhtml+xml',
      ...(ref ? { Referer: ref } : {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}
const getHtml = (url: string, ref = '') => fetchText(url, ref, false);
const getJson = async <T>(url: string, ref = '') => JSON.parse(await fetchText(url, ref, true)) as T;

const krw = (v: unknown) => { const n = +String(v ?? '').replace(/[^0-9]/g, ''); return isNaN(n) ? 0 : n; };

function classify(text: string): string {
  const s = text.toLowerCase();
  if (/bcaa|amino|아미노/.test(s)) return 'BCAA';
  if (/creatine|크레아틴/.test(s)) return '크레아틴';
  if (/vitamin|비타민|omega|오메가|zinc|magnesium/.test(s)) return '영양제';
  if (/protein|프로틴|단백질|gainer|mass/.test(s)) return '단백질 파우더';
  return '보충제';
}

async function scrapeShopify(
  base: string, brand: string, store: string, emoji: string,
): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  for (let page = 1; page <= 10; page++) {
    const d = await getJson<{ products: ShopifyProduct[] }>(
      `${base}/products.json?limit=250&page=${page}`, `${base}/`,
    );
    if (!d.products?.length) break;
    for (const p of d.products) {
      const v = p.variants[0]; if (!v) continue;
      const sale = krw(v.price); if (!sale) continue;
      products.push({
        name: p.title, brand, store,
        category: classify([...p.tags, p.product_type].join(' ')),
        original_price: krw(v.compare_at_price) || sale, sale_price: sale,
        link: `${base}/products/${p.handle}`,
        thumbnail: p.images[0]?.src, emoji,
      });
    }
    if (d.products.length < 250) break;
  }
  return products;
}

async function scrapeBSN(): Promise<SiteResult> {
  const events: ScrapedEvent[] = [];
  try {
    const products = await scrapeShopify('https://www.bsn.co.kr', 'BSN', 'BSN', '💪');
    try {
      const h = await getHtml('https://www.bsn.co.kr/pages/lets-bsn', 'https://www.bsn.co.kr/');
      const disc = h.match(/(\d+)\s*%/)?.[1];
      const end = h.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
      events.push({
        brand: 'bsn', brand_label: 'BSN', name: "BSN Let's BSN 이벤트",
        description: '공식 홈페이지에서 BSN 제품 구매 시 할인 프로모션.',
        discount_pct: disc ? +disc : 20, color: '#E53935', active: true,
        end_date: end ? `${end[1]}-${end[2]}-${end[3]}` : undefined,
        link: 'https://www.bsn.co.kr/pages/lets-bsn',
        conditions: ['BSN 공식 홈페이지(bsn.co.kr)에서 구매 시 적용'],
      });
    } catch { /* skip */ }
    return { site: 'BSN', products, events };
  } catch (e) {
    return { site: 'BSN', products: [], events, error: (e as Error).message };
  }
}

async function scrapeON(): Promise<SiteResult> {
  const BASE = 'https://www.optimumnutrition.com/ko-kr';
  const events: ScrapedEvent[] = [];
  try {
    const products = await scrapeShopify(BASE, 'ON (Optimum Nutrition)', 'ON 공식몰', '🥇');
    try {
      const h = await getHtml(`${BASE}/pages/promotions`, `${BASE}/`);
      const disc = h.match(/(\d+)\s*%/)?.[1];
      if (disc) events.push({
        brand: 'on', brand_label: 'Optimum Nutrition', name: 'ON 공식몰 프로모션',
        description: `최대 ${disc}% 할인 진행 중.`, discount_pct: +disc,
        color: '#FFB300', active: true, link: `${BASE}/pages/promotions`,
      });
    } catch { /* skip */ }
    return { site: 'ON', products, events };
  } catch (e) {
    return { site: 'ON', products: [], events, error: (e as Error).message };
  }
}

function parseNextData(html: string): Record<string, unknown>[] {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  try {
    const pp = (JSON.parse(m[1])?.props?.pageProps ?? {}) as Record<string, any>;
    return (pp?.products?.products
      ?? pp?.categoryPage?.products?.products
      ?? pp?.initialData?.products?.products
      ?? pp?.productListPage?.products?.products
      ?? pp?.serverProps?.initialData?.products?.products
      ?? []) as Record<string, unknown>[];
  } catch { return []; }
}

async function scrapeMyProtein(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  const BASE = 'https://www.myprotein.co.kr';
  const CATS: [string, string][] = [
    ['/c/protein/?pageSize=96', '단백질 파우더'],
    ['/c/creatine/?pageSize=96', '크레아틴'],
    ['/c/amino-acids/?pageSize=96', 'BCAA'],
    ['/c/vitamins-and-supplements/?pageSize=96', '영양제'],
  ];

  for (const [path, cat] of CATS) {
    try {
      const html = await getHtml(`${BASE}${path}`, `${BASE}/`);
      const list = parseNextData(html);

      if (list.length) {
        for (const p of list) {
          const price = (p?.price ?? {}) as Record<string, unknown>;
          const sale = krw(price?.value ?? (p?.specialOffer as Record<string, unknown>)?.price ?? 0);
          if (!sale) continue;
          const imgs = (p?.images as Record<string, unknown>) ?? {};
          const thumb = ((imgs.list as { url: string }[])?.[0]?.url)
            ?? (imgs.defaultImage as { url: string } | undefined)?.url;
          const url = String(p?.url ?? p?.canonicalUrl ?? '');
          products.push({
            name: String(p.title ?? p.name ?? ''), brand: '마이프로틴', store: '마이프로틴',
            category: cat, original_price: krw(price?.rrp ?? sale), sale_price: sale,
            link: url.startsWith('http') ? url : `${BASE}${url}`,
            thumbnail: thumb, emoji: '🔵',
          });
        }
      } else {
        const cardRe = /href="(\/p\/[^"]+)"[^>]*>[\s\S]{0,600}?<img[^>]+src="(https?:\/\/[^"]+)"[\s\S]{0,400}?class="[^"]*productName[^"]*"[^>]*>([^<]{3,100})<[\s\S]{0,300}?(?:₩|KRW)\s*([\d,]+)/g;
        for (const mm of html.matchAll(cardRe)) {
          const sale = krw(mm[4]); if (!sale) continue;
          products.push({
            name: mm[3].trim(), brand: '마이프로틴', store: '마이프로틴',
            category: cat, original_price: sale, sale_price: sale,
            link: `${BASE}${mm[1]}`, thumbnail: mm[2], emoji: '🔵',
          });
        }
      }
    } catch { /* skip */ }
  }

  try {
    const h = await getHtml(`${BASE}/c/voucher-codes/`, `${BASE}/`);
    const discs = [...h.matchAll(/(\d+)\s*%/g)].map(m => +m[1]).filter(n => n > 0 && n <= 80);
    const max = discs.length ? Math.max(...discs) : 35;
    events.push({
      brand: 'myprotein', brand_label: '마이프로틴', name: '마이프로틴 할인코드 모음',
      description: `할인 코드 적용 시 최대 ${max}% 추가 할인.`, discount_pct: max,
      color: '#0077CC', active: true, end_date: '2026-12-31',
      link: `${BASE}/c/voucher-codes/`,
      conditions: ['마이프로틴 공식 홈페이지(myprotein.co.kr)에서 구매 시 적용', '1회 주문당 1개 쿠폰코드만 적용 가능'],
    });
  } catch { /* skip */ }

  return { site: 'MyProtein', products, events };
}

async function scrapeNSStore(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  const BASE = 'https://www.ns-store.co.kr';

  const catCodes = new Set<string>();
  try {
    const mainHtml = await getHtml(`${BASE}/`, `${BASE}/`);
    for (const cm of mainHtml.matchAll(/goods_list\.php\?cateCd=(\d{4,})/g)) catCodes.add(cm[1]);
  } catch { /* skip */ }

  const codes = catCodes.size ? [...catCodes] : [
    '0100000001', '0100000002', '0100000003', '0100000004', '0100000005',
    '001001', '001002', '001003', '002001', '003001',
  ];

  const seen = new Set<string>();
  for (const code of codes.slice(0, 15)) {
    try {
      const html = await getHtml(`${BASE}/goods/goods_list.php?cateCd=${code}`, `${BASE}/`);

      const imgMap: Record<string, string> = {};
      for (const im of html.matchAll(/goodsNo=(\d+)[^"]*"[\s\S]{0,800}?<img[^>]+src="((?:https?:)?\/\/[^"]+(?:goods|product|upload|thumb)[^"]*\.(jpg|jpeg|png|webp))[^"]*"/gi)) {
        if (!imgMap[im[1]]) imgMap[im[1]] = im[2].startsWith('//') ? 'https:' + im[2] : im[2];
      }

      const re = /href="(\/goods\/goods_view\.php\?goodsNo=(\d+)[^"]*)"[\s\S]{0,2500}?class="[^"]*(?:goods_name|item_name|prd_name)[^"]*"[^>]*>\s*([^<]{3,100})\s*<[\s\S]{0,800}?class="[^"]*(?:sale_?price|final_?price|goods_price|selling_price)[^"]*"[^>]*>\s*([\d,]+)/g;
      for (const m of html.matchAll(re)) {
        const sale = krw(m[4]); if (!sale) continue;
        const link = `${BASE}${m[1]}`;
        if (seen.has(link)) continue;
        seen.add(link);
        products.push({
          name: m[3].trim(), brand: 'NS', store: 'NS스토어',
          category: classify(m[3]), original_price: sale, sale_price: sale,
          link, thumbnail: imgMap[m[2]], emoji: '🟢',
        });
      }
    } catch { /* skip */ }
  }

  try {
    const html = await getHtml(`${BASE}/event/event_list.php`, `${BASE}/`);
    const re = /href="(\/event\/event_view\.php\?[^"]+)"[\s\S]{0,600}?(?:class="[^"]*(?:subject|tit)[^"]*"|<strong>)\s*([^<]{5,100})/g;
    for (const m of [...html.matchAll(re)].slice(0, 5)) {
      events.push({
        brand: 'ns', brand_label: 'NS스토어', name: m[2].trim().replace(/\s+/g, ' '),
        description: 'NS스토어 진행 중인 이벤트.', color: '#4CAF50',
        active: true, link: `${BASE}${m[1]}`,
      });
    }
  } catch { /* skip */ }

  return { site: 'NSStore', products, events };
}

async function upsertProducts(prods: ScrapedProduct[]) {
  if (!prods.length) return { inserted: 0, updated: 0 };

  const { data: existing } = await supabase
    .from('products').select('id, sale_price, thumbnail, link')
    .in('link', prods.map(p => p.link));

  const exMap = new Map((existing ?? []).map(e => [e.link, e]));
  const now = new Date().toISOString();
  const toInsert: Record<string, unknown>[] = [];
  let upd = 0;

  for (const p of prods) {
    const ex = exMap.get(p.link);
    if (ex) {
      if (ex.sale_price !== p.sale_price || (!ex.thumbnail && p.thumbnail)) {
        await supabase.from('products').update({
          sale_price: p.sale_price, original_price: p.original_price, updated_at: now,
          ...(p.thumbnail ? { thumbnail: p.thumbnail } : {}),
        }).eq('id', ex.id);
        upd++;
      }
    } else {
      toInsert.push({
        name: p.name, brand: p.brand, store: p.store, category: classify(p.name),
        emoji: p.emoji ?? '💊', thumbnail: p.thumbnail ?? null,
        original_price: p.original_price, sale_price: p.sale_price,
        link: p.link, scrape_url: p.link, updated_at: now,
      });
    }
  }

  let ins = 0;
  if (toInsert.length) {
    const { error } = await supabase.from('products').insert(toInsert);
    if (!error) ins = toInsert.length;
  }
  return { inserted: ins, updated: upd };
}

async function upsertEvents(evts: ScrapedEvent[]) {
  if (!evts.length) return;
  const brands = [...new Set(evts.map(e => e.brand))];
  const { data: existing } = await supabase
    .from('events').select('id, brand, name').in('brand', brands);
  const exMap = new Map((existing ?? []).map(e => [`${e.brand}::${e.name}`, e.id]));

  for (const e of evts) {
    const id = exMap.get(`${e.brand}::${e.name}`);
    if (id) {
      await supabase.from('events').update({
        active: e.active, end_date: e.end_date ?? null,
        discount_pct: e.discount_pct ?? null, description: e.description ?? null,
        coupon_code: e.coupon_code ?? null,
      }).eq('id', id);
    } else {
      await supabase.from('events').insert(e);
    }
  }
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({})) as { sites?: string[] };
  const targets = body.sites ?? ['bsn', 'on', 'myprotein', 'nsstore'];
  const scrapers: Record<string, () => Promise<SiteResult>> = {
    bsn: scrapeBSN, on: scrapeON, myprotein: scrapeMyProtein, nsstore: scrapeNSStore,
  };

  const summary: Record<string, unknown> = {};
  await Promise.allSettled(
    targets.filter(s => scrapers[s]).map(async (s) => {
      try {
        const r = await scrapers[s]();
        const [{ inserted, updated }] = await Promise.all([
          upsertProducts(r.products),
          upsertEvents(r.events),
        ]);
        summary[s] = {
          products_found: r.products.length, inserted, updated,
          events_found: r.events.length, error: r.error ?? null,
        };
      } catch (e) { summary[s] = { error: (e as Error).message }; }
    }),
  );

  await supabase.from('crawl_logs').insert({ ran_at: new Date().toISOString(), summary });

  return new Response(
    JSON.stringify({ ok: true, ran_at: new Date().toISOString(), summary }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
