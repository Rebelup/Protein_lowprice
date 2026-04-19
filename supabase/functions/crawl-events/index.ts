/**
 * crawl-events — 페이지 변경 감지 + 새 이벤트 알림
 * DB 규칙: crawl_targets(last_hash, last_checked_at)만 업데이트 가능
 *          events / products 테이블에는 절대 쓰지 않음
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
const GEMINI_KEY = Deno.env.get('AISTUDIO_API_KEY') ?? '';
const JINA_KEY   = Deno.env.get('JINA_API_KEY') ?? '';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchPage(url: string): Promise<string> {
  if (JINA_KEY) {
    try {
      const r = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Authorization: `Bearer ${JINA_KEY}`, Accept: 'text/plain' },
        signal: AbortSignal.timeout(25000),
      });
      if (r.ok) {
        const t = await r.text();
        if (t.length > 150) return t;
      }
    } catch { /* fallback */ }
  }
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{3,}/g, '\n')
    .trim();
}

async function extractEventNames(siteLabel: string, content: string): Promise<string[]> {
  if (!GEMINI_KEY) return [];
  const prompt = `사이트: ${siteLabel}
아래 페이지에서 현재 진행중이거나 예정된 이벤트/할인/프로모션 이름만 JSON 문자열 배열로 추출. 없으면 [].
코드블록 없이 순수 JSON만 반환.
---
${content.slice(0, 5000)}`;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!r.ok) return [];
    const data = await r.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '[]';
    const m = raw.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed) ? (parsed as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  } catch { return []; }
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { data: targets } = await supabase.from('crawl_targets').select('*').eq('active', true);
    if (!targets?.length) {
      return new Response(JSON.stringify({ ok: true, checked: 0, alerts: 0 }), { headers: CORS });
    }

    let checked = 0, alertCount = 0;
    const now = new Date().toISOString();

    for (const target of targets) {
      try {
        const content = await fetchPage(target.url);
        const hash = await sha256(content);
        checked++;

        // 해시 + 체크 시각만 업데이트 (events/products 불변)
        await supabase.from('crawl_targets')
          .update({ last_hash: hash, last_checked_at: now })
          .eq('id', target.id);

        if (target.last_hash && target.last_hash === hash) continue; // 변경 없음

        // 페이지 변경됨 → AI로 이벤트명 추출
        const eventNames = await extractEventNames(target.label || target.brand, content);
        if (!eventNames.length) {
          // 이벤트는 못 찾았지만 페이지가 바뀐 것 자체를 알림
          await supabase.from('crawl_alerts').insert({
            target_id: target.id, brand: target.brand,
            label: `페이지 변경 감지 — ${target.label || target.brand}`,
            url: target.url, seen: false,
            snippet: '페이지 내용이 변경됐습니다. 직접 확인이 필요합니다.',
          });
          alertCount++;
          continue;
        }

        // 기존 events 테이블과 비교 (읽기만)
        const { data: existing } = await supabase.from('events').select('name').eq('brand', target.brand);
        const existSet = new Set((existing ?? []).map((e) => e.name.toLowerCase().trim()));
        const newEvents = eventNames.filter((n) => !existSet.has(n.toLowerCase().trim()));

        if (newEvents.length) {
          await supabase.from('crawl_alerts').insert(
            newEvents.map((name) => ({
              target_id: target.id, brand: target.brand,
              label: `새 이벤트 감지 — ${target.label || target.brand}`,
              url: target.url, seen: false, snippet: name,
            })),
          );
          alertCount += newEvents.length;
        }
      } catch (err) {
        console.error(`[crawl-events] ${target.url}:`, err);
      }
    }

    await supabase.from('crawl_logs').insert({
      ran_at: now, summary: { type: 'events', checked, alerts: alertCount },
    });

    return new Response(JSON.stringify({ ok: true, checked, alerts: alertCount }), { headers: CORS });
  } catch (err) {
    console.error('[crawl-events] FATAL:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: CORS });
  }
});
