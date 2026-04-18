/**
 * crawl-events Edge Function  v1.0
 *
 * 지원 브랜드:
 *   1. 마이프로틴 (myprotein.co.kr)
 *   2. Optimum Nutrition (optimumnutrition.com/ko-kr)
 *   3. BSN (bsn.co.kr)
 *   4. NS프로틴 (nsprotein.com / m.nsprotein.com)
 *   5. 익스트림 (exxxtreme.co.kr)
 *   6. 삼대오백 (samdae500.com)
 *
 * 동작:
 *   1. Jina AI Reader → 직접 fetch 순서로 페이지 텍스트 획득
 *   2. 게시판 페이지는 상위 글 3개까지 추가 크롤링
 *   3. Claude Haiku API로 구조화된 이벤트 데이터 추출
 *   4. Supabase events 테이블에 upsert
 *
 * 필수 Supabase 시크릿:
 *   - ANTHROPIC_API_KEY
 *   - SUPABASE_URL (자동)
 *   - SUPABASE_SERVICE_ROLE_KEY (자동)
 * 선택 시크릿:
 *   - JINA_API_KEY (없어도 동작, 있으면 속도 제한 완화)
 *
 * 수동 실행:
 *   POST /functions/v1/crawl-events
 *   { "brands": ["myprotein", "bsn"] }   ← 특정 브랜드만
 *   {}                                    ← 전체
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const GEMINI_KEY = Deno.env.get('AISTUDIO_API_KEY') ?? '';
const JINA_KEY   = Deno.env.get('JINA_API_KEY') ?? '';

/* ─── 타입 ─────────────────────────────────────────────── */
interface EventRow {
  brand: string;
  brand_label: string;
  name: string;
  description: string;
  discount_pct: number | null;
  color: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  link: string;
  conditions: string[];
  how_to: string[];
  coupon_code: string | null;
  coupon_note: string | null;
  product_types: string[];
}

interface BrandConfig {
  id: string;
  label: string;
  color: string;
  urls: string[];       // 첫 번째가 메인, 이후는 폴백
  isBoard?: boolean;    // 게시판 형태라면 true (상위 글 추가 크롤링)
}

/* ─── 브랜드 설정 ────────────────────────────────────────── */
const BRANDS: BrandConfig[] = [
  {
    id: 'myprotein', label: '마이프로틴', color: '#0077CC',
    urls: ['https://www.myprotein.co.kr/c/voucher-codes/'],
  },
  {
    id: 'on', label: 'Optimum Nutrition', color: '#FFB300',
    urls: ['https://www.optimumnutrition.com/ko-kr/pages/advantageweek'],
  },
  {
    id: 'bsn', label: 'BSN', color: '#E53935',
    urls: [
      'https://www.bsn.co.kr/pages/workout_routine_lets-bsn',
      'https://www.bsn.co.kr/pages/lets-bsn',
    ],
  },
  {
    id: 'nsprotein', label: 'NS프로틴', color: '#4CAF50',
    urls: ['https://m.nsprotein.com/', 'https://nsprotein.com/'],
  },
  {
    id: 'exxxtreme', label: '익스트림', color: '#FF6D00', isBoard: true,
    urls: ['https://exxxtreme.co.kr/board/extrevent/event.html'],
  },
  {
    id: 'samdae500', label: '삼대오백', color: '#7C4DFF', isBoard: true,
    urls: ['https://samdae500.com/board/gallery/list.html?board_no=8&category_no='],
  },
];

/* ─── 공통 fetch 헤더 ────────────────────────────────────── */
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
};

/* ─── Jina AI Reader ─────────────────────────────────────── */
async function fetchViaJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const headers: Record<string, string> = { Accept: 'text/plain' };
  if (JINA_KEY) headers['Authorization'] = `Bearer ${JINA_KEY}`;

  const res = await fetch(jinaUrl, {
    headers,
    signal: AbortSignal.timeout(35000),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  const text = await res.text();
  if (text.trim().length < 150) throw new Error('Jina: insufficient content');
  return text;
}

/* ─── 직접 fetch (HTML → 태그 제거 텍스트) ─────────────────── */
async function fetchDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Referer: new URL(url).origin + '/' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return stripHtml(html);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}

/* ─── 통합 페이지 가져오기 (Jina → 직접 순서) ──────────────── */
async function fetchPageText(url: string): Promise<{ text: string; method: string }> {
  try {
    return { text: await fetchViaJina(url), method: 'jina' };
  } catch (e1) {
    try {
      return { text: await fetchDirect(url), method: 'direct' };
    } catch (e2) {
      throw new Error(`jina: ${(e1 as Error).message} | direct: ${(e2 as Error).message}`);
    }
  }
}

