import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const GEMINI_KEY = Deno.env.get('AISTUDIO_API_KEY') ?? '';
const JINA_KEY   = Deno.env.get('JINA_API_KEY') ?? '';

interface EventRow {
  brand: string; brand_label: string; name: string; description: string;
  discount_pct: number | null; color: string; active: boolean;
  start_date: string | null; end_date: string | null; link: string;
  conditions: string[]; how_to: string[];
  coupon_code: string | null; coupon_note: string | null; product_types: string[];
}

interface BrandConfig {
  id: string; label: string; color: string; urls: string[]; isBoard?: boolean;
}

const BRANDS: BrandConfig[] = [
  { id: 'myprotein',  label: '마이프로틴',        color: '#0077CC', urls: ['https://www.myprotein.co.kr/c/voucher-codes/'] },
  { id: 'on',         label: 'Optimum Nutrition', color: '#FFB300', urls: ['https://www.optimumnutrition.com/ko-kr/pages/advantageweek'] },
  { id: 'bsn',        label: 'BSN',               color: '#E53935', urls: ['https://www.bsn.co.kr/pages/workout_routine_lets-bsn', 'https://www.bsn.co.kr/pages/lets-bsn'] },
  { id: 'nsprotein',  label: 'NS프로틴',           color: '#4CAF50', urls: ['https://m.nsprotein.com/', 'https://nsprotein.com/'] },
  { id: 'exxxtreme',  label: '익스트림',           color: '#FF6D00', urls: ['https://exxxtreme.co.kr/board/extrevent/event.html'], isBoard: true },
  { id: 'samdae500',  label: '삼대오백',           color: '#7C4DFF', urls: ['https://samdae500.com/board/gallery/list.html?board_no=8&category_no='], isBoard: true },
];

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const BROWSER_HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'ko-KR,ko;q=0.9', 'Cache-Control': 'no-cache' };

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt);/g, (m) => ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>' }[m] ?? m))
    .replace(/\s{3,}/g, '\n\n').trim();
}

async function fetchViaJina(url: string): Promise<string> {
  const headers: Record<string, string> = { Accept: 'text/plain' };
  if (JINA_KEY) headers['Authorization'] = `Bearer ${JINA_KEY}`;
  const res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  const text = await res.text();
  if (text.trim().length < 150) throw new Error('Jina: too short');
  return text;
}

async function fetchDirect(url: string): Promise<string> {
  const res = await fetch(url, { headers: { ...BROWSER_HEADERS, Referer: new URL(url).origin + '/' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return stripHtml(await res.text());
}

async function fetchPageText(url: string): Promise<{ text: string; method: string }> {
  try { return { text: await fetchViaJina(url), method: 'jina' }; }
  catch (e1) {
    try { return { text: await fetchDirect(url), method: 'direct' }; }
    catch (e2) { throw new Error(`jina:${(e1 as Error).message}|direct:${(e2 as Error).message}`); }
  }
}

async function extractBoardArticleUrls(boardUrl: string): Promise<string[]> {
  try {
    const res = await fetch(boardUrl, { headers: { ...BROWSER_HEADERS, Referer: new URL(boardUrl).origin + '/' }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const html = await res.text();
    const origin = new URL(boardUrl).origin;
    const seen = new Set<string>();
    const urls: string[] = [];
    const patterns = [
      /href="(\/board\/[^"]*view[^"]*boardNo=\d+[^"]*)"/gi,
      /href="(\/product\/[^"/]+\/\d+\/)"/gi,
      /href="(\/board\/[^"]*view[^"]*uid=\d+[^"]*)"/gi,
      /href="(\/[^"]*(?:view|article|detail)[^"]*(?:no|id|uid)=\d+[^"]*)"/gi,
    ];
    for (const pat of patterns) {
      for (const m of html.matchAll(pat)) {
        const u = m[1].startsWith('http') ? m[1] : origin + m[1];
        if (!seen.has(u)) { seen.add(u); urls.push(u); }
        if (urls.length >= 5) break;
      }
      if (urls.length >= 5) break;
    }
    return urls.slice(0, 3);
  } catch { return []; }
}

