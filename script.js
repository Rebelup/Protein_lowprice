'use strict';

const SUPABASE_URL      = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const ADMIN_EMAIL = 'fightingman012@gmail.com';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let EVENTS = [], PRODUCTS = [], ALL_BRANDS = [], ALL_TYPES = [], ALL_CAT1 = [], ALL_CAT2 = [];
let currentUser = null, pendingLink = null;
let brandGroup = null, typeGroup = null, prodBrandGroup = null;

const state = { search: '', sort: 'discount_desc', brands: new Set(), productTypes: new Set(), period: 'all' };
const prodState = { sort: 'price_asc', cat1: '', cat2: '', brands: new Set(), priceRange: 'all', discountMin: 0, showEventPrice: true };

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const safeUrl = (u) => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? u : '#'; } catch { return '#'; } };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const pad2 = (n) => String(n).padStart(2, '0');
const daysUntil = (d) => { if (!d) return Infinity; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.ceil((new Date(d) - t) / 86400000); };
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const base = `${dt.getFullYear()}.${pad2(dt.getMonth() + 1)}.${pad2(dt.getDate())}`;
  const hm = dt.getHours() || dt.getMinutes() ? ` ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}` : '';
  return base + hm;
};
const fmtPeriod = (s, e) => {
  if (!s && !e) return '상시';
  if (!s) return `~ ${fmtDate(e)}`;
  if (!e) return `${fmtDate(s)} ~`;
  return `${fmtDate(s)} ~ ${fmtDate(e)}`;
};

const STATUS_LABEL = { ongoing: '진행중', ending: '종료임박', upcoming: '예정', ended: '종료' };
function eventStatus(e) {
  const now = Date.now();
  if (e.startDate && new Date(e.startDate).getTime() > now) return 'upcoming';
  if ((e.endDate && new Date(e.endDate).getTime() < now) || !e.active) return 'ended';
  const left = daysUntil(e.endDate);
  return (left <= 7 && left >= 0) ? 'ending' : 'ongoing';
}
// Returns a "남음" label that adapts unit (일/시간/분) based on time remaining.
function eventTimeLeftText(e) {
  if (!e?.endDate) return '';
  const st = eventStatus(e);
  if (st !== 'ongoing' && st !== 'ending') return '';
  const ms = +new Date(e.endDate) - Date.now();
  if (ms <= 0) return '';
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}일 남음`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}시간 남음`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins}분 남음`;
}
function getSoonestEndingEvent(p) {
  const eligible = EVENTS.filter((e) =>
    e.productIds.includes(p.id) && e.active !== false &&
    (eventStatus(e) === 'ongoing' || eventStatus(e) === 'ending')
  );
  if (!eligible.length) return null;
  return eligible.reduce((a, b) => {
    const aEnd = a.endDate ? +new Date(a.endDate) : Infinity;
    const bEnd = b.endDate ? +new Date(b.endDate) : Infinity;
    return aEnd <= bEnd ? a : b;
  });
}

/* ── DATA ── */
async function loadProducts() {
  const { data } = await db.from('products').select('*').order('id');
  PRODUCTS = (data || []).map((p) => ({
    id: p.id, name: p.name, brand: p.brand, store: p.store || p.brand,
    category1: p.category1 || '', category2: p.category2 || '', category3: p.category3 || '', category4: p.category4 || '',
    emoji: p.emoji || '💊', thumbnail: p.thumbnail || '',
    originalPrice: p.original_price || 0, salePrice: p.sale_price || 0,
    link: p.link || '#',
    calories: p.calories ?? null, servingSize: p.serving_size_g ?? null,
    protein: p.protein_g ?? null, carb: p.carb_g ?? null, fat: p.fat_g ?? null,
    sodium: p.sodium_mg ?? null,
    sugar: p.sugar_g ?? null, saturatedFat: p.saturated_fat_g ?? null,
    transFat: p.trans_fat_g ?? null, cholesterol: p.cholesterol_mg ?? null,
    shortDesc: p.short_desc || '',
    options: p.options || [],
    optionSkus: (p.option_skus || []).map((s) => ({ combo: s.combo || [], price: s.price || 0, origPrice: s.orig_price || 0 })),
  }));
}

async function loadEvents() {
  const { data, error } = await db.from('events').select('*').order('id');
  if (error) throw new Error(error.message);
  EVENTS = (data || []).map((e) => ({
    id: e.id, brand: e.brand, brandLabel: e.brand_label, name: e.name,
    desc: e.description || '', discountPct: e.discount_pct, discountAmount: e.discount_amount || 0,
    color: e.color || '#0077CC', active: e.active,
    startDate: e.start_date || '', endDate: e.end_date || '', link: e.link || '',
    conditions: e.conditions || [], howTo: e.how_to || [],
    couponNote: e.coupon_note || '', couponCode: e.coupon_code || '',
    productTypes: e.product_types || [],
    productIds: e.product_ids || [],
    thumbnail: e.thumbnail || '',
    combinable: e.combinable ?? false,
    discountBase: e.discount_base || 'sale',
  }));
}

async function loadFilterOptions() {
  const { data } = await db.from('filter_options').select('*').order('sort_order');
  if (!data) return;
  const map = (t) => data.filter((r) => r.type === t).map((r) => ({ value: r.value, label: r.label }));
  ALL_BRANDS = map('brand');
  ALL_TYPES = map('category');
  ALL_CAT1 = map('cat1');
  ALL_CAT2 = map('cat2');
}

// Resolve a stored category value to its display label. cat3/cat4 have no
// filter_options rows so they fall back to the stored value.
function catLabel(value, level) {
  if (!value) return '';
  const list = level === 1 ? ALL_CAT1 : level === 2 ? ALL_CAT2 : null;
  if (!list) return value;
  return list.find((x) => x.value === value)?.label || value;
}

/* ── FILTER + SORT ── */
function getFiltered() {
  const q = state.search.toLowerCase();
  return EVENTS.filter((e) => {
    if (q && !(e.name + ' ' + e.brandLabel + ' ' + e.desc).toLowerCase().includes(q)) return false;
    if (!state.brands.has(e.brand)) return false;
    if (e.productTypes?.length && !e.productTypes.some((t) => state.productTypes.has(t))) return false;
    if (state.period !== 'all' && eventStatus(e) !== state.period) return false;
    return true;
  }).sort((a, b) => {
    if (state.sort === 'discount_desc') return (b.discountPct || 0) - (a.discountPct || 0);
    if (state.sort === 'end_asc') return (a.endDate ? new Date(a.endDate).getTime() : 32503680000000) - (b.endDate ? new Date(b.endDate).getTime() : 32503680000000);
    if (state.sort === 'name') return a.name.localeCompare(b.name, 'ko');
    return 0;
  });
}

/* ── PRODUCTS ── */
const fmtPrice = (n) => n ? '₩' + n.toLocaleString('ko-KR') : '';

function getCheapestSku(p) {
  if (!p.optionSkus?.length) return null;
  return p.optionSkus.filter((s) => s.price > 0).sort((a, b) => a.price - b.price)[0] ?? null;
}

// Cheapest visible price after the best applicable event discount.
function getFinalPrice(p) {
  const cheapest = getCheapestSku(p);
  const base = cheapest ? cheapest.price : p.salePrice;
  const ev = getBestEventPrice(p, base);
  return ev ? ev.price : base;
}

function getFirstSkuPrice(p) {
  const cheapest = getCheapestSku(p);
  if (cheapest) return cheapest.price;
  return p.salePrice;
}

function eventBasePrice(e, p) {
  const sale = getFirstSkuPrice(p);
  return e.discountBase === 'original' ? (p.originalPrice || sale) : sale;
}

// Given an event, returns the discounted price for `base` (or `base` itself if
// the event has neither pct nor amount). Amount discount wins when both are set.
function applyEventDiscount(e, base) {
  if (e.discountAmount > 0) return Math.max(0, base - e.discountAmount);
  if (e.discountPct > 0) return Math.round(base * (1 - e.discountPct / 100));
  return base;
}
function eventSavings(e, base) { return Math.max(0, base - applyEventDiscount(e, base)); }

function getBestEventPrice(p, overridePrice = null) {
  const eligible = EVENTS.filter((e) =>
    e.productIds.includes(p.id) && e.active !== false &&
    (eventStatus(e) === 'ongoing' || eventStatus(e) === 'ending')
  );
  const basePrice = overridePrice ?? getFirstSkuPrice(p);
  if (!eligible.length || !basePrice) return null;

  const combinable = eligible.filter((e) => e.combinable && (e.discountPct || e.discountAmount));
  let optionA = null;
  if (combinable.length >= 2) {
    let price = basePrice;
    combinable.forEach((e) => { price = applyEventDiscount(e, price); });
    optionA = { price, pct: Math.round((1 - price / basePrice) * 100), eventName: `${combinable.length}개 이벤트 중복 적용` };
  }

  const best = eligible.reduce((a, b) => (eventSavings(b, basePrice) > eventSavings(a, basePrice) ? b : a));
  const base = best.discountBase === 'original' ? (p.originalPrice || basePrice) : basePrice;
  const evPrice = applyEventDiscount(best, base);
  const optionB = { price: evPrice, pct: Math.round((1 - evPrice / basePrice) * 100), eventName: best.name };

  return (optionA && optionA.price < optionB.price) ? optionA : optionB;
}

// Shared price block for product cards (home + event-page related list).
// applyEvent=true folds the best applicable event discount into the displayed
// price/disc, applyEvent=false shows raw 판매가 vs 정가.
function productPriceBlock(p, applyEvent) {
  const cheapest = getCheapestSku(p);
  const basePrice = cheapest ? cheapest.price : p.salePrice;
  const skuOrig = cheapest?.origPrice && cheapest.origPrice > cheapest.price ? cheapest.origPrice : 0;
  const baseOrig = skuOrig || (p.originalPrice > basePrice ? p.originalPrice : basePrice);
  const ev = applyEvent ? getBestEventPrice(p) : null;
  const finalPrice = ev ? ev.price : basePrice;
  const finalOrig = baseOrig > finalPrice ? baseOrig : (p.originalPrice > finalPrice ? p.originalPrice : 0);
  const finalDisc = finalOrig ? Math.max(1, Math.ceil((1 - finalPrice / finalOrig) * 100)) : 0;
  const priceRow = `<div class="prod-card-price">
      ${finalDisc > 0 ? `<span class="prod-pct">-${finalDisc}%</span>` : ''}
      <span class="prod-sale">${fmtPrice(finalPrice)}</span>
      ${finalDisc > 0 ? `<span class="prod-orig">${fmtPrice(finalOrig)}</span>` : ''}
    </div>`;
  if (!applyEvent) return priceRow;
  if (!ev) return `${priceRow}<div class="prod-ev-tag prod-ev-tag--none">이벤트 없음</div>`;
  const ddSoon = eventTimeLeftText(getSoonestEndingEvent(p));
  const ddChip = ddSoon ? `<span class="evt-card-dday prod-ev-dday">${ddSoon}</span>` : '';
  return `${priceRow}<div class="prod-ev-tag">⚡ 이벤트 적용가${ddChip}</div>`;
}

function renderProductCard(p) {
  const thumb = p.thumbnail
    ? `<img src="${esc(safeUrl(p.thumbnail))}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : esc(p.emoji || "");
  const priceHtml = productPriceBlock(p, prodState.showEventPrice);
  // Last non-empty category as a small chip on the card thumbnail (max 6 chars).
  // Uses display label when one is registered (cat1/cat2); cat3/cat4 fall back
  // to the raw value.
  const lastPair = [
    [4, p.category4], [3, p.category3], [2, p.category2], [1, p.category1],
  ].find(([, v]) => v);
  const lastLabel = lastPair ? catLabel(lastPair[1], lastPair[0]) : '';
  const catChip = lastLabel
    ? `<span class="prod-card-cat">${esc(lastLabel.length > 6 ? lastLabel.slice(0, 6) + '..' : lastLabel)}</span>`
    : '';
  return `<article class="prod-card" data-pid="${p.id}">
    <div class="prod-card-thumb">${catChip}${thumb}</div>
    <div class="prod-card-body">
      <div class="prod-card-name">${esc(p.name)}</div>
      <div class="prod-card-brand">${esc(p.store)}</div>
      ${priceHtml}
    </div>
  </article>`;
}