/* ─── 게시판 → 글 URL 추출 ────────────────────────────────── */
async function extractBoardArticleUrls(boardUrl: string): Promise<string[]> {
  let html = '';
  try {
    const res = await fetch(boardUrl, {
      headers: { ...BROWSER_HEADERS, Referer: new URL(boardUrl).origin + '/' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) html = await res.text();
  } catch { return []; }

  const origin = new URL(boardUrl).origin;
  const urls: string[] = [];
  const seen = new Set<string>();

  const patterns = [
    // Cafe24 board view
    /href="(\/board\/[^"]*view[^"]*boardNo=\d+[^"]*)"/gi,
    // exxxtreme product-style event pages
    /href="(\/product\/[^"\/]+\/\d+\/)"/gi,
    // samdae500 board view
    /href="(\/board\/[^"]*view[^"]*uid=\d+[^"]*)"/gi,
    // generic "view" links on same domain
    /href="(\/[^"]*(?:view|article|detail)[^"]*(?:no|id|uid)=\d+[^"]*)"/gi,
  ];

  for (const pat of patterns) {
    for (const m of html.matchAll(pat)) {
      const u = m[1].startsWith('http') ? m[1] : origin + m[1];
      if (!seen.has(u)) { seen.add(u); urls.push(u); }
      if (urls.length >= 8) break;
    }
    if (urls.length >= 8) break;
  }

  return urls.slice(0, 5);
}

