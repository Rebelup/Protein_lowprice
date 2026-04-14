/**
 * crawl-prices Edge Function
 *
 * 매일 자정 pg_cron이 이 함수를 호출합니다.
 * products 테이블의 scrape_url 이 있는 상품을 순회하며
 * 해당 페이지에서 가격을 추출 → sale_price 업데이트합니다.
 *
 * 가격 추출 우선순위:
 *   1. JSON-LD (schema.org/Product → offers.price)
 *   2. og:price:amount <meta> 태그
 *   3. product_info.price 같은 마이프로틴/BSN 특화 selector 패턴
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/* ── 숫자 추출 헬퍼 ───────────────────────────────────── */
function parsePrice(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  return isNaN(n) || n <= 0 ? null : Math.round(n);
}

/* ── HTML에서 가격 추출 ─────────────────────────────────
   1순위: JSON-LD schema.org/Product
   2순위: og:price:amount
   3순위: 마이프로틴 / BSN 패턴 */
function extractPrice(html: string): number | null {
  // 1. JSON-LD
  const ldMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of ldMatches) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const price =
          node?.offers?.price ??
          node?.offers?.[0]?.price ??
          node?.price;
        const p = parsePrice(price);
        if (p) return p;
      }
    } catch { /* ignore */ }
  }

  // 2. og:price:amount
  const ogMatch = html.match(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i)
                ?? html.match(/content=["']([^"']+)["'][^>]+property=["']og:price:amount["']/i);
  if (ogMatch) {
    const p = parsePrice(ogMatch[1]);
    if (p) return p;
  }

  // 3. 마이프로틴 패턴: "currentPrice":"39900" or data-price="39900"
  const mpMatch = html.match(/"currentPrice"\s*:\s*"?(\d+(?:\.\d+)?)"?/)
               ?? html.match(/data-product-price=["'](\d+)["']/)
               ?? html.match(/class=["'][^"']*price[^"']*["'][^>]*>[\s\S]*?₩\s*([\d,]+)/i);
  if (mpMatch) {
    const p = parsePrice(mpMatch[1]);
    if (p) return p;
  }

  // 4. BSN 패턴: Shopify의 price JSON
  const shopifyMatch = html.match(/"price"\s*:\s*(\d+)/);
  if (shopifyMatch) {
    // Shopify는 원 단위를 100으로 나눔 (cents)
    const raw = parseInt(shopifyMatch[1], 10);
    // 10만원 이상이면 원화, 이하면 센트 단위로 판단
    return raw > 100000 ? raw : Math.round(raw / 100);
  }

  return null;
}

/* ── 메인 핸들러 ────────────────────────────────────────── */
Deno.serve(async (req) => {
  // CRON 내부 호출 또는 Authorization 헤더로만 허용
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!auth.includes(serviceKey) && req.method !== 'POST') {
    return new Response('Unauthorized', { status: 401 });
  }

  // scrape_url 이 있는 상품 조회
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, sale_price, scrape_url')
    .not('scrape_url', 'is', null)
    .neq('scrape_url', '');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: { id: number; name: string; old: number; new: number | null; status: string }[] = [];

  for (const product of products ?? []) {
    try {
      const res = await fetch(product.scrape_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PriceBot/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();
      const newPrice = extractPrice(html);

      if (newPrice && newPrice !== product.sale_price) {
        await supabase
          .from('products')
          .update({ sale_price: newPrice, updated_at: new Date().toISOString() })
          .eq('id', product.id);

        results.push({ id: product.id, name: product.name, old: product.sale_price, new: newPrice, status: 'updated' });
      } else {
        results.push({ id: product.id, name: product.name, old: product.sale_price, new: newPrice, status: newPrice ? 'unchanged' : 'parse_failed' });
      }
    } catch (e) {
      results.push({ id: product.id, name: product.name, old: product.sale_price, new: null, status: `error: ${e.message}` });
    }
  }

  // 크롤링 로그 저장
  await supabase.from('crawl_logs').insert({
    ran_at: new Date().toISOString(),
    summary: results,
  }).then(() => {});

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