function renderProdCat1Chips() {
  const row = $('prodCatRow');
  if (!row) return;
  if (!ALL_CAT1.length) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  row.innerHTML = `<button class="prod-cat-chip ${!prodState.cat1 ? 'active' : ''}" data-cat="">전체</button>`
    + ALL_CAT1.map((t) => `<button class="prod-cat-chip ${prodState.cat1 === t.value ? 'active' : ''}" data-cat="${esc(t.value)}">${esc(t.label)}</button>`).join('');
}

function renderProdCat2Chips() {
  const row = $('prodCat2Row');
  if (!row) return;
  if (!prodState.cat1 || !ALL_CAT2.length) { row.classList.add('hidden'); return; }
  row.classList.remove('hidden');
  row.innerHTML = `<button class="prod-cat-chip ${!prodState.cat2 ? 'active' : ''}" data-cat="">전체</button>`
    + ALL_CAT2.map((t) => `<button class="prod-cat-chip ${prodState.cat2 === t.value ? 'active' : ''}" data-cat="${esc(t.value)}">${esc(t.label)}</button>`).join('');
}

function renderProducts() {
  const sq = state.search.toLowerCase();
  let items = PRODUCTS.filter((p) => {
    if (sq && !([p.name, p.brand, p.store, p.shortDesc, p.category1, p.category2].filter(Boolean).join(' ')).toLowerCase().includes(sq)) return false;
    if (prodState.cat1 && p.category1 !== prodState.cat1) return false;
    if (prodState.cat2 && p.category2 !== prodState.cat2) return false;
    if (prodState.brands.size > 0 && prodState.brands.size < ALL_BRANDS.length && !prodState.brands.has(p.brand)) return false;
    const price = p.salePrice;
    if (prodState.priceRange === 'u30000' && price > 30000) return false;
    if (prodState.priceRange === 'u50000' && price > 50000) return false;
    if (prodState.priceRange === 'u100000' && price > 100000) return false;
    if (prodState.priceRange === 'o100000' && price < 100000) return false;
    if (prodState.discountMin > 0) {
      const d = p.originalPrice > p.salePrice ? Math.round((1 - p.salePrice / p.originalPrice) * 100) : 0;
      if (d < prodState.discountMin) return false;
    }
    return true;
  });
  items = [...items].sort((a, b) => {
    if (prodState.sort === 'discount_desc') {
      const fa = getFinalPrice(a), fb = getFinalPrice(b);
      const da = a.originalPrice > fa ? 1 - fa / a.originalPrice : 0;
      const db2 = b.originalPrice > fb ? 1 - fb / b.originalPrice : 0;
      return db2 - da;
    }
    if (prodState.sort === 'price_asc') return getFinalPrice(a) - getFinalPrice(b);
    if (prodState.sort === 'price_desc') return getFinalPrice(b) - getFinalPrice(a);
    return a.name.localeCompare(b.name, 'ko');
  });
  $('prodResultCount').textContent = items.length;
  const grid = $('productsGrid');
  if (!items.length) { grid.innerHTML = ''; $('prodEmptyState').classList.remove('hidden'); return; }
  grid.innerHTML = items.map(renderProductCard).join('');
  $('prodEmptyState').classList.add('hidden');
}

function switchTab(tab) {
  $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('eventsTab').classList.toggle('hidden', tab !== 'events');
  $('productsTab').classList.toggle('hidden', tab !== 'products');
  if (tab === 'products') renderProducts();
}

/* ── RENDER ── */
function renderCard(e) {
  const st = eventStatus(e);
  const period = fmtPeriod(e.startDate, e.endDate);
  const dd = eventTimeLeftText(e);
  const ddLabel = st === 'ended' ? '종료' : (st === 'upcoming' ? STATUS_LABEL.upcoming : dd);
  const thumb = e.thumbnail
    ? `<img src="${esc(safeUrl(e.thumbnail))}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🏷️'}))">`
    : '🏷️';
  return `<article class="evt-card evt-card--${st}" data-eid="${e.id}">
    <div class="evt-card-thumb">${thumb}</div>
    <div class="evt-card-body">
      <div class="evt-card-name">${esc(e.name)}</div>
      <div class="evt-card-period">${period}</div>
      ${e.desc ? `<div class="evt-card-desc">${esc(e.desc)}</div>` : ''}
      ${ddLabel ? `<span class="evt-card-dday ${st === 'ended' ? 'evt-card-dday--ended' : ''}">${ddLabel}</span>` : ''}
    </div>
  </article>`;
}

function render() {
  const items = getFiltered();
  $('resultCount').textContent = items.length;
  const grid = $('eventsGrid'), empty = $('emptyState');
  if (!items.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); }
  else { grid.innerHTML = items.map(renderCard).join(''); empty.classList.add('hidden'); }
  renderProducts();
}

function showLoading(v) { $('loadingOverlay').classList.toggle('hidden', !v); }
function showDbError(msg) {
  $('eventsGrid').innerHTML = `<div class="db-error"><span class="db-error-icon">⚠️</span><p>데이터를 불러오지 못했습니다</p><small>${esc(msg)}</small></div>`;
  showLoading(false);
}

/* ── EVENT DETAIL PAGE ── */
function openEventPage(id, replaceUrl = false) {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) return;
  renderEventPage(e);
  const page = $('eventPage');
  page.classList.remove('hidden');
  page.getBoundingClientRect();
  page.classList.add('page-open');
  document.body.style.overflow = 'hidden';
  if (replaceUrl) history.replaceState({ eventId: id }, '', `?event=${id}`);
  else history.pushState({ eventId: id }, '', `?event=${id}`);
}

function hideEventPage() {
  const page = $('eventPage');
  if (page.classList.contains('hidden')) return;
  page.classList.remove('page-open');
  setTimeout(() => {
    page.classList.add('hidden');
    $('eventPageBody').textContent = '';
    if ($('prodPage').classList.contains('hidden')) document.body.style.overflow = '';
  }, 360);
}
function closeEventPage() {
  hideEventPage();
  if (history.state?.eventId) history.back();
}

