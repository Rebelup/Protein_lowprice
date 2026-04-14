/**
 * crawl-prices Edge Function  v5.0
 *
 * 지원 사이트:
 *   1. BSN Korea (bsn.co.kr) — Shopify
 *   2. Optimum Nutrition (optimumnutrition.com/ko-kr) — Shopify
 *   3. MyProtein Korea (myprotein.co.kr) — THG Commerce / Next.js
 *   4. NS Store (ns-store.co.kr) — Cafe24
 *
 * v5.0 변경사항:
 *   - 요청 타임아웃 25s → 8s (전체 실행 시간 대폭 단축)
 *   - 사이트별 40초 하드 타임아웃 추가
 *   - upsert 기준: link → name+store (중복 링크 문제 해결)
 *   - MyProtein: /_next/data/ JSON API 우선 시도
 *   - NSStore: 최대 6개 코드만 시도
 *   - debug 필드 유지 (원인 파악용)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const REQ_TIMEOUT  = 8_000;   // 요청당 최대 8초
const SITE_TIMEOUT = 40_000;  // 사이트당 최대 40초

/* ── 공통 타입 ─────────────────────────────────────────── */
interface ScrapedProduct {
  name: string; brand: string; store: string; category: string;
  original_price: number; sale_price: number; link: string;
  thumbnail?: string; emoji?: string;
  flavor?: string;
  available_flavors?: string[];
}
interface ScrapedEvent {
  brand: string; brand_label: string; name: string; description?: string;
  discount_pct?: number; color?: string; active: boolean;
  start_date?: string; end_date?: string; link?: string;
  conditions?: string[]; coupon_code?: string; coupon_note?: string;
}
interface SiteResult {
  site: string; products: ScrapedProduct[]; events: ScrapedEvent[];
  error?: string; debug?: string;
}
interface ShopifyVariant { price: string; compare_at_price: string | null; title?: string; option1?: string; }
interface ShopifyProduct {
  title: string; product_type: string; tags: string[];
  handle: string; images: { src: string }[]; variants: ShopifyVariant[];
}

/* ── 공통 헬퍼 ─────────────────────────────────────────── */
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
};

