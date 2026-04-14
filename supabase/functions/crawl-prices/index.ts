/**
 * crawl-prices Edge Function  v4.0
 *
 * 지원 사이트:
 *   1. BSN Korea (bsn.co.kr) — Shopify
 *   2. Optimum Nutrition (optimumnutrition.com/ko-kr) — Shopify
 *   3. MyProtein Korea (myprotein.co.kr) — THG Commerce / Next.js
 *   4. NS Store (ns-store.co.kr) — Cafe24
 *
 * v4.0 변경사항:
 *   - SiteResult에 debug 필드 추가 (크롤링 실패 원인 파악용)
 *   - parseNextData: regex 대신 문자열 검색 + pageProps 키 탐색
 *   - scrapeMyProtein: 디버그 정보 + 데이터 경로 확장
 *   - scrapeNSStore: 디버그 정보 + 다중 URL 패턴 + Cafe24 패턴 개선
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/* ── 공통 타입 ─────────────────────────────────────────── */
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
interface SiteResult {
  site: string; products: ScrapedProduct[]; events: ScrapedEvent[];
  error?: string; debug?: string;
}
interface ShopifyVariant { price: string; compare_at_price: string | null; }
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
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}

async function getJson<T>(url: string, ref = ''): Promise<T> {
  const r = await fetch(url, {
    headers: { ...HEADERS, Accept: 'application/json', ...(ref ? { Referer: ref } : {}) },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.json() as Promise<T>;
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
        products.push({
          name: p.title, brand: 'BSN', store: 'BSN', category: shopifyCat(p.tags, p.product_type),
          original_price: krw(v.compare_at_price) || sale, sale_price: sale,
          link: `https://www.bsn.co.kr/products/${p.handle}`,
          thumbnail: p.images[0]?.src, emoji: '💪',
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
        products.push({
          name: p.title, brand: 'ON (Optimum Nutrition)', store: 'ON 공식몰',
          category: shopifyCat(p.tags, p.product_type),
          original_price: krw(v.compare_at_price) || sale, sale_price: sale,
          link: `${BASE}/products/${p.handle}`,
          thumbnail: p.images[0]?.src, emoji: '🥇',
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
   v4.0: 문자열 검색으로 __NEXT_DATA__ 추출 + 디버그 정보
══════════════════════════════════════════════════════ */

/** pageProps 내에서 products 배열처럼 보이는 경로를 재귀 탐색 */
function findProductArrays(obj: Record<string, unknown>, prefix = '', depth = 0): string[] {
  if (depth > 5) return [];
  const results: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
      const sample = v[0] as Record<string, unknown>;
      if ('price' in sample || 'title' in sample || 'name' in sample || 'sku' in sample) {
        results.push(`${path}[${v.length}]`);
      }
    } else if (typeof v === 'object' && v !== null) {
      results.push(...findProductArrays(v as Record<string, unknown>, path, depth + 1));
    }
  }
  return results;
}

function parseNextData(html: string): { products: Record<string, unknown>[]; debug: string } {
  // regex 대신 문자열 검색으로 더 안정적으로 태그 추출
  let startIdx = html.indexOf('<script id="__NEXT_DATA__"');
  if (startIdx === -1) startIdx = html.indexOf("<script id='__NEXT_DATA__'");
  if (startIdx === -1) {
    const scriptCount = (html.match(/<script/g) ?? []).length;
    return { products: [], debug: `no __NEXT_DATA__; ${scriptCount} <script> tags; html=${html.length}chars` };
  }

  const jsonStart = html.indexOf('>', startIdx) + 1;
  const jsonEnd   = html.indexOf('</script>', jsonStart);
  if (jsonEnd === -1) {
    return { products: [], debug: '__NEXT_DATA__ found but no closing </script>' };
  }

  const jsonStr = html.slice(jsonStart, jsonEnd).trim();
  try {
    const nd = JSON.parse(jsonStr);
    const pp = (nd?.props?.pageProps ?? {}) as Record<string, unknown>;
    const topKeys = Object.keys(pp).slice(0, 12).join(',');

    // 알려진 경로들
    const prods = (
      pp?.products?.products ??
      pp?.categoryPage?.products?.products ??
      pp?.initialData?.products?.products ??
      pp?.productListPage?.products?.products ??
      pp?.serverProps?.initialData?.products?.products ??
      pp?.data?.productListPage?.products?.products ??
      pp?.listingPage?.products?.products ??
      pp?.pageData?.products?.products ??
      (pp?.products as Record<string, unknown>)?.list ??
      []
    ) as Record<string, unknown>[];

    if (prods.length > 0) {
      return { products: prods, debug: `OK: ${prods.length} products` };
    }

    // 탐색으로 products-like 배열 위치 파악
    const found = findProductArrays(pp).slice(0, 8);
    return {
      products: [],
      debug: `pageProps keys: [${topKeys}]; product-like arrays: ${found.join(' | ') || 'none'}; json=${jsonStr.length}chars`,
    };
  } catch (e) {
    return { products: [], debug: `JSON.parse error: ${(e as Error).message}; jsonLen=${jsonStr.length}` };
  }
}

async function scrapeMyProtein(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  const debugParts: string[] = [];
  const BASE = 'https://www.myprotein.co.kr';

  // 카테고리별 URL 후보 (두 가지 패턴 시도)
  const CATS: [string[], string][] = [
    [['/c/protein/?pageSize=96', '/c/protein/'],                    '단백질 파우더'],
    [['/c/creatine/?pageSize=96', '/c/creatine/'],                  '크레아틴'],
    [['/c/amino-acids/?pageSize=96', '/c/amino-acids/'],            'BCAA'],
    [['/c/vitamins-and-supplements/?pageSize=96', '/c/vitamins-and-supplements/'], '영양제'],
  ];

  for (const [paths, cat] of CATS) {
    let parsed = false;
    for (const path of paths) {
      if (parsed) break;
      try {
        const html = await getHtml(`${BASE}${path}`, `${BASE}/`);
        const { products: list, debug: parseDebug } = parseNextData(html);
        debugParts.push(`[${cat}:${path}] ${parseDebug}`);

        if (list.length) {
          parsed = true;
          for (const p of list) {
            const priceObj = (p?.price ?? {}) as Record<string, unknown>;
            const sale = krw(priceObj?.value ?? (p?.specialOffer as Record<string, unknown>)?.price ?? 0);
            if (!sale) continue;
            const orig = krw(priceObj?.rrp ?? sale);
            const imgList = ((p?.images as Record<string, unknown>)?.list as { url: string }[]) ?? [];
            const defaultImg = (p?.images as Record<string, unknown>)?.defaultImage as { url: string } | undefined;
            const thumb = imgList[0]?.url ?? defaultImg?.url ?? undefined;
            const url = String(p?.url ?? p?.canonicalUrl ?? '');
            products.push({
              name: String(p.title ?? p.name ?? ''), brand: '마이프로틴', store: '마이프로틴',
              category: cat, original_price: orig, sale_price: sale,
              link: url.startsWith('http') ? url : `${BASE}${url}`,
              thumbnail: thumb, emoji: '🔵',
            });
          }
        } else {
          // HTML 폴백: alt 텍스트 기반 가격 추출
          const cardRe = /href="(\/p\/[^"]+)"[^>]*>\s*<img[^>]+(?:src|data-src)="(https?:\/\/[^"]+)"[^>]*alt="([^"]{3,100})"[\s\S]{0,800}?(?:₩|KRW|￦)\s*([\d,]+)/g;
          let fallbackCount = 0;
          for (const mm of html.matchAll(cardRe)) {
            const sale = krw(mm[4]); if (!sale) continue;
            products.push({
              name: mm[3].trim(), brand: '마이프로틴', store: '마이프로틴',
              category: cat, original_price: sale, sale_price: sale,
              link: `${BASE}${mm[1]}`, thumbnail: mm[2], emoji: '🔵',
            });
            fallbackCount++;
            parsed = true;
          }
          if (fallbackCount > 0) debugParts.push(`[${cat} fallback] ${fallbackCount} products via alt`);
        }
      } catch (e) {
        debugParts.push(`[${cat}:${path}] FETCH ERROR: ${(e as Error).message}`);
      }
    }
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

  return { site: 'MyProtein', products, events, debug: debugParts.slice(0, 12).join(' || ') };
}

/* ══════════════════════════════════════════════════════
   4. NS Store — Cafe24 (PC 사이트)
   v4.0: 디버그 정보 + 다중 URL + 개선된 Cafe24 파서
══════════════════════════════════════════════════════ */
async function scrapeNSStore(): Promise<SiteResult> {
  const products: ScrapedProduct[] = [];
  const events: ScrapedEvent[] = [];
  const debugParts: string[] = [];
  const BASES = ['https://www.ns-store.co.kr', 'https://ns-store.co.kr'];
  let BASE = BASES[0];

  // 접근 가능한 BASE URL 탐색
  for (const b of BASES) {
    try {
      const h = await getHtml(`${b}/`, `${b}/`);
      BASE = b;
      const catCodes = new Set<string>();
      for (const cm of h.matchAll(/goods_list\.php\?cateCd=(\d{4,})/g)) catCodes.add(cm[1]);
      debugParts.push(`BASE=${b} OK; html=${h.length}chars; cateCodes=${catCodes.size}(${[...catCodes].slice(0,5).join(',')}); hasGoodsNo=${h.includes('goodsNo')}`);
      break;
    } catch (e) {
      debugParts.push(`BASE=${b} ERROR: ${(e as Error).message}`);
    }
  }

  // 카테고리 코드 재수집 (성공한 BASE 기준)
  const catCodes = new Set<string>();
  try {
    const mainHtml = await getHtml(`${BASE}/`, `${BASE}/`);
    for (const cm of mainHtml.matchAll(/goods_list\.php\?cateCd=(\d{4,})/g)) catCodes.add(cm[1]);
    // 짧은 코드도 수집
    for (const cm of mainHtml.matchAll(/cateCd=(\d{3,})/g)) catCodes.add(cm[1]);
  } catch { /* 스킵 */ }

  // 코드 없으면 Cafe24 일반 코드 시도
  const codesToTry = catCodes.size > 0 ? [...catCodes] : [
    '0100000001','0100000002','0100000003','0100000004',
    '001001','001002','001003','001004',
    '0001','0002','0003','0004','0005',
  ];

  for (const code of codesToTry.slice(0, 20)) {
    try {
      const html = await getHtml(`${BASE}/goods/goods_list.php?cateCd=${code}`, `${BASE}/`);
      const beforeCount = products.length;

      // 이미지 맵 (goodsNo → thumbnail)
      const imgMap: Record<string, string> = {};
      for (const im of html.matchAll(/goodsNo=(\d+)[^\s"]*[\s\S]{0,1200}?<img[^>]+(?:src|data-src)="((?:https?:)?\/\/[^"]+\.(jpg|jpeg|png|webp)(?:\?[^"]*)?)"[^>]*>/gi)) {
        if (!imgMap[im[1]]) imgMap[im[1]] = im[2].startsWith('//') ? 'https:' + im[2] : im[2];
      }

      // Cafe24 상품 카드 패턴 1: goods_view 링크 + 클래스 기반
      const re1 = /href="(\/goods\/goods_view\.php\?goodsNo=(\d+)[^"]*)"[\s\S]{0,3000}?(?:class="[^"]*(?:goods_name|item_name|prd_name|name)[^"]*"[^>]*>|<strong\s+class="[^"]*name[^"]*"[^>]*>)\s*(?:<[^>]+>)*\s*([^<]{2,120})\s*(?:<\/[^>]+>)*[\s\S]{0,1000}?(?:class="[^"]*(?:sale_?price|final_?price|goods_price|selling_price|price)[^"]*"[^>]*>[\s<>a-z/"=]*)([\d,]+)/g;
      for (const m of html.matchAll(re1)) {
        const sale = krw(m[4]); if (!sale) continue;
        products.push({
          name: m[3].trim().replace(/\s+/g, ' '), brand: 'NS', store: 'NS스토어',
          category: classifyByName(m[3]),
          original_price: sale, sale_price: sale,
          link: `${BASE}${m[1]}`,
          thumbnail: imgMap[m[2]],
          emoji: '🟢',
        });
      }

      // Cafe24 패턴 2: alt 텍스트에서 이름, 가격
      if (products.length === beforeCount) {
        const re2 = /href="(\/goods\/goods_view\.php\?goodsNo=(\d+))"[^>]*>[\s\S]{0,200}?alt="([^"]{3,120})"[\s\S]{0,2000}?([\d,]+)원/g;
        for (const m of html.matchAll(re2)) {
          const sale = krw(m[4]); if (!sale) continue;
          products.push({
            name: m[3].trim(), brand: 'NS', store: 'NS스토어',
            category: classifyByName(m[3]),
            original_price: sale, sale_price: sale,
            link: `${BASE}${m[1]}`,
            thumbnail: imgMap[m[2]],
            emoji: '🟢',
          });
        }
      }

      const added = products.length - beforeCount;
      if (added > 0) {
        debugParts.push(`cateCd=${code}: +${added} products`);
      } else {
        // 빈 페이지인지 or 제품 파싱 실패인지 확인
        const hasGoods = html.includes('goodsNo') || html.includes('goods_view');
        if (hasGoods) debugParts.push(`cateCd=${code}: html has goods links but regex no match (len=${html.length})`);
        // 빈 카테고리는 조용히 스킵
      }
    } catch (e) {
      debugParts.push(`cateCd=${code}: FETCH ERR ${(e as Error).message}`);
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
      events.push({
        brand: 'ns', brand_label: 'NS스토어', name: m[2].trim().replace(/\s+/g, ' '),
        description: 'NS스토어 진행 중인 이벤트.', color: '#4CAF50',
        active: true, link: `${BASE}${m[1]}`,
      });
    }
  } catch { /* 스킵 */ }

  return { site: 'NSStore', products, events, debug: debugParts.slice(0, 20).join(' || ') };
}

/* ── DB 업서트 ─────────────────────────────────────────── */
async function upsertProducts(prods: ScrapedProduct[]) {
  let ins = 0, upd = 0;
  for (const p of prods) {
    const { data: ex } = await supabase
      .from('products')
      .select('id, sale_price, thumbnail')
      .eq('link', p.link)
      .maybeSingle();

    if (ex) {
      const needsUpdate = ex.sale_price !== p.sale_price || (!ex.thumbnail && p.thumbnail);
      if (needsUpdate) {
        await supabase.from('products').update({
          sale_price: p.sale_price,
          original_price: p.original_price,
          updated_at: new Date().toISOString(),
          ...(p.thumbnail ? { thumbnail: p.thumbnail } : {}),
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
      });
      if (!error) ins++;
      else console.error('insert error:', error.message, p.link);
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
      const r = await scrapers[site]();
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