function renderEventPage(e) {
  const st = eventStatus(e);
  const dd = eventTimeLeftText(e);
  const safeLink = esc(safeUrl(e.link));
  const sect = (title, body) => `<div class="ep-section"><div class="ep-section-title">${title}</div>${body}</div>`;

  const DESC_LIMIT = 120;
  const descSection = e.desc
    ? sect('📝 이벤트 설명', (() => {
        const raw = String(e.desc);
        const full = esc(raw);
        if (raw.length <= DESC_LIMIT) return `<p class="ep-desc">${full}</p>`;
        const shortText = esc(raw.slice(0, DESC_LIMIT).trimEnd() + '…');
        return `<div class="ep-desc-wrap">
          <p class="ep-desc ep-desc--short">${shortText}</p>
          <p class="ep-desc ep-desc--full hidden">${full}</p>
          <button class="ep-desc-toggle" type="button" data-expanded="false">더보기</button>
        </div>`;
      })())
    : '';

  const typeChips = e.productTypes?.length
    ? sect('🏷️ 적용 상품 유형', `<div class="ep-chips">${e.productTypes.map((t) => `<span class="ep-chip">${esc(ALL_TYPES.find((p) => p.value === t)?.label || t)}</span>`).join('')}</div>`)
    : '';
  const conds = e.conditions?.length
    ? sect('💡 이벤트 조건', `<ul class="ep-list">${e.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`)
    : '';
  const howTo = e.howTo?.length
    ? sect('📋 참여 방법', `<ol class="ep-steps">${e.howTo.map((s, i) => `<li class="ep-step"><span class="ep-step-num" style="background:${e.color}">${i + 1}</span><span class="ep-step-text">${esc(s)}</span></li>`).join('')}</ol>`)
    : '';
  const coupon = e.couponCode
    ? sect('🎟️ 쿠폰 코드', `<div class="ep-coupon"><code>${esc(e.couponCode)}</code><button class="ep-coupon-copy" data-code="${esc(e.couponCode)}">복사</button></div>${e.couponNote ? `<p class="ep-coupon-note">${esc(e.couponNote)}</p>` : ''}`)
    : (e.couponNote ? sect('📌 안내', `<p class="ep-coupon-note">${esc(e.couponNote)}</p>`) : '');

  $('eventPageBody').innerHTML = `
    <div class="ep-hero" style="background:linear-gradient(135deg, ${e.color}, ${e.color}dd)">
      <div class="ep-hero-brand">${esc(e.brandLabel)}</div>
      <div class="ep-hero-name">${esc(e.name)}</div>
      <div class="ep-hero-meta">
        <span class="ep-hero-status ep-hero-status--${st}">${STATUS_LABEL[st] || ''}</span>
        ${dd ? `<span class="ep-hero-dday">${dd}</span>` : ''}
      </div>
    </div>
    ${descSection}
    ${sect('📅 기간', `<div class="ep-info-box">${fmtPeriod(e.startDate, e.endDate)}</div>`)}
    ${typeChips}${conds}${howTo}${coupon}
    ${(() => {
      const linked = PRODUCTS.filter((p) => (e.productIds || []).includes(p.id));
      if (!linked.length) return '';
      const cards = linked.map((p) => {
        const thumb = p.thumbnail
          ? `<img src="${esc(safeUrl(p.thumbnail))}" alt="" loading="lazy" onerror="this.style.display='none'">`
          : esc(p.emoji || "");
        const priceHtml = productPriceBlock(p, true);
        return `<article class="prod-card ep-rel-prod-card" data-pid="${p.id}">
          <div class="prod-card-thumb">${thumb}</div>
          <div class="prod-card-body">
            <div class="prod-card-name">${esc(p.name)}</div>
            <div class="prod-card-brand">${esc(p.store)}</div>
            ${priceHtml}
          </div>
        </article>`;
      }).join('');
      return sect('🛍️ 관련 상품', `<div class="ep-rel-prod-grid">${cards}</div>`);
    })()}`;

  $('epCtaBar').innerHTML = `<a class="ep-cta" href="${safeLink}" target="_blank" rel="noopener noreferrer" id="epCtaBtn">이벤트 페이지로 이동 →</a>`;

  const copyBtn = $('eventPageBody').querySelector('.ep-coupon-copy');
  copyBtn?.addEventListener('click', () => {
    navigator.clipboard?.writeText(copyBtn.dataset.code).then(() => {
      copyBtn.textContent = '복사됨!';
      setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
    });
  });

  const descToggle = $('eventPageBody').querySelector('.ep-desc-toggle');
  descToggle?.addEventListener('click', () => {
    const wrap = descToggle.closest('.ep-desc-wrap');
    const expanded = descToggle.dataset.expanded === 'true';
    wrap.querySelector('.ep-desc--short').classList.toggle('hidden', !expanded);
    wrap.querySelector('.ep-desc--full').classList.toggle('hidden', expanded);
    descToggle.dataset.expanded = expanded ? 'false' : 'true';
    descToggle.textContent = expanded ? '더보기' : '간략히';
  });

  $('eventPageBody').querySelectorAll('.ep-rel-prod-card[data-pid]').forEach((card) => {
    card.addEventListener('click', () => openProductPage(+card.dataset.pid));
  });
}

/* ── PRODUCT PAGE ── */
function openProductPage(id, replaceUrl = false) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  renderProductPage(p);
  const page = $('prodPage');
  page.classList.remove('hidden');
  page.getBoundingClientRect();
  page.classList.add('page-open');
  document.body.style.overflow = 'hidden';
  if (replaceUrl) history.replaceState({ prodId: id }, '', `?product=${id}`);
  else history.pushState({ prodId: id }, '', `?product=${id}`);
  logProductView(id);
}

function hideProductPage() {
  const page = $('prodPage');
  if (page.classList.contains('hidden')) return;
  page.classList.remove('page-open');
  setTimeout(() => {
    page.classList.add('hidden');
    $('prodPageBody').textContent = '';
    $('ppCtaBar').textContent = '';
    if ($('eventPage').classList.contains('hidden')) document.body.style.overflow = '';
  }, 360);
}
function closeProductPage() {
  hideProductPage();
  if (history.state?.prodId) history.back();
}