async function getHtml(url: string, ref = ''): Promise<string> {
  const r = await fetch(url, {
    headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml', ...(ref ? { Referer: ref } : {}) },
    signal: AbortSignal.timeout(REQ_TIMEOUT),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}

async function getJson<T>(url: string, ref = ''): Promise<T> {
  const r = await fetch(url, {
    headers: { ...HEADERS, Accept: 'application/json', ...(ref ? { Referer: ref } : {}) },
    signal: AbortSignal.timeout(REQ_TIMEOUT),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json() as Promise<T>;
}

/** 사이트 단위 타임아웃 래퍼 */
function withSiteTimeout(fn: () => Promise<SiteResult>, site: string): Promise<SiteResult> {
  return Promise.race([
    fn(),
    new Promise<SiteResult>(resolve =>
      setTimeout(() => resolve({ site, products: [], events: [], error: `site timeout ${SITE_TIMEOUT}ms` }), SITE_TIMEOUT)
    ),
  ]);
}

function krw(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[^0-9]/g, ''));
  return isNaN(n) ? 0 : n;
}

function shopifyCat(tags: string[], type: string): string {
  const s = [...tags, type].join(' ').toLowerCase();
  if (/protein|프로틴|단백질|gainer|mass/.test(s)) return '단백질 파우더';
  if (/creatine|크레아틴/.test(s)) return '크레아틴';
  if (/bcaa|amino|아미노/.test(s)) return 'BCAA';
  if (/vitamin|비타민/.test(s)) return '영양제';
  return '보충제';
}

function classifyByName(name: string): string {
  const n = name.toLowerCase();
  if (/bcaa|amino|아미노/.test(n)) return 'BCAA';
  if (/creatine|크레아틴/.test(n)) return '크레아틴';
  if (/vitamin|비타민|omega|오메가|zinc|magnesium/.test(n)) return '영양제';
  return '단백질 파우더';
}

/* ══════════════════════════════════════════════════════
   1. BSN Korea — Shopify
══════════════════════════════════════════════════════ */
async function scrapeBSN(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const d = await getJson<{ products: ShopifyProduct[] }>(
        `https://www.bsn.co.kr/products.json?limit=250&page=${page}`,
        'https://www.bsn.co.kr/'
      );
      if (!d.products?.length) break;
      for (const p of d.products) {
        const v = p.variants[0]; if (!v) continue;
        const sale = krw(v.price); if (!sale) continue;
        const allFlavors = [...new Set(
          p.variants.map(vv => (vv.option1 || vv.title || '').trim()).filter(Boolean)
        )];
        products.push({
          name: p.title, brand: 'BSN', store: 'BSN',
          category: shopifyCat(p.tags, p.product_type),
          original_price: krw(v.compare_at_price) || sale, sale_price: sale,
          link: `https://www.bsn.co.kr/products/${p.handle}`,
          thumbnail: p.images[0]?.src, emoji: '💪',
          flavor: allFlavors[0],
          available_flavors: allFlavors.length > 0 ? allFlavors : undefined,
        });
      }
      if (d.products.length < 250) break;
    }
    try {
      const h = await getHtml('https://www.bsn.co.kr/pages/lets-bsn', 'https://www.bsn.co.kr/');
      const disc = h.match(/(\d+)\s*%/)?.[1];
      const end  = h.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
      events.push({
        brand: 'bsn', brand_label: 'BSN', name: "BSN Let's BSN 이벤트",
        description: '공식 홈페이지에서 BSN 제품 구매 시 할인 프로모션.',
        discount_pct: disc ? +disc : 20, color: '#E53935', active: true,
        end_date: end ? `${end[1]}-${end[2]}-${end[3]}` : undefined,
        link: 'https://www.bsn.co.kr/pages/lets-bsn',
        conditions: ['BSN 공식 홈페이지(bsn.co.kr)에서 구매 시 적용'],
      });
    } catch { /* 이벤트 페이지 스킵 */ }
  } catch (e) {
    return { site: 'BSN', products, events, error: (e as Error).message };
  }
  return { site: 'BSN', products, events };
}

/* ══════════════════════════════════════════════════════
   2. Optimum Nutrition — Shopify
══════════════════════════════════════════════════════ */
async function scrapeON(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  const BASE = 'https://www.optimumnutrition.com/ko-kr';
  try {
    for (let page = 1; page <= 10; page++) {
      const d = await getJson<{ products: ShopifyProduct[] }>(
        `${BASE}/products.json?limit=250&page=${page}`, `${BASE}/`
      );
      if (!d.products?.length) break;
      for (const p of d.products) {
        const v = p.variants[0]; if (!v) continue;
        const sale = krw(v.price); if (!sale) continue;
        const allFlavors = [...new Set(
          p.variants.map(vv => (vv.option1 || vv.title || '').trim()).filter(Boolean)
        )];
        products.push({
          name: p.title, brand: 'ON (Optimum Nutrition)', store: 'ON 공식몰',
          category: shopifyCat(p.tags, p.product_type),
          original_price: krw(v.compare_at_price) || sale, sale_price: sale,
          link: `${BASE}/products/${p.handle}`,
          thumbnail: p.images[0]?.src, emoji: '🥇',
          flavor: allFlavors[0],
          available_flavors: allFlavors.length > 0 ? allFlavors : undefined,
        });
      }
      if (d.products.length < 250) break;
    }
    try {
      const h = await getHtml(`${BASE}/pages/promotions`, `${BASE}/`);
      const disc = h.match(/(\d+)\s*%/)?.[1];
      if (disc) events.push({
        brand: 'on', brand_label: 'Optimum Nutrition', name: 'ON 공식몰 프로모션',
        description: `최대 ${disc}% 할인 진행 중.`, discount_pct: +disc,
        color: '#FFB300', active: true, link: `${BASE}/pages/promotions`,
      });
    } catch { /* 스킵 */ }
  } catch (e) {
    return { site: 'ON', products, events, error: (e as Error).message };
  }
  return { site: 'ON', products, events };
}