/* ─── Gemini 이벤트 추출 ────────────────────────────────── */
async function extractEventsWithClaude(brand: BrandConfig, content: string): Promise<EventRow[]> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `오늘 날짜: ${today}

다음은 "${brand.label}" 브랜드 공식몰 이벤트/프로모션 페이지의 텍스트 내용이야.
현재 진행 중이거나 예정된 이벤트/할인 정보를 모두 추출해서 JSON 배열로 반환해.

**분석 기준:**
1. 할인율 (숫자만, 예: 30)
2. 종료일 (YYYY-MM-DD 형식)
3. 대상 고객 (신규회원? 기존회원? 전체?)
4. 적용 상품 범위 (전 제품? 특정 카테고리?)
5. 중복 적용 가능 여부
6. 쿠폰 코드 (있으면 정확히 기재)
7. 참여 방법 순서

**JSON 배열 형식 (코드블록 없이 순수 JSON만 반환):**
[
  {
    "name": "이벤트 이름 (간결하게)",
    "description": "1-2문장 설명",
    "discountPct": 숫자 또는 null,
    "startDate": "YYYY-MM-DD" 또는 null,
    "endDate": "YYYY-MM-DD" 또는 null,
    "conditions": ["조건1 (최소 구매금액, 적용 상품 등)", "조건2", ...],
    "howTo": ["1단계: ...", "2단계: ...", ...],
    "couponCode": "COUPON" 또는 null,
    "couponNote": "쿠폰 관련 추가 안내" 또는 null,
    "targetAudience": "신규회원" | "기존회원" | "전체" | null,
    "applicableProducts": "전 제품" | "특정 상품 설명" | null,
    "isStackable": true | false | null,
    "active": true 또는 false
  }
]

이벤트가 없거나 내용이 불충분하면 빈 배열 [] 반환.

---
페이지 내용:
${content.slice(0, 12000)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(40000),
    },
  );

  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '[]';

  let parsed: Array<Record<string, unknown>>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try { parsed = JSON.parse(match[0]); }
    catch { return []; }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(e => typeof e.name === 'string' && e.name.trim())
    .map((e): EventRow => {
      const conditions: string[] = Array.isArray(e.conditions) ? e.conditions as string[] : [];
      const howTo: string[]      = Array.isArray(e.howTo)      ? e.howTo      as string[] : [];

      if (e.targetAudience && e.targetAudience !== '전체') {
        conditions.unshift(`대상: ${e.targetAudience}`);
      }
      if (e.applicableProducts && e.applicableProducts !== '전 제품') {
        conditions.push(`적용 상품: ${e.applicableProducts}`);
      }
      if (e.isStackable === true)  conditions.push('다른 할인과 중복 적용 가능');
      if (e.isStackable === false) conditions.push('다른 할인과 중복 불가');

      return {
        brand:       brand.id,
        brand_label: brand.label,
        name:        String(e.name).trim(),
        description: String(e.description ?? '').trim(),
        discount_pct: typeof e.discountPct === 'number' ? e.discountPct : null,
        color:       brand.color,
        active:      e.active !== false,
        start_date:  typeof e.startDate === 'string' ? e.startDate : null,
        end_date:    typeof e.endDate   === 'string' ? e.endDate   : null,
        link:        brand.urls[0],
        conditions,
        how_to:      howTo,
        coupon_code: typeof e.couponCode === 'string' && e.couponCode ? e.couponCode : null,
        coupon_note: typeof e.couponNote === 'string' && e.couponNote ? e.couponNote : null,
        product_types: [],
      };
    });
}

/* ─── 브랜드별 크롤링 ─────────────────────────────────────── */
async function scrapeBrand(brand: BrandConfig): Promise<{
  events: EventRow[]; method: string; error?: string;
}> {
  const contentParts: string[] = [];
  let method = '';

  // 메인 URL 크롤링
  for (const url of brand.urls.slice(0, 2)) {
    try {
      const { text, method: m } = await fetchPageText(url);
      contentParts.push(`\n=== ${url} ===\n${text}`);
      method = m;
      break;
    } catch { /* 다음 URL 시도 */ }
  }

  if (!contentParts.length) {
    return { events: [], method: 'failed', error: '모든 URL 접근 실패' };
  }

  // 게시판이면 상위 글도 크롤링
  if (brand.isBoard) {
    const articleUrls = await extractBoardArticleUrls(brand.urls[0]);
    for (const aUrl of articleUrls.slice(0, 3)) {
      try {
        const { text } = await fetchPageText(aUrl);
        contentParts.push(`\n=== ${aUrl} ===\n${text}`);
      } catch { /* 스킵 */ }
    }
  }

  const combined = contentParts.join('\n').slice(0, 20000);

  try {
    const events = await extractEventsWithClaude(brand, combined);
    return { events, method };
  } catch (e) {
    return { events: [], method, error: (e as Error).message };
  }
}

/* ─── DB upsert ────────────────────────────────────────────── */
async function upsertEvents(events: EventRow[]) {
  if (!events.length) return 0;

  const brands = [...new Set(events.map(e => e.brand))];
  const { data: existing } = await supabase
    .from('events')
    .select('id, brand, name')
    .in('brand', brands);

  const existMap = new Map((existing ?? []).map(e => [`${e.brand}::${e.name}`, e.id as number]));
  let upserted = 0;

  for (const evt of events) {
    const key = `${evt.brand}::${evt.name}`;
    const existId = existMap.get(key);

    if (existId) {
      await supabase.from('events').update({
        description:  evt.description,
        discount_pct: evt.discount_pct,
        active:       evt.active,
        start_date:   evt.start_date,
        end_date:     evt.end_date,
        link:         evt.link,
        conditions:   evt.conditions,
        how_to:       evt.how_to,
        coupon_code:  evt.coupon_code,
        coupon_note:  evt.coupon_note,
      }).eq('id', existId);
    } else {
      await supabase.from('events').insert(evt);
    }
    upserted++;
  }
  return upserted;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

/* ─── 메인 핸들러 ─────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const body = await req.json().catch(() => ({})) as { brands?: string[] };
    const targets = body.brands
      ? BRANDS.filter(b => (body.brands as string[]).includes(b.id))
      : BRANDS;

    console.log(`[crawl-events] 시작: ${targets.map(b => b.id).join(', ')}`);
    console.log(`[crawl-events] GEMINI_KEY 설정 여부: ${!!GEMINI_KEY}`);

    const summary: Record<string, unknown> = {};

    for (const brand of targets) {
      console.log(`[crawl-events] 처리 중: ${brand.id}`);
      try {
        const { events, method, error } = await scrapeBrand(brand);
        console.log(`[crawl-events] ${brand.id}: ${events.length}개 이벤트, method=${method}, error=${error}`);
        const upserted = await upsertEvents(events);
        summary[brand.id] = {
          events_found: events.length,
          upserted,
          method,
          error: error ?? null,
          event_names: events.map(e => e.name),
        };
      } catch (e) {
        console.error(`[crawl-events] ${brand.id} 오류:`, e);
        summary[brand.id] = { error: (e as Error).message };
      }
    }

    try {
      await supabase.from('crawl_logs').insert({
        ran_at: new Date().toISOString(),
        summary: { type: 'events', ...summary },
      });
    } catch (e) {
      console.error('[crawl-events] crawl_logs 저장 실패:', e);
    }

    console.log('[crawl-events] 완료');
    return new Response(
      JSON.stringify({ ok: true, ran_at: new Date().toISOString(), summary }, null, 2),
      { headers: CORS },
    );
  } catch (fatal) {
    console.error('[crawl-events] FATAL:', fatal);
    return new Response(
      JSON.stringify({ ok: false, error: String(fatal) }),
      { status: 500, headers: CORS },
    );
  }
});