function renderProductPage(p) {
  const disc = p.originalPrice > p.salePrice ? Math.round((1 - p.salePrice / p.originalPrice) * 100) : 0;
  const thumb = p.thumbnail
    ? `<img src="${esc(safeUrl(p.thumbnail))}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : esc(p.emoji || "");
  const sect = (title, body) => `<div class="ep-section"><div class="ep-section-title">${title}</div>${body}</div>`;
  const hasOptions = p.options && p.options.length > 0;

  // 영양 정보
  const hasNutri = p.protein !== null || p.carb !== null || p.fat !== null || p.calories !== null;
  const hasMacro = p.protein !== null && p.carb !== null && p.fat !== null;
  let nutriSection = '';
  if (hasNutri) {
    const prot = p.protein ?? 0, carb = p.carb ?? 0, fat = p.fat ?? 0;
    const maxMacro = hasMacro ? Math.max(prot, carb, fat) : 0;
    const barW = (n) => maxMacro ? Math.round(n / maxMacro * 100) : 0;
    const macroRows = hasMacro ? `
      <div class="nutri-bars">
        <div class="nutri-bar-row">
          <span class="nutri-bar-label">단백질</span>
          <div class="nutri-bar-track"><div class="nutri-bar-fill nb-prot" style="width:${barW(prot)}%"></div></div>
          <span class="nutri-bar-g">${prot}g</span>
        </div>
        <div class="nutri-bar-row">
          <span class="nutri-bar-label">탄수화물</span>
          <div class="nutri-bar-track"><div class="nutri-bar-fill nb-carb" style="width:${barW(carb)}%"></div></div>
          <span class="nutri-bar-g">${carb}g</span>
        </div>
        <div class="nutri-bar-row">
          <span class="nutri-bar-label">지방</span>
          <div class="nutri-bar-track"><div class="nutri-bar-fill nb-fat" style="width:${barW(fat)}%"></div></div>
          <span class="nutri-bar-g">${fat}g</span>
        </div>
      </div>` : '';
    const tableRows = [
      ['열량', p.calories != null ? `${p.calories} kcal` : null],
      ['단백질', p.protein != null ? `${p.protein} g` : null],
      ['탄수화물', p.carb != null ? `${p.carb} g` : null],
      ['  당류', p.sugar != null ? `${p.sugar} g` : null],
      ['지방', p.fat != null ? `${p.fat} g` : null],
      ['  포화지방', p.saturatedFat != null ? `${p.saturatedFat} g` : null],
      ['  트랜스지방', p.transFat != null ? `${p.transFat} g` : null],
      ['콜레스테롤', p.cholesterol != null ? `${p.cholesterol} mg` : null],
      ['나트륨', p.sodium != null ? `${p.sodium} mg` : null],
    ].filter(([, v]) => v !== null)
     .map(([label, val]) => {
       const indent = label.startsWith('  ');
       const l = label.trim();
       return `<tr class="${indent ? 'nt-indent' : ''}"><td class="nt-label">${indent ? `<span class="nt-indent-dot">└</span>${l}` : l}</td><td class="nt-val">${val}</td></tr>`;
     }).join('');
    const servingNote = p.servingSize ? `<div class="nt-serving">1회 제공량 ${p.servingSize}g 기준</div>` : '';
    nutriSection = `<div id="ppNutriSection">${sect('영양 정보', `${macroRows}<div class="nutri-table-wrap">${servingNote}<table class="nutri-table"><tbody>${tableRows}</tbody></table></div>`)}</div>`;
  }

  // 관련 이벤트
  const linked = EVENTS.filter((e) => e.productIds.includes(p.id) && e.active !== false && eventStatus(e) !== 'ended');
  let eventsSection = '';
  if (linked.length) {
    const cards = linked.map((e) => {
      const color = e.color || '#1A69E5';
      const st = eventStatus(e);
      const stLabel = { ongoing: '진행중', ending: '종료임박', upcoming: '예정', ended: '종료' }[st] || '';
      const dd = eventTimeLeftText(e);
      const period = fmtPeriod(e.startDate, e.endDate);

      // 이벤트 적용 시 가격
      let priceHtml = '';
      if ((e.discountPct || e.discountAmount) && p.salePrice) {
        const base = eventBasePrice(e, p);
        const eventPrice = applyEventDiscount(e, base);
        const savings = p.salePrice - eventPrice;
        const badge = e.discountAmount > 0 ? `-${fmtPrice(e.discountAmount)}` : `-${e.discountPct}%`;
        priceHtml = `<div class="pp-ev-price-box" data-discount-pct="${e.discountPct || 0}" data-discount-amount="${e.discountAmount || 0}" data-discount-base="${e.discountBase || 'sale'}">
          <div class="pp-ev-price-label">이벤트 적용 시 예상 가격</div>
          <div class="pp-ev-price-row">
            <span class="pp-ev-orig-price">${fmtPrice(p.salePrice)}</span>
            <span class="pp-ev-arr">→</span>
            <span class="pp-ev-event-price">${fmtPrice(eventPrice)}</span>
            <span class="pp-ev-save-badge">${badge}</span>
          </div>
          <div class="pp-ev-save-text">${fmtPrice(savings)} 절약</div>
        </div>`;
      }

      const conds = e.conditions?.length
        ? `<div class="pp-ev-sub-head">💡 이벤트 조건</div><ul class="pp-ev-cond-list">${e.conditions.map((c) => `<li><span class="pp-ev-check">✓</span><span>${esc(c)}</span></li>`).join('')}</ul>`
        : '';
      const howTo = e.howTo?.length
        ? `<div class="pp-ev-sub-head">📋 참여 방법</div><div class="pp-ev-steps">${e.howTo.map((s, i) => `<div class="pp-ev-step-row"><span class="pp-ev-step-num" style="background:${esc(color)}">${i + 1}</span><span class="pp-ev-step-text">${esc(s)}</span></div>`).join('')}</div>`
        : '';
      const coupon = e.couponCode
        ? `<div class="ep-coupon" style="margin-top:14px"><code>${esc(e.couponCode)}</code><button class="ep-coupon-copy" data-code="${esc(e.couponCode)}">복사</button></div>${e.couponNote ? `<p class="ep-coupon-note">${esc(e.couponNote)}</p>` : ''}`
        : (e.couponNote ? `<p class="ep-coupon-note" style="margin-top:10px">${esc(e.couponNote)}</p>` : '');

      return `<div class="pp-ev-card">
        <div class="pp-ev-accent" style="background:${esc(color)}"></div>
        <div class="pp-ev-inner">
          <div class="pp-ev-head">
            <div class="pp-ev-name">${esc(e.name)}</div>
            <div class="pp-ev-badges">
              <span class="pp-ev-brand-tag" style="background:${esc(color)}1a;color:${esc(color)}">${esc(e.brandLabel)}</span>
              <span class="pp-ev-status-tag">${stLabel}${dd ? ' · ' + dd : ''}</span>
              ${e.combinable ? '<span class="pp-ev-combinable-tag">중복 가능</span>' : ''}
            </div>
          </div>
          ${priceHtml}
          <div class="pp-ev-detail-row">
            <span class="pp-ev-detail-label">기간</span>
            <span class="pp-ev-detail-val">${period}</span>
          </div>
          ${conds}${howTo}${coupon}
          <a class="pp-ev-link-btn" href="${esc(safeUrl(e.link))}" target="_blank" rel="noopener noreferrer">이벤트 페이지로 이동 →</a>
        </div>
      </div>`;
    }).join('');
    eventsSection = `<div id="ppEventsSection" class="ep-section"><div class="ep-section-title">관련 이벤트</div>${cards}</div>`;
  }

  // 리뷰 섹션
  const rvWriteForm = currentUser
    ? `<div class="rv-write"><div class="rv-stars-select" id="rvStars">${[1,2,3,4,5].map((n) => `<button type="button" class="rv-star-btn" data-v="${n}">★</button>`).join('')}</div><textarea class="rv-textarea" id="rvText" placeholder="이 상품에 대한 리뷰를 남겨주세요..." rows="3"></textarea><button class="rv-submit-btn" id="rvSubmit">리뷰 등록</button></div>`
    : `<p class="rv-login-prompt"><button class="link-btn" id="rvLoginPrompt">로그인</button>하고 리뷰를 남겨보세요.</p>`;
  const reviewSection = `<div id="ppReviewSection">${sect('리뷰', `${rvWriteForm}<div id="rvList"><div class="rv-loading">불러오는 중...</div></div>`)}</div>`;

  // 탭 바
  const tabs = [];
  if (eventsSection) tabs.push({ target: 'ppEventsSection', label: '이벤트' });
  if (nutriSection) tabs.push({ target: 'ppNutriSection', label: '영양성분' });
  tabs.push({ target: 'ppReviewSection', label: '리뷰' });
  const tabBar = tabs.length >= 2
    ? `<div class="pp-inner-tabs">${tabs.map((t, i) => `<button class="pp-inner-tab${i === 0 ? ' active' : ''}" data-target="${t.target}">${t.label}</button>`).join('')}</div>`
    : '';

  $('ppCtaBar').innerHTML = `<a class="ep-cta" id="ppBuyCta" data-pid="${p.id}" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener noreferrer">구매하러 가기 →</a>`;

  // Sort option values by the cheapest SKU price that uses each value (ascending).
  // As a side-effect the cheapest combo value lands first in each group.
  const cheapestSku = getCheapestSku(p);
  if (p.optionSkus?.length && p.options?.length) {
    p.options.forEach((g, gi) => {
      const priceOf = (v) => {
        let min = Infinity;
        for (const s of p.optionSkus) if (s.combo[gi] === v && s.price > 0 && s.price < min) min = s.price;
        return min;
      };
      g.values = [...g.values].sort((a, b) => priceOf(a) - priceOf(b));
    });
  }

  let optionSectionHtml = '';
  const FIRST_OPT_PREVIEW = 6;
  if (hasOptions) {
    const groupsHtml = p.options.map((g, gi) => {
      const values = g.values || [];
      const count = values.length;
      const collapsible = gi === 0 && count > FIRST_OPT_PREVIEW;
      const btnsHtml = values.map((v, vi) => {
        const hidden = collapsible && vi >= FIRST_OPT_PREVIEW ? ' pp-opt-btn--hidden' : '';
        return `<button type="button" class="pp-opt-btn${hidden}" data-gi="${gi}" data-val="${esc(v)}">${esc(v)}</button>`;
      }).join('');
      return `
      <div class="pp-opt-group" data-gi="${gi}">
        <div class="pp-opt-group-name">${esc(g.name)} <span class="pp-opt-count">(${count})</span></div>
        <div class="pp-opt-btns" data-collapsed="${collapsible ? 'true' : 'false'}">
          ${btnsHtml}
          ${collapsible ? `<button type="button" class="pp-opt-more" data-gi="${gi}">더보기 (+${count - FIRST_OPT_PREVIEW})</button>` : ''}
        </div>
      </div>`;
    }).join('');
    optionSectionHtml = `<div class="pp-opt-section" id="ppOptSection">
      ${groupsHtml}
      <div class="pp-opt-card hidden" id="ppOptCard"></div>
    </div>`;
  } else {
    const basePrice = p.salePrice;
    const bestEv = getBestEventPrice(p);
    const discOrig = p.originalPrice > p.salePrice ? Math.max(1, Math.ceil((1 - p.salePrice / p.originalPrice) * 100)) : 0;
    let cardHtml = '';
    if (p.originalPrice && p.originalPrice > p.salePrice) {
      cardHtml += `<div class="pp-opt-card-row">
        <span class="pp-opt-card-label pp-opt-card-label--muted">정가</span>
        <span class="pp-opt-card-orig">${fmtPrice(p.originalPrice)}</span>
      </div>`;
    }
    cardHtml += `<div class="pp-opt-card-row">
      <span class="pp-opt-card-label">판매가</span>
      <div class="pp-opt-card-price-right">
        ${discOrig > 0 ? `<span class="pp-opt-card-badge">-${discOrig}%</span>` : ''}
        <span class="pp-opt-card-price">${fmtPrice(basePrice)}</span>
      </div>
    </div>`;
    if (bestEv) {
      if (bestEv.pct > 0) {
        const saving = basePrice - bestEv.price;
        cardHtml += `<div class="pp-opt-card-divider"></div>
          <div class="pp-opt-evt-row">
            <span class="pp-opt-evt-label">⚡ 이벤트 최대할인</span>
            <span class="pp-opt-evt-disc">-${bestEv.pct}%&nbsp;&nbsp;-${fmtPrice(saving)}</span>
          </div>
          <div class="pp-opt-evt-final">
            <span class="pp-opt-evt-final-label">최종 가격</span>
            <span class="pp-opt-evt-final-price">${fmtPrice(bestEv.price)}</span>
          </div>`;
      } else {
        cardHtml += `<div class="pp-opt-card-divider"></div>
          <div class="pp-opt-evt-row">
            <span class="pp-opt-evt-label">⚡ 이벤트 적용중</span>
          </div>`;
      }
    }
    optionSectionHtml = `<div class="pp-opt-section"><div class="pp-opt-card pp-opt-card--standalone">${cardHtml}</div></div>`;
  }

  const SHORT_DESC_MAX = 100;
  const shortDescHtml = p.shortDesc ? (() => {
    const needsToggle = p.shortDesc.length > SHORT_DESC_MAX;
    return `<div class="pp-short-desc-wrap">
      <p class="pp-short-desc${needsToggle ? ' pp-short-desc--collapsed' : ''}" id="ppShortDesc">${esc(p.shortDesc)}</p>
      ${needsToggle ? `<button type="button" class="pp-short-desc-toggle" id="ppShortDescToggle">더보기</button>` : ''}
    </div>`;
  })() : '';

  const cats = [
    catLabel(p.category1, 1),
    catLabel(p.category2, 2),
    catLabel(p.category3, 3),
    catLabel(p.category4, 4),
  ].filter(Boolean);
  const breadcrumbHtml = cats.length
    ? `<div class="pp-breadcrumb">${cats.map(esc).join(' <span class="pp-bc-sep">›</span> ')}</div>`
    : '';
  $('prodPageBody').innerHTML = `
    <div class="pp-hero">
      <div class="pp-hero-thumb">${thumb}</div>
      <div class="pp-hero-info">
        <div class="pp-hero-brand">${esc(p.store || p.brand)}</div>
        <div class="pp-hero-name">${esc(p.name)}</div>
        ${breadcrumbHtml}
      </div>
    </div>
    ${shortDescHtml}
    ${optionSectionHtml}
    ${tabBar}
    ${eventsSection}${nutriSection}${reviewSection}`;

  // 옵션 선택 핸들러
  if (p.options && p.options.length) {
    // 자동 선택: 가장 저렴한 SKU의 combo를 기본값으로. 모자란 dim은 해당 옵션의 첫 값.
    const selectedVals = p.options.map((g) => g.values[0] || null);
    if (cheapestSku) {
      for (let i = 0; i < selectedVals.length; i++) {
        if (cheapestSku.combo[i]) selectedVals[i] = cheapestSku.combo[i];
      }
    }

    const updatePrices = () => {
      p.options.forEach((g, gi) => {
        const btns = $('prodPageBody').querySelectorAll(`.pp-opt-btn[data-gi="${gi}"]`);
        btns.forEach((btn) => {
          const hasValid = p.optionSkus.some((s) =>
            s.price > 0 &&
            s.combo[gi] === btn.dataset.val &&
            selectedVals.every((tv, i) => i >= gi || tv === null || s.combo[i] === tv)
          );
          btn.style.display = hasValid ? '' : 'none';
        });
      });

      const allSelected = selectedVals.every((v) => v !== null);
      const sku = allSelected
        ? p.optionSkus.find((s) => s.combo.length === selectedVals.length && s.combo.every((v, i) => v === selectedVals[i]))
        : null;
      const skuPrice = sku && sku.price > 0 ? sku.price : null;
      const basePrice = skuPrice || p.salePrice;

      const cardEl = $('ppOptCard');
      if (cardEl) {
        if (allSelected) {
          let cardHtml = '';
          if (skuPrice) {
            const discPctOpt = sku.origPrice > sku.price ? Math.max(1, Math.ceil((1 - sku.price / sku.origPrice) * 100)) : 0;
            if (sku.origPrice && sku.origPrice > sku.price) {
              cardHtml += `<div class="pp-opt-card-row">
                <span class="pp-opt-card-label pp-opt-card-label--muted">정가</span>
                <span class="pp-opt-card-orig">${fmtPrice(sku.origPrice)}</span>
              </div>`;
            }
            cardHtml += `<div class="pp-opt-card-row">
              <span class="pp-opt-card-label">판매가</span>
              <div class="pp-opt-card-price-right">
                ${discPctOpt > 0 ? `<span class="pp-opt-card-badge">-${discPctOpt}%</span>` : ''}
                <span class="pp-opt-card-price">${fmtPrice(sku.price)}</span>
              </div>
            </div>`;
          } else {
            cardHtml += `<div class="pp-opt-card-row">
              <span class="pp-opt-card-label">가격 정보 없음</span>
            </div>`;
          }
          const ev = getBestEventPrice(p, basePrice);
          if (ev) {
            if (ev.pct > 0) {
              const saving = basePrice - ev.price;
              cardHtml += `<div class="pp-opt-card-divider"></div>
                <div class="pp-opt-evt-row">
                  <span class="pp-opt-evt-label">⚡ 이벤트 적용 최대할인</span>
                  <span class="pp-opt-evt-disc">-${ev.pct}%&nbsp;&nbsp;-${fmtPrice(saving)}</span>
                </div>
                <div class="pp-opt-evt-final">
                  <span class="pp-opt-evt-final-label">최종 가격</span>
                  <span class="pp-opt-evt-final-price">${fmtPrice(ev.price)}</span>
                </div>`;
            } else {
              cardHtml += `<div class="pp-opt-card-divider"></div>
                <div class="pp-opt-evt-row">
                  <span class="pp-opt-evt-label">⚡ 이벤트 적용중</span>
                </div>`;
            }
          }
          cardEl.innerHTML = cardHtml;
          cardEl.classList.remove('hidden');
        } else {
          cardEl.classList.add('hidden');
        }
      }

      $('prodPageBody').querySelectorAll('.pp-ev-price-box[data-discount-pct]').forEach((box) => {
        const discPct = +box.dataset.discountPct;
        const discAmt = +(box.dataset.discountAmount || 0);
        const discBase = box.dataset.discountBase;
        const base = discBase === 'original' ? (p.originalPrice || p.salePrice) : basePrice;
        const evPrice = discAmt > 0 ? Math.max(0, base - discAmt) : Math.round(base * (1 - discPct / 100));
        const savings = basePrice - evPrice;
        box.querySelector('.pp-ev-orig-price').textContent = fmtPrice(basePrice);
        box.querySelector('.pp-ev-event-price').textContent = fmtPrice(evPrice);
        box.querySelector('.pp-ev-save-text').textContent = `${fmtPrice(Math.max(0, savings))} 절약`;
      });
    };

    p.options.forEach((g, gi) => {
      const v = selectedVals[gi];
      if (!v) return;
      const btn = $('prodPageBody').querySelector(`.pp-opt-btn[data-gi="${gi}"][data-val="${esc(v)}"]`);
      if (btn) btn.classList.add('active');
    });
    updatePrices();

    $('prodPageBody').addEventListener('click', (e) => {
      const moreBtn = e.target.closest('.pp-opt-more');
      if (moreBtn) {
        const giM = +moreBtn.dataset.gi;
        const container = $('prodPageBody').querySelector(`.pp-opt-group[data-gi="${giM}"] .pp-opt-btns`);
        if (!container) return;
        const collapsed = container.dataset.collapsed === 'true';
        const allBtns = container.querySelectorAll('.pp-opt-btn');
        if (collapsed) {
          allBtns.forEach((b) => b.classList.remove('pp-opt-btn--hidden'));
          container.dataset.collapsed = 'false';
          moreBtn.textContent = '간략히';
        } else {
          allBtns.forEach((b, idx) => { if (idx >= FIRST_OPT_PREVIEW) b.classList.add('pp-opt-btn--hidden'); });
          container.dataset.collapsed = 'true';
          moreBtn.textContent = `더보기 (+${allBtns.length - FIRST_OPT_PREVIEW})`;
        }
        return;
      }
      const btn = e.target.closest('.pp-opt-btn');
      if (!btn) return;
      const gi = +btn.dataset.gi;
      const val = btn.dataset.val;
      const group = $('prodPageBody').querySelector(`.pp-opt-group[data-gi="${gi}"]`);
      group.querySelectorAll('.pp-opt-btn').forEach((b) => b.classList.remove('active'));
      if (selectedVals[gi] === val) {
        selectedVals[gi] = null;
      } else {
        btn.classList.add('active');
        selectedVals[gi] = val;
      }
      for (let i = gi + 1; i < p.options.length; i++) {
        const cur = selectedVals[i];
        const stillValid = cur && p.optionSkus.some((s) =>
          s.price > 0 && s.combo[i] === cur &&
          selectedVals.every((tv, j) => j >= i || tv === null || s.combo[j] === tv)
        );
        if (!stillValid) {
          const firstValid = p.options[i].values.find((v) =>
            p.optionSkus.some((s) =>
              s.price > 0 && s.combo[i] === v &&
              selectedVals.every((tv, j) => j >= i || tv === null || s.combo[j] === tv)
            )
          );
          selectedVals[i] = firstValid || null;
          const subGroup = $('prodPageBody').querySelector(`.pp-opt-group[data-gi="${i}"]`);
          subGroup.querySelectorAll('.pp-opt-btn').forEach((b) => b.classList.remove('active'));
          if (firstValid) {
            const newBtn = subGroup.querySelector(`.pp-opt-btn[data-val="${esc(firstValid)}"]`);
            if (newBtn) {
              newBtn.classList.add('active');
              // If the auto-picked button is in the collapsed tail, expand
              // the group so the user sees the selection.
              if (newBtn.classList.contains('pp-opt-btn--hidden')) {
                const subContainer = subGroup.querySelector('.pp-opt-btns');
                subContainer?.querySelectorAll('.pp-opt-btn').forEach((b) => b.classList.remove('pp-opt-btn--hidden'));
                if (subContainer) subContainer.dataset.collapsed = 'false';
                const subMore = subGroup.querySelector('.pp-opt-more');
                if (subMore) subMore.textContent = '간략히';
              }
            }
          }
        }
      }
      updatePrices();
    });
  }

  const toggleBtn = $('ppShortDescToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const desc = $('ppShortDesc');
      const collapsed = desc.classList.toggle('pp-short-desc--collapsed');
      toggleBtn.textContent = collapsed ? '더보기' : '간략히';
    });
  }

  $('prodPageBody').querySelectorAll('.pp-inner-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $('prodPageBody').querySelectorAll('.pp-inner-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = $(tab.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('prodPageBody').querySelectorAll('.ep-coupon-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(btn.dataset.code).then(() => {
        btn.textContent = '복사됨!';
        setTimeout(() => { btn.textContent = '복사'; }, 1500);
      });
    });
  });

  // 리뷰 폼 핸들러
  let rvRating = 0;
  const rvStars = $('rvStars');
  if (rvStars) {
    const btns = [...rvStars.querySelectorAll('.rv-star-btn')];
    const setActive = (n) => btns.forEach((b, i) => b.classList.toggle('active', i < n));
    const setHover = (n) => btns.forEach((b, i) => b.classList.toggle('hover', i < n));
    btns.forEach((btn) => {
      btn.addEventListener('click', () => { rvRating = +btn.dataset.v; setActive(rvRating); });
      btn.addEventListener('mouseenter', () => setHover(+btn.dataset.v));
      btn.addEventListener('mouseleave', () => setHover(0));
    });
    $('rvSubmit').addEventListener('click', async () => {
      if (!rvRating) return showToast('별점을 선택해주세요');
      const content = $('rvText')?.value.trim();
      if (!content) return showToast('리뷰 내용을 입력해주세요');
      const submitBtn = $('rvSubmit');
      submitBtn.disabled = true;
      const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || '익명';
      const { error } = await db.from('reviews').insert({
        product_id: p.id, user_id: currentUser.id,
        user_name: name, user_avatar: currentUser.user_metadata?.avatar_url || null,
        rating: rvRating, content,
      });
      submitBtn.disabled = false;
      if (error) return showToast('오류가 발생했습니다');
      $('rvText').value = '';
      rvRating = 0;
      setActive(0);
      await loadAndRenderReviews(p.id);
    });
  }
  $('rvLoginPrompt')?.addEventListener('click', openLoginSheet);

  // 리뷰 목록 이벤트 위임 (섹션 div 재사용)
  const rvSection = $('ppReviewSection');
  if (rvSection) {
    rvSection.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-del]');
      if (delBtn && currentUser) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        const tbl = delBtn.dataset.del === 'review' ? 'reviews' : 'review_comments';
        await db.from(tbl).delete().eq('id', +delBtn.dataset.id);
        await loadAndRenderReviews(p.id);
        return;
      }
      const postBtn = e.target.closest('.cmt-post-btn');
      if (postBtn) {
        if (!currentUser) { openLoginSheet(); return; }
        const rid = +postBtn.dataset.rid;
        const inp = rvSection.querySelector(`.cmt-input[data-rid="${rid}"]`);
        const content = inp?.value.trim();
        if (!content) return;
        postBtn.disabled = true;
        const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || '익명';
        const { error } = await db.from('review_comments').insert({
          review_id: rid, user_id: currentUser.id,
          user_name: name, user_avatar: currentUser.user_metadata?.avatar_url || null, content,
        });
        postBtn.disabled = false;
        if (!error) await loadAndRenderReviews(p.id);
      }
    });
    rvSection.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const inp = e.target.closest('.cmt-input');
      if (inp) { e.preventDefault(); rvSection.querySelector(`.cmt-post-btn[data-rid="${inp.dataset.rid}"]`)?.click(); }
    });
  }

  loadAndRenderReviews(p.id);
}