/* ══════════════════════════════════════════════════════
   3. MyProtein Korea — THG Commerce (Next.js)
   v5.0: /_next/data/ JSON API 우선 시도 → __NEXT_DATA__ 폴백
══════════════════════════════════════════════════════ */

function extractProductsFromNextProps(pp: Record<string, unknown>): Record<string, unknown>[] {
  return (
    pp?.products?.products ??
    pp?.categoryPage?.products?.products ??
    pp?.categoryPage?.productList?.products ??
    pp?.initialData?.products?.products ??
    pp?.productListPage?.products?.products ??
    pp?.serverProps?.initialData?.products?.products ??
    pp?.data?.productListPage?.products?.products ??
    pp?.listingPage?.products?.products ??
    pp?.pageData?.products?.products ??
    (pp?.products as Record<string, unknown>)?.list ??
    []
  ) as Record<string, unknown>[];
}

function parseNextData(html: string): { products: Record<string, unknown>[]; debug: string } {
  let startIdx = html.indexOf('<script id="__NEXT_DATA__"');
  if (startIdx === -1) startIdx = html.indexOf("<script id='__NEXT_DATA__'");
  if (startIdx === -1) {
    return { products: [], debug: `no __NEXT_DATA__; html=${html.length}chars` };
  }
  const jsonStart = html.indexOf('>', startIdx) + 1;
  const jsonEnd   = html.indexOf('</script>', jsonStart);
  if (jsonEnd === -1) return { products: [], debug: '__NEXT_DATA__ tag not closed' };

  const jsonStr = html.slice(jsonStart, jsonEnd).trim();
  try {
    const nd = JSON.parse(jsonStr);
    const pp = (nd?.props?.pageProps ?? {}) as Record<string, unknown>;
    const prods = extractProductsFromNextProps(pp);
    if (prods.length > 0) return { products: prods, debug: `__NEXT_DATA__ OK: ${prods.length}` };

    const topKeys = Object.keys(pp).slice(0, 10).join(',');
    return { products: [], debug: `pageProps keys=[${topKeys}]; json=${jsonStr.length}chars` };
  } catch (e) {
    return { products: [], debug: `JSON error: ${(e as Error).message}` };
  }
}

function mapThgProduct(p: Record<string, unknown>, cat: string, base: string): ScrapedProduct | null {
  const priceObj  = (p?.price ?? {}) as Record<string, unknown>;
  const sale      = krw(priceObj?.value ?? (p?.specialOffer as Record<string, unknown>)?.price ?? 0);
  if (!sale) return null;
  const orig      = krw(priceObj?.rrp ?? sale);
  const imgList   = ((p?.images as Record<string, unknown>)?.list as { url: string }[]) ?? [];
  const defaultImg = (p?.images as Record<string, unknown>)?.defaultImage as { url: string } | undefined;
  const thumb     = imgList[0]?.url ?? defaultImg?.url ?? undefined;
  const url       = String(p?.url ?? p?.canonicalUrl ?? '');
  const name      = String(p.title ?? p.name ?? '').trim();
  if (!name) return null;
  return {
    name, brand: '마이프로틴', store: '마이프로틴', category: cat,
    original_price: orig, sale_price: sale,
    link: url.startsWith('http') ? url : `${base}${url}`,
    thumbnail: thumb, emoji: '🔵',
  };
}