async function extractEvents(brand: BrandConfig, content: string): Promise<EventRow[]> {
  if (!GEMINI_KEY) throw new Error('AISTUDIO_API_KEY not configured');

  const prompt = `오늘: ${new Date().toISOString().slice(0, 10)}
브랜드: ${brand.label}

아래 페이지에서 현재 진행중/예정 이벤트·할인을 JSON 배열로 추출. 코드블록 없이 순수 JSON만.
[{"name":"이름","description":"설명","discountPct":숫자|null,"startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"conditions":[],"howTo":[],"couponCode":null,"couponNote":null,"targetAudience":"신규회원"|"기존회원"|"전체"|null,"applicableProducts":"전 제품"|"설명"|null,"isStackable":true|false|null,"active":true|false}]
없으면 [].

---
${content.slice(0, 7000)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), signal: AbortSignal.timeout(40000) },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '[]';

  let parsed: Array<Record<string, unknown>>;
  try { parsed = JSON.parse(raw); }
  catch {
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try { parsed = JSON.parse(m[0]); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(e => typeof e.name === 'string' && e.name.trim()).map((e): EventRow => {
    const conditions: string[] = Array.isArray(e.conditions) ? e.conditions as string[] : [];
    const howTo: string[] = Array.isArray(e.howTo) ? e.howTo as string[] : [];
    if (e.targetAudience && e.targetAudience !== '전체') conditions.unshift(`대상: ${e.targetAudience}`);
    if (e.applicableProducts && e.applicableProducts !== '전 제품') conditions.push(`적용 상품: ${e.applicableProducts}`);
    if (e.isStackable === true)  conditions.push('다른 할인과 중복 적용 가능');
    if (e.isStackable === false) conditions.push('다른 할인과 중복 불가');
    return {
      brand: brand.id, brand_label: brand.label, name: String(e.name).trim(),
      description: String(e.description ?? '').trim(),
      discount_pct: typeof e.discountPct === 'number' ? e.discountPct : null,
      color: brand.color, active: e.active !== false,
      start_date: typeof e.startDate === 'string' ? e.startDate : null,
      end_date:   typeof e.endDate   === 'string' ? e.endDate   : null,
      link: brand.urls[0], conditions, how_to: howTo,
      coupon_code: typeof e.couponCode === 'string' && e.couponCode ? e.couponCode : null,
      coupon_note: typeof e.couponNote === 'string' && e.couponNote ? e.couponNote : null,
      product_types: [],
    };
  });
}

async function scrapeBrand(brand: BrandConfig): Promise<{ events: EventRow[]; method: string; error?: string }> {
  let text = '', method = '';
  for (const url of brand.urls.slice(0, 2)) {
    try { ({ text, method } = await fetchPageText(url)); break; }
    catch { /* try next */ }
  }
  if (!text) return { events: [], method: 'failed', error: '모든 URL 접근 실패' };

  const parts = [`=== ${brand.urls[0]} ===\n${text}`];

  if (brand.isBoard) {
    const articleUrls = await extractBoardArticleUrls(brand.urls[0]);
    const results = await Promise.allSettled(articleUrls.map(u => fetchPageText(u)));
    for (const r of results) {
      if (r.status === 'fulfilled') parts.push(r.value.text);
    }
  }

  const combined = parts.join('\n').slice(0, 10000);

  try {
    return { events: await extractEvents(brand, combined), method };
  } catch (e) {
    return { events: [], method, error: (e as Error).message };
  }
}

async function upsertEvents(events: EventRow[]) {
  if (!events.length) return 0;
  const brands = [...new Set(events.map(e => e.brand))];
  const { data: existing } = await supabase.from('events').select('id, brand, name').in('brand', brands);
  const existMap = new Map((existing ?? []).map(e => [`${e.brand}::${e.name}`, e.id as number]));
  let upserted = 0;
  for (const evt of events) {
    const existId = existMap.get(`${evt.brand}::${evt.name}`);
    if (existId) {
      await supabase.from('events').update({
        description: evt.description, discount_pct: evt.discount_pct, active: evt.active,
        start_date: evt.start_date, end_date: evt.end_date, link: evt.link,
        conditions: evt.conditions, how_to: evt.how_to, coupon_code: evt.coupon_code, coupon_note: evt.coupon_note,
      }).eq('id', existId);
    } else {
      await supabase.from('events').insert(evt);
    }
    upserted++;
  }
  return upserted;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const body = await req.json().catch(() => ({})) as { brands?: string[] };
    const targets = body.brands ? BRANDS.filter(b => (body.brands as string[]).includes(b.id)) : BRANDS;

    console.log(`[crawl-events] 시작: ${targets.map(b => b.id).join(', ')} | key:${!!GEMINI_KEY}`);

    // 모든 브랜드 병렬 처리
    const results = await Promise.allSettled(targets.map(b => scrapeBrand(b)));

    const allEvents: EventRow[] = [];
    const summary: Record<string, unknown> = {};

    for (let i = 0; i < targets.length; i++) {
      const brand = targets[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        const { events, method, error } = result.value;
        allEvents.push(...events);
        summary[brand.id] = { events_found: events.length, method, error: error ?? null, event_names: events.map(e => e.name) };
      } else {
        summary[brand.id] = { error: String(result.reason) };
      }
    }

    const upserted = await upsertEvents(allEvents);

    try {
      await supabase.from('crawl_logs').insert({ ran_at: new Date().toISOString(), summary: { type: 'events', total_upserted: upserted, ...summary } });
    } catch (e) { console.error('crawl_logs 저장 실패:', e); }

    console.log(`[crawl-events] 완료: ${allEvents.length}개 이벤트, ${upserted}개 upsert`);
    return new Response(JSON.stringify({ ok: true, ran_at: new Date().toISOString(), total_events: allEvents.length, upserted, summary }, null, 2), { headers: CORS });
  } catch (fatal) {
    console.error('[crawl-events] FATAL:', fatal);
    return new Response(JSON.stringify({ ok: false, error: String(fatal) }), { status: 500, headers: CORS });
  }
});