/* ── TOAST ── */
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/* ── REVIEWS ── */
function rvDateStr(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}
function renderComment(c) {
  const canDel = currentUser?.id === c.user_id;
  return `<div class="cmt-item">
    <div class="cmt-header">
      <span class="cmt-name">${esc(c.user_name)}</span>
      <span class="cmt-date">${rvDateStr(c.created_at)}</span>
      ${canDel ? `<button class="cmt-del" data-del="comment" data-id="${c.id}">삭제</button>` : ''}
    </div>
    <div class="cmt-text">${esc(c.content)}</div>
  </div>`;
}
function renderReviewCard(rv) {
  const canDel = currentUser?.id === rv.user_id;
  const initial = (rv.user_name || '?').charAt(0).toUpperCase();
  const avatarInner = rv.user_avatar
    ? `<img src="${esc(rv.user_avatar)}" alt="" onerror="this.outerHTML='${initial}'">`
    : initial;
  const cmts = (rv.review_comments || []).map(renderComment).join('');
  const cmtInput = currentUser ? `<div class="cmt-input-row">
    <input class="cmt-input" data-rid="${rv.id}" placeholder="댓글 입력..." />
    <button class="cmt-post-btn" data-rid="${rv.id}">등록</button>
  </div>` : '';
  return `<div class="rv-card">
    <div class="rv-header">
      <div class="rv-avatar-small">${avatarInner}</div>
      <div class="rv-meta">
        <div class="rv-name">${esc(rv.user_name)}</div>
        <div class="rv-rating"><span class="rv-stars-filled">${'★'.repeat(rv.rating)}</span><span class="rv-stars-empty">${'★'.repeat(5 - rv.rating)}</span></div>
        <div class="rv-date">${rvDateStr(rv.created_at)}</div>
      </div>
      ${canDel ? `<button class="rv-del-btn" data-del="review" data-id="${rv.id}">삭제</button>` : ''}
    </div>
    <div class="rv-content">${esc(rv.content)}</div>
    ${cmts ? `<div class="cmt-list">${cmts}</div>` : ''}
    ${cmtInput}
  </div>`;
}
async function loadAndRenderReviews(productId) {
  const rvList = $('rvList');
  if (!rvList) return;
  const { data, error } = await db
    .from('reviews')
    .select('*, review_comments(*)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (!$('rvList')) return;
  rvList.innerHTML = (error || !data?.length)
    ? '<div class="rv-empty">아직 리뷰가 없습니다. 첫 번째 리뷰를 남겨보세요!</div>'
    : data.map(renderReviewCard).join('');
}

/* ── SHEET HELPERS ── */
const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
function openSheet(sheet, overlay) {
  sheet.classList.remove('hidden');
  if (overlay) overlay.classList.remove('hidden');
  sheet.style.transition = 'none';
  sheet.style.transform = 'translateX(-50%) translateY(110%)';
  sheet.getBoundingClientRect();
  sheet.style.transition = `transform .35s ${SHEET_EASE}`;
  sheet.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => { sheet.style.transition = ''; sheet.style.transform = ''; sheet.classList.add('sheet-open'); }, 360);
}
function closeSheet(sheet, overlay) {
  sheet.style.transition = 'none';
  sheet.style.transform = 'translateX(-50%) translateY(0)';
  sheet.getBoundingClientRect();
  sheet.style.transition = `transform .35s ${SHEET_EASE}`;
  sheet.style.transform = 'translateX(-50%) translateY(110%)';
  if (overlay) overlay.classList.add('hidden');
  setTimeout(() => { sheet.style.transition = ''; sheet.style.transform = ''; sheet.classList.remove('sheet-open'); sheet.classList.add('hidden'); }, 360);
}
function dragToClose(sheet, overlay) {
  let startY = 0, dy = 0, startTime = 0, dragging = false;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0) return;
    startY = e.touches[0].clientY; startTime = Date.now();
    dy = 0; dragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateX(-50%) translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const velocity = dy / Math.max(1, Date.now() - startTime);
    const doClose = dy > 100 || velocity > 0.4;
    sheet.style.transition = doClose
      ? 'transform .28s cubic-bezier(0.32,0,0.67,0)'
      : `transform .35s ${SHEET_EASE}`;
    sheet.style.transform = doClose ? 'translateX(-50%) translateY(110%)' : 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      sheet.style.transition = ''; sheet.style.transform = '';
      if (doClose) { sheet.classList.remove('sheet-open'); sheet.classList.add('hidden'); if (overlay) overlay.classList.add('hidden'); }
    }, doClose ? 290 : 360);
    dy = 0;
  });
}