async function scrapeMyProtein(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  const debugParts: string[] = [];
  const BASE = 'https://www.myprotein.co.kr';

  const CATS: [string, string][] = [
    ['/c/protein/',                    '단백질 파우더'],
    ['/c/creatine/',                   '크레아틴'],
    ['/c/amino-acids/',                'BCAA'],
    ['/c/vitamins-and-supplements/',   '영양제'],
  ];

  // Step 1: buildId 추출 (/_next/data/ API 사용을 위해)
  let buildId = '';
  try {
    const mainHtml = await getHtml(`${BASE}/`, `${BASE}/`);
    const m = mainHtml.match(/"buildId"\s*:\s*"([^"]{8,})"/);
    buildId = m?.[1] ?? '';
    debugParts.push(`buildId=${buildId || 'not found'}`);
  } catch (e) {
    debugParts.push(`main page error: ${(e as Error).message}`);
  }

  for (const [path, cat] of CATS) {
    let got = false;

    // 시도 1: /_next/data/ JSON API (buildId 있을 때)
    if (buildId && !got) {
      try {
        const cleanPath = path.replace(/^\//, '').replace(/\/$/, '');
        const apiUrl = `${BASE}/_next/data/${buildId}/${cleanPath}.json?pageSize=96`;
        const data = await getJson<{ pageProps?: Record<string, unknown> }>(apiUrl, `${BASE}/`);
        const prods = extractProductsFromNextProps(data?.pageProps ?? {});
        if (prods.length > 0) {
          prods.forEach(p => { const sp = mapThgProduct(p, cat, BASE); if (sp) products.push(sp); });
          debugParts.push(`[${cat}] /_next/data/: ${prods.length} products`);
          got = true;
        } else {
          debugParts.push(`[${cat}] /_next/data/: 0 (pageProps keys=${Object.keys(data?.pageProps ?? {}).slice(0,5).join(',')})`);
        }
      } catch (e) {
        debugParts.push(`[${cat}] /_next/data/ error: ${(e as Error).message}`);
      }
    }

    // 시도 2: HTML __NEXT_DATA__ 파싱
    if (!got) {
      try {
        const html = await getHtml(`${BASE}${path}?pageSize=96`, `${BASE}/`);
        const { products: list, debug: pd } = parseNextData(html);
        debugParts.push(`[${cat}] HTML: ${pd}`);
        if (list.length > 0) {
          list.forEach(p => { const sp = mapThgProduct(p, cat, BASE); if (sp) products.push(sp); });
          got = true;
        }
      } catch (e) {
        debugParts.push(`[${cat}] HTML error: ${(e as Error).message}`);
      }
    }
  }

  // 같은 링크를 공유하는 MyProtein 상품들 → available_flavors 및 flavor 채우기
  const byLink = new Map<string, ScrapedProduct[]>();
  for (const p of products) {
    if (!byLink.has(p.link)) byLink.set(p.link, []);
    byLink.get(p.link)!.push(p);
  }
  for (const group of byLink.values()) {
    // 맛 추출: 이름 안의 괄호 내용 또는 마지막 단어
    const flavors = group.map(p => {
      const m = p.name.match(/[\(（]([^\)）]+)[\)）]/);
      if (m) return m[1].trim();
      const parts = p.name.split(/\s+/);
      return parts[parts.length - 1] ?? p.name;
    });
    group.forEach((p, i) => {
      if (!p.flavor) p.flavor = flavors[i] || undefined;
      p.available_flavors = flavors.filter(Boolean);
    });
  }

  // 쿠폰/이벤트
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
  } catch { /* 스킵 */ }

  return { site: 'MyProtein', products, events, debug: debugParts.join(' || ') };
}