/* ── FILTERS ── */
function buildCheckboxGroup(containerId, cbClass, items) {
  const group = $(containerId);
  group.textContent = '';
  const mk = (checked, className, value, label) => {
    const lb = document.createElement('label');
    lb.className = `filter-sheet-item${className ? ' ' + className : ''} checked`;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = cbClass + (value === null ? '-all' : '');
    cb.checked = true;
    if (value !== null) cb.value = value;
    const sp = document.createElement('span');
    sp.textContent = label;
    lb.append(cb, sp);
    group.appendChild(lb);
    return { lb, cb };
  };
  const all = mk(true, 'select-all-item', null, '전체 선택');
  items.forEach((it) => mk(true, '', it.value, it.label));
  const cbs = group.querySelectorAll('.' + cbClass);

  all.lb.addEventListener('click', (ev) => {
    ev.preventDefault();
    const v = !all.cb.checked;
    all.cb.checked = v;
    all.lb.classList.toggle('checked', v);
    cbs.forEach((cb) => { cb.checked = v; cb.closest('.filter-sheet-item').classList.toggle('checked', v); });
  });
  cbs.forEach((cb) => {
    cb.closest('.filter-sheet-item').addEventListener('click', (ev) => {
      ev.preventDefault();
      cb.checked = !cb.checked;
      cb.closest('.filter-sheet-item').classList.toggle('checked', cb.checked);
      const allChecked = [...cbs].every((c) => c.checked);
      all.cb.checked = allChecked;
      all.lb.classList.toggle('checked', allChecked);
    });
  });
  return { allCb: all.cb, allLabel: all.lb, cbs };
}

function buildDynamicFilters() {
  brandGroup = buildCheckboxGroup('brandFilterGroup', 'brand-cb', ALL_BRANDS);
  typeGroup = buildCheckboxGroup('typeFilterGroup', 'type-cb', ALL_TYPES);
  state.brands = new Set(ALL_BRANDS.map((b) => b.value));
  state.productTypes = new Set(ALL_TYPES.map((t) => t.value));
  prodBrandGroup = buildCheckboxGroup('prodBrandFilterGroup', 'prod-brand-cb', ALL_BRANDS);
  prodState.brands = new Set(ALL_BRANDS.map((b) => b.value));
}

function updateFilterCount() {
  const deselected = (ALL_BRANDS.length - state.brands.size)
    + (ALL_TYPES.length - state.productTypes.size)
    + (state.period !== 'all' ? 1 : 0);
  const c = $('filterCount'), b = $('filterBtn');
  if (deselected > 0) { c.textContent = deselected; c.classList.remove('hidden'); b.style.color = 'var(--blue)'; }
  else { c.classList.add('hidden'); b.style.color = ''; }
}

function resetFilterSheet() {
  [brandGroup, typeGroup].forEach((g) => {
    g.cbs.forEach((cb) => { cb.checked = true; cb.closest('.filter-sheet-item').classList.add('checked'); });
    g.allCb.checked = true;
    g.allLabel.classList.add('checked');
  });
  $$('.period-rb').forEach((rb) => { rb.checked = rb.value === 'all'; });
  $$('#periodFilterGroup .filter-sheet-item').forEach((item) => {
    item.classList.toggle('checked', item.querySelector('input').checked);
  });
}

function updateProdFilterCount() {
  const deselected = prodState.brands.size < ALL_BRANDS.length ? 1 : 0;
  const n = deselected + (prodState.priceRange !== 'all' ? 1 : 0) + (prodState.discountMin > 0 ? 1 : 0);
  const c = $('prodFilterCount'), b = $('prodFilterBtn');
  if (n > 0) { c.textContent = n; c.classList.remove('hidden'); b.style.color = 'var(--blue)'; }
  else { c.classList.add('hidden'); b.style.color = ''; }
}

function resetProdFilterSheet() {
  if (prodBrandGroup) {
    prodBrandGroup.cbs.forEach((cb) => { cb.checked = true; cb.closest('.filter-sheet-item').classList.add('checked'); });
    prodBrandGroup.allCb.checked = true;
    prodBrandGroup.allLabel.classList.add('checked');
  }
  $$('.prod-price-rb').forEach((rb) => { rb.checked = rb.value === 'all'; rb.closest('.filter-sheet-item').classList.toggle('checked', rb.value === 'all'); });
  $$('.prod-disc-rb').forEach((rb) => { rb.checked = rb.value === '0'; rb.closest('.filter-sheet-item').classList.toggle('checked', rb.value === '0'); });
}

/* ── AUTH ── */
function openLoginSheet() {
  $('loginForm').classList.remove('hidden');
  $('signupForm').classList.add('hidden');
  clearErrors();
  openSheet($('loginSheet'), $('loginOverlay'));
}
function closeLoginSheet() { closeSheet($('loginSheet'), $('loginOverlay')); pendingLink = null; clearErrors(); }
function clearErrors() { ['loginError', 'signupError'].forEach((id) => { $(id).classList.add('hidden'); $(id).textContent = ''; }); }
function showError(id, msg) { $(id).textContent = msg; $(id).classList.remove('hidden'); }
function setLoading(id, loading) {
  const btn = $(id);
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
}
function updateAuthUI(user) {
  $('authBtn').classList.toggle('hidden', !!user);
  $('headerIconGroup').classList.toggle('hidden', !user);
}

function openUserSheet() {
  if (!currentUser) return;
  const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || '내 계정';
  const photo = currentUser.user_metadata?.avatar_url || '';
  const initial = name.charAt(0).toUpperCase();
  $('userSheetName').textContent = name;
  $('userSheetEmail').textContent = currentUser.email || '';
  $('userAdminBtn').classList.toggle('hidden', currentUser.email !== ADMIN_EMAIL);
  const av = $('userAvatar');
  av.textContent = '';
  if (photo) {
    const img = document.createElement('img');
    img.src = photo; img.alt = name;
    img.onerror = () => { av.textContent = initial; };
    av.appendChild(img);
  } else av.textContent = initial;
  openSheet($('userSheet'), $('sheetOverlay'));
}
const closeUserSheet = () => closeSheet($('userSheet'), $('sheetOverlay'));

async function socialLogin(provider) {
  const { error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href } });
  if (error) showError('loginError', error.message);
}
async function emailLogin() {
  const email = $('loginEmail').value.trim(), password = $('loginPassword').value;
  if (!email || !password) return showError('loginError', '이메일과 비밀번호를 입력해 주세요.');
  setLoading('loginSubmit', true);
  const { error } = await db.auth.signInWithPassword({ email, password });
  setLoading('loginSubmit', false);
  if (error) return showError('loginError', '이메일 또는 비밀번호가 올바르지 않습니다.');
  closeLoginSheet();
  if (pendingLink) { window.open(pendingLink, '_blank', 'noopener,noreferrer'); pendingLink = null; }
}
async function emailSignup() {
  const email = $('signupEmail').value.trim();
  const pw = $('signupPassword').value, pwConf = $('signupPasswordConfirm').value;
  if (!email || !pw) return showError('signupError', '이메일과 비밀번호를 입력해 주세요.');
  if (pw.length < 6) return showError('signupError', '비밀번호는 6자 이상이어야 합니다.');
  if (pw !== pwConf) return showError('signupError', '비밀번호가 일치하지 않습니다.');
  setLoading('signupSubmit', true);
  const { error } = await db.auth.signUp({ email, password: pw });
  setLoading('signupSubmit', false);
  if (error) return showError('signupError', error.message);
  const errEl = $('signupError');
  errEl.classList.remove('hidden');
  errEl.style.cssText = 'background:#F0FFF4;border-color:#A5D6A7;color:#2E7D32';
  errEl.textContent = '가입 완료! 이메일을 확인해 주세요 ✉️';
}