/* ══════════════════════════════════════════════════════
   4. NS Store — Cafe24 (PC 사이트)
   v5.0: 최대 6개 코드, 디버그 유지
══════════════════════════════════════════════════════ */
async function scrapeNSStore(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  const debugParts: string[] = [];
  const BASE = 'https://www.ns-store.co.kr';

  // 메인 페이지에서 카테고리 코드 수집
  const catCodes = new Set<string>();
  try {
    const mainHtml = await getHtml(`${BASE}/`, `${BASE}/`);
    for (const cm of mainHtml.matchAll(/cateCd=(\d{3,})/g)) catCodes.add(cm[1]);
    debugParts.push(`main OK; catCodes=${catCodes.size}(${[...catCodes].slice(0,5).join(',')})`);
  } catch (e) {
    debugParts.push(`main ERROR: ${(e as Error).message}`);
  }

  const codesToTry = catCodes.size > 0
    ? [...catCodes].slice(0, 6)
    : ['0100000001','0100000002','001001','001002','0001','0002'];

  for (const code of codesToTry) {
    try {
      const html = await getHtml(`${BASE}/goods/goods_list.php?cateCd=${code}`, `${BASE}/`);
      const before = products.length;

      // 이미지 맵
      const imgMap: Record<string, string> = {};
      for (const im of html.matchAll(/goodsNo=(\d+)[^\s"]*[\s\S]{0,800}?<img[^>]+(?:src|data-src)="((?:https?:)?\/\/[^"]+\.(jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi)) {
        if (!imgMap[im[1]]) imgMap[im[1]] = im[2].startsWith('//') ? 'https:' + im[2] : im[2];
      }

      // 패턴 1: class 기반 이름+가격
      const re1 = /href="(\/goods\/goods_view\.php\?goodsNo=(\d+)[^"]*)"[\s\S]{0,3000}?(?:class="[^"]*(?:goods_name|item_name|prd_name|name)[^"]*"[^>]*>|<strong\s+class="[^"]*name[^"]*"[^>]*>)\s*(?:<[^>]+>)*\s*([^<]{2,120})\s*(?:<\/[^>]+>)*[\s\S]{0,1000}?(?:class="[^"]*(?:sale_?price|final_?price|goods_price|selling_price|price)[^"]*"[^>]*>[\s<>\/a-z"=]*)((?:\d{1,3},)*\d{1,3})/g;
      for (const m of html.matchAll(re1)) {
        const sale = krw(m[4]); if (!sale) continue;
        products.push({ name: m[3].trim().replace(/\s+/g, ' '), brand: 'NS', store: 'NS스토어', category: classifyByName(m[3]), original_price: sale, sale_price: sale, link: `${BASE}${m[1]}`, thumbnail: imgMap[m[2]], emoji: '🟢' });
      }

      // 패턴 2: alt 텍스트 기반 (패턴1 실패 시)
      if (products.length === before) {
        const re2 = /href="(\/goods\/goods_view\.php\?goodsNo=(\d+))"[^>]*>[\s\S]{0,200}?alt="([^"]{3,120})"[\s\S]{0,2000}?((?:\d{1,3},)*\d{1,3})원/g;
        for (const m of html.matchAll(re2)) {
          const sale = krw(m[4]); if (!sale) continue;
          products.push({ name: m[3].trim(), brand: 'NS', store: 'NS스토어', category: classifyByName(m[3]), original_price: sale, sale_price: sale, link: `${BASE}${m[1]}`, thumbnail: imgMap[m[2]], emoji: '🟢' });
        }
      }

      const added = products.length - before;
      if (added > 0) debugParts.push(`cateCd=${code}: +${added}`);
      else if (html.includes('goodsNo')) debugParts.push(`cateCd=${code}: has goodsNo but no match (len=${html.length})`);
    } catch (e) {
      debugParts.push(`cateCd=${code}: ${(e as Error).message}`);
    }
  }

  // 중복 링크 제거
  const seen = new Set<string>();
  const unique = products.filter(p => { if (seen.has(p.link)) return false; seen.add(p.link); return true; });
  products.length = 0; unique.forEach(p => products.push(p));

  // 이벤트
  try {
    const html = await getHtml(`${BASE}/event/event_list.php`, `${BASE}/`);
    const re = /href="(\/event\/event_view\.php\?[^"]+)"[\s\S]{0,600}?(?:class="[^"]*(?:subject|tit)[^"]*"|<strong>)\s*([^<]{5,100})/g;
    for (const m of [...html.matchAll(re)].slice(0, 5)) {
      events.push({ brand: 'ns', brand_label: 'NS스토어', name: m[2].trim().replace(/\s+/g, ' '), description: 'NS스토어 진행 중인 이벤트.', color: '#4CAF50', active: true, link: `${BASE}${m[1]}` });
    }
  } catch { /* 스킵 */ }

  return { site: 'NSStore', products, events, debug: debugParts.join(' || ') };
}