/* ── LISTENERS ── */
function initListeners() {
  const searchInput = $('searchInput');
  const overlay = $('sheetOverlay');
  const sortSheet = $('sortSheet'), filterSheet = $('filterSheet');

  const suggestEl = $('searchSuggest');

  const hideSuggest = () => suggestEl.classList.add('hidden');

  const showSuggest = (q) => {
    if (!q) { hideSuggest(); return; }
    const lq = q.toLowerCase();
    const hits = [];
    const seen = new Set();
    const add = (text) => { if (text && text.toLowerCase().includes(lq) && !seen.has(text)) { seen.add(text); hits.push(text); } };
    EVENTS.forEach((e) => { add(e.name); add(e.brandLabel); });
    PRODUCTS.forEach((p) => { add(p.name); add(p.store); add(p.brand); });
    const top = hits.slice(0, 6);
    if (!top.length) { hideSuggest(); return; }
    suggestEl.innerHTML = top.map((t) => `<div class="search-suggest-item">${esc(t)}</div>`).join('');
    suggestEl.classList.remove('hidden');
  };

  const doSearch = () => {
    hideSuggest();
    state.search = searchInput.value.trim();
    render();
  };

  searchInput.addEventListener('input', debounce(() => showSuggest(searchInput.value.trim()), 150));
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); searchInput.blur(); } });
  searchInput.addEventListener('blur', () => setTimeout(hideSuggest, 150));
  $('searchBtn').addEventListener('click', doSearch);

  suggestEl.addEventListener('click', (e) => {
    const item = e.target.closest('.search-suggest-item');
    if (!item) return;
    searchInput.value = item.textContent;
    doSearch();
  });

  $('eventsGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.evt-card');
    if (card) openEventPage(parseInt(card.dataset.eid));
  });

  $('productsGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.prod-card');
    if (card) openProductPage(parseInt(card.dataset.pid));
  });

  overlay.addEventListener('click', () => {
    [sortSheet, filterSheet, $('prodSortSheet'), $('prodFilterSheet'), $('userSheet')]
      .filter((s) => s && !s.classList.contains('hidden'))
      .forEach((s) => closeSheet(s, overlay));
  });

  $$('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('prodCatRow').addEventListener('click', (e) => {
    const chip = e.target.closest('.prod-cat-chip');
    if (!chip) return;
    prodState.cat1 = chip.dataset.cat;
    prodState.cat2 = '';
    $$('#prodCatRow .prod-cat-chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === prodState.cat1));
    renderProdCat2Chips();
    renderProducts();
  });
  $('prodCat2Row').addEventListener('click', (e) => {
    const chip = e.target.closest('.prod-cat-chip');
    if (!chip) return;
    prodState.cat2 = chip.dataset.cat;
    $$('#prodCat2Row .prod-cat-chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === prodState.cat2));
    renderProducts();
  });

  const prodSortSheet = $('prodSortSheet');
  $('prodSortBtn').addEventListener('click', () => openSheet(prodSortSheet, overlay));
  $$('.sort-option', prodSortSheet).forEach((btn) => {
    btn.addEventListener('click', () => {
      prodState.sort = btn.dataset.sort;
      $$('.sort-option', prodSortSheet).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $('prodSortLabel').textContent = btn.textContent.trim();
      closeSheet(prodSortSheet, overlay);
      renderProducts();
    });
  });

  const prodFilterSheet = $('prodFilterSheet');
  $('prodFilterBtn').addEventListener('click', () => openSheet(prodFilterSheet, overlay));
  $('prodFilterSheetClose').addEventListener('click', () => closeSheet(prodFilterSheet, overlay));

  $$('.prod-price-rb, .prod-disc-rb').forEach((rb) => {
    rb.addEventListener('change', () => {
      const grpId = rb.name === 'prodPrice' ? 'prodPriceGroup' : 'prodDiscountGroup';
      $$(`#${grpId} .filter-sheet-item`).forEach((item) => {
        item.classList.toggle('checked', item.querySelector('input').checked);
      });
    });
  });

  $('prodFilterReset').addEventListener('click', resetProdFilterSheet);

  $('prodFilterApply').addEventListener('click', () => {
    prodState.brands = prodBrandGroup
      ? new Set([...prodBrandGroup.cbs].filter((cb) => cb.checked).map((cb) => cb.value))
      : new Set(ALL_BRANDS.map((b) => b.value));
    prodState.priceRange = document.querySelector('.prod-price-rb:checked')?.value || 'all';
    prodState.discountMin = +(document.querySelector('.prod-disc-rb:checked')?.value || 0);
    updateProdFilterCount();
    closeSheet(prodFilterSheet, overlay);
    renderProducts();
  });

  dragToClose(prodFilterSheet, overlay);

  $('sortBtn').addEventListener('click', () => openSheet(sortSheet, overlay));
  $$('.sort-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      $$('.sort-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      $('sortLabel').textContent = btn.textContent.trim();
      closeSheet(sortSheet, overlay);
      render();
    });
  });

  $('filterBtn').addEventListener('click', () => openSheet(filterSheet, overlay));
  $('filterSheetClose').addEventListener('click', () => closeSheet(filterSheet, overlay));

  $$('.period-rb').forEach((rb) => {
    rb.addEventListener('change', () => {
      $$('#periodFilterGroup .filter-sheet-item').forEach((item) => {
        item.classList.toggle('checked', item.querySelector('input').checked);
      });
    });
  });

  $('filterReset').addEventListener('click', resetFilterSheet);

  $('filterApply').addEventListener('click', () => {
    state.brands = new Set([...brandGroup.cbs].filter((cb) => cb.checked).map((cb) => cb.value));
    state.productTypes = new Set([...typeGroup.cbs].filter((cb) => cb.checked).map((cb) => cb.value));
    state.period = document.querySelector('.period-rb:checked')?.value || 'all';
    updateFilterCount();
    closeSheet(filterSheet, overlay);
    render();
  });

  $('resetFilters').addEventListener('click', () => {
    state.search = ''; state.period = 'all';
    state.brands = new Set(ALL_BRANDS.map((b) => b.value));
    state.productTypes = new Set(ALL_TYPES.map((t) => t.value));
    searchInput.value = '';
    resetFilterSheet();
    updateFilterCount();
    render();
  });

  $('eventPageBack').addEventListener('click', closeEventPage);
  $('prodPageBack').addEventListener('click', closeProductPage);
  window.addEventListener('popstate', (e) => {
    const st = e.state || {};
    if (st.prodId) {
      if ($('prodPage').classList.contains('hidden')) openProductPage(st.prodId, true);
    } else if (st.eventId) {
      hideProductPage();
      if ($('eventPage').classList.contains('hidden')) openEventPage(st.eventId, true);
    } else {
      hideProductPage();
      hideEventPage();
    }
  });

  dragToClose(sortSheet, overlay);
  dragToClose(filterSheet, overlay);
  dragToClose($('userSheet'), $('sheetOverlay'));
  dragToClose($('loginSheet'), $('loginOverlay'));

  $('evPriceToggle').classList.add('active');
  $('evPriceToggle').addEventListener('click', () => {
    prodState.showEventPrice = !prodState.showEventPrice;
    $('evPriceToggle').classList.toggle('active', prodState.showEventPrice);
    renderProducts();
  });

  $('prodPageShare').addEventListener('click', () => {
    navigator.clipboard?.writeText(location.href).then(() => {
      showToast('링크가 복사되었습니다!');
    }).catch(() => showToast('링크 복사 실패'));
  });

  $('authBtn').addEventListener('click', openLoginSheet);
  $('userBtn').addEventListener('click', openUserSheet);
  $('userSheetClose').addEventListener('click', closeUserSheet);
  $('userLogoutBtn').addEventListener('click', async () => { closeSheet($('userSheet'), $('sheetOverlay')); await db.auth.signOut(); });
  $('loginOverlay').addEventListener('click', closeLoginSheet);
  $('loginClose').addEventListener('click', closeLoginSheet);
  $('goSignup').addEventListener('click', () => {
    $('loginForm').classList.add('hidden');
    $('signupForm').classList.remove('hidden');
    clearErrors();
  });
  $('goLogin').addEventListener('click', () => {
    $('signupForm').classList.add('hidden');
    $('loginForm').classList.remove('hidden');
    clearErrors();
  });
  $('loginGoogle').addEventListener('click', () => socialLogin('google'));
  $('loginSubmit').addEventListener('click', emailLogin);
  $('signupSubmit').addEventListener('click', emailSignup);
  [$('loginEmail'), $('loginPassword')].forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') emailLogin(); });
  });
}

/* ── PRESENCE + VISIT LOG ── */
let presenceCh = null;
function getIdentity() {
  if (currentUser?.email) return currentUser.email;
  let key = sessionStorage.getItem('guest_pid');
  if (!key) {
    key = 'guest-' + Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem('guest_pid', key);
  }
  return key;
}
function startPresence() {
  if (presenceCh) {
    presenceCh.track({ email: currentUser?.email || null }).catch(() => {});
    return;
  }
  presenceCh = db.channel('site-online', { config: { presence: { key: getIdentity() } } });
  presenceCh.subscribe((status) => {
    if (status === 'SUBSCRIBED') presenceCh.track({ email: currentUser?.email || null }).catch(() => {});
  });
}
async function logVisit() {
  // Throttle to one insert per identity per 30 minutes — distinct daily users
  // stay accurate without flooding the table on rapid reloads.
  const identity = getIdentity();
  if (currentUser?.email === ADMIN_EMAIL) return;
  const last = +localStorage.getItem('lv_at') || 0;
  if (Date.now() - last < 30 * 60_000) return;
  localStorage.setItem('lv_at', String(Date.now()));
  try {
    await db.from('site_visits').insert({ identity, email: currentUser?.email || null, event_type: 'visit' });
  } catch { /* best effort */ }
}
async function logBuyClick(productId) {
  if (currentUser?.email === ADMIN_EMAIL) return;
  try {
    await db.from('site_visits').insert({
      identity: getIdentity(),
      email: currentUser?.email || null,
      event_type: 'buy_click',
      product_id: productId || null,
    });
  } catch { /* best effort */ }
}
async function logProductView(productId) {
  if (currentUser?.email === ADMIN_EMAIL) return;
  // De-dupe bursts per product — one view per product per identity per 10 min
  const k = 'pv_' + productId;
  const last = +localStorage.getItem(k) || 0;
  if (Date.now() - last < 10 * 60_000) return;
  localStorage.setItem(k, String(Date.now()));
  try {
    await db.from('site_visits').insert({
      identity: getIdentity(),
      email: currentUser?.email || null,
      event_type: 'product_view',
      product_id: productId,
    });
  } catch { /* best effort */ }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);
  db.auth.onAuthStateChange((ev, session) => {
    currentUser = session?.user ?? null;
    updateAuthUI(currentUser);
    if (ev === 'SIGNED_IN' && location.hash.includes('access_token')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (currentUser && pendingLink) {
      window.open(pendingLink, '_blank', 'noopener,noreferrer');
      pendingLink = null;
      closeLoginSheet();
    }
    startPresence();
    logVisit();
  });
  document.addEventListener('click', (ev) => {
    const cta = ev.target.closest('#ppBuyCta, .pp-ev-link-btn, #epCtaBtn');
    if (cta) {
      if (!currentUser) {
        ev.preventDefault();
        pendingLink = cta.getAttribute('href');
        openLoginSheet();
        return;
      }
      if (cta.id === 'ppBuyCta') logBuyClick(+cta.dataset.pid || null);
    }
  }, true);
  try {
    await Promise.all([loadEvents(), loadFilterOptions(), loadProducts()]);
    buildDynamicFilters();
    initListeners();
    renderProdCat1Chips();
    renderProdCat2Chips();
    render();
    showLoading(false);
    const urlParams = new URLSearchParams(location.search);
    const urlProd = urlParams.get('product'), urlEvent = urlParams.get('event');
    if (urlProd) openProductPage(+urlProd, true);
    else if (urlEvent) openEventPage(+urlEvent, true);
  } catch (err) { showDbError(err.message); }
});