/* ── DB 업서트 (name+store 기준 — 중복 링크 문제 해결) ─── */
async function upsertProducts(prods: ScrapedProduct[]) {
  let ins = 0, upd = 0;
  for (const p of prods) {
    if (!p.name?.trim()) continue;

    // name + store 조합으로 기존 행 탐색
    const { data: ex } = await supabase
      .from('products')
      .select('id, sale_price, thumbnail')
      .eq('name', p.name)
      .eq('store', p.store)
      .maybeSingle();

    if (ex) {
      const needsUpdate = ex.sale_price !== p.sale_price || (!ex.thumbnail && p.thumbnail) || p.available_flavors;
      if (needsUpdate) {
        await supabase.from('products').update({
          sale_price: p.sale_price, original_price: p.original_price,
          link: p.link, updated_at: new Date().toISOString(),
          ...(p.thumbnail ? { thumbnail: p.thumbnail } : {}),
          ...(p.flavor !== undefined ? { flavor: p.flavor } : {}),
          ...(p.available_flavors ? { available_flavors: p.available_flavors } : {}),
        }).eq('id', ex.id);
        upd++;
      }
    } else {
      const { error } = await supabase.from('products').insert({
        name: p.name, brand: p.brand, store: p.store,
        category: classifyByName(p.name),
        emoji: p.emoji ?? '💊', thumbnail: p.thumbnail ?? null,
        original_price: p.original_price, sale_price: p.sale_price,
        link: p.link, scrape_url: p.link, updated_at: new Date().toISOString(),
        ...(p.flavor !== undefined ? { flavor: p.flavor } : {}),
        ...(p.available_flavors ? { available_flavors: p.available_flavors } : {}),
      });
      if (!error) ins++;
      else console.error('insert error:', error.message, p.name);
    }
  }
  return { inserted: ins, updated: upd };
}

async function upsertEvents(evts: ScrapedEvent[]) {
  for (const e of evts) {
    const { data: ex } = await supabase.from('events').select('id').eq('brand', e.brand).eq('name', e.name).maybeSingle();
    if (ex) {
      await supabase.from('events').update({
        active: e.active, end_date: e.end_date ?? null,
        discount_pct: e.discount_pct ?? null, description: e.description ?? null,
        coupon_code: e.coupon_code ?? null,
      }).eq('id', ex.id);
    } else {
      await supabase.from('events').insert(e);
    }
  }
}

/* ── 메인 핸들러 ─────────────────────────────────────────── */
Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({})) as { sites?: string[] };
  const targets = body.sites ?? ['bsn', 'on', 'myprotein', 'nsstore'];

  const scrapers: Record<string, () => Promise<SiteResult>> = {
    bsn: scrapeBSN, on: scrapeON, myprotein: scrapeMyProtein, nsstore: scrapeNSStore,
  };

  const summary: Record<string, unknown> = {};
  for (const site of targets) {
    if (!scrapers[site]) continue;
    try {
      const r = await withSiteTimeout(scrapers[site], site);
      const [{ inserted, updated }] = await Promise.all([
        upsertProducts(r.products),
        upsertEvents(r.events),
      ]);
      summary[site] = {
        products_found: r.products.length, inserted, updated,
        events_found: r.events.length, error: r.error ?? null,
        debug: r.debug ?? null,
      };
    } catch (e) {
      summary[site] = { error: (e as Error).message };
    }
  }

  await supabase.from('crawl_logs').insert({ ran_at: new Date().toISOString(), summary });

  return new Response(
    JSON.stringify({ ok: true, ran_at: new Date().toISOString(), summary }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
