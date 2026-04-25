'use strict';

const SUPABASE_URL = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const ADMIN_EMAIL = 'fightingman012@gmail.com';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const linesToArr = (s) => String(s ?? '').split('\n').map((v) => v.trim()).filter(Boolean);
const arrToLines = (a) => (a || []).join('\n');
const fmtPrice = (n) => n ? '₩' + Number(n).toLocaleString('ko-KR') : '';
const discPct = (p) => p.original_price > p.sale_price ? Math.round((1 - p.sale_price / p.original_price) * 100) : 0;
const thumbHtml = (src, fallback) => src
  ? `<img src="${esc(src)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${fallback}'}))">`
  : fallback;
const pad2 = (n) => String(n).padStart(2, '0');
const isoToDatePart = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const partsToISO = (date, h, m) => {
  if (!date) return null;
  const hh = (h !== '' && h != null) ? +h : 0;
  const mm = (m !== '' && m != null) ? +m : 0;
  const d = new Date(`${date}T${pad2(hh)}:${pad2(mm)}`);
  return isNaN(d) ? null : d.toISOString();
};
function buildTimeSelects() {
  ['fStartH', 'fEndH'].forEach((id) => {
    const sel = $(id);
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option');
      o.value = h; o.textContent = `${pad2(h)}시`;
      sel.appendChild(o);
    }
  });
  ['fStartM', 'fEndM'].forEach((id) => {
    const sel = $(id);
    for (let m = 0; m < 60; m++) {
      const o = document.createElement('option');
      o.value = m; o.textContent = `${pad2(m)}분`;
      sel.appendChild(o);
    }
  });
}
const fmtDt = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  const hm = d.getHours() || d.getMinutes() ? ` ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}${hm}`;
};

let EVENTS = [], PRODUCTS = [], BRANDS = [];
let CATS = [[], [], [], []];
let editingId = null, prodEditingId = null, optionModalKind = null;
const selected = new Set();
const linkedProducts = new Set();
const linkedEvents = new Set();
const prodSelected = new Set();
let currentOptions = []; // [{name, values:[]}] max 3
let currentSkus = [];    // [{combo:[], price:0, origPrice:0}]

// ─── filter_options ──────────────────────────────────────
async function loadOptions() {
  const { data } = await db.from('filter_options').select('*').order('sort_order').order('id');
  const rows = data || [];
  BRANDS = rows.filter((r) => r.type === 'brand');
  CATS = [1, 2, 3, 4].map((n) => rows.filter((r) => r.type === `cat${n}`));
  renderBrandSelect('fBrand'); renderBrandSelect('pBrand'); renderBrandSelect('tBrand');
  [1, 2, 3, 4].forEach(renderCatSelect);
  [1, 2, 3, 4].forEach(renderTargetCatSelect);
}

function renderCatSelect(n) {
  const sel = $(`pCat${n}`);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">선택 안함</option>'
    + CATS[n - 1].map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');
  if (cur && CATS[n - 1].find((c) => c.value === cur)) sel.value = cur;
}

function renderBrandSelect(id) {
  const sel = $(id);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">브랜드 선택</option>'
    + BRANDS.map((b) => `<option value="${esc(b.value)}" data-label="${esc(b.label)}">${esc(b.label)}</option>`).join('');
  if (cur && BRANDS.find((b) => b.value === cur)) sel.value = cur;
  if (id === 'fBrand') syncBrandLabel();
}

function renderTargetCatSelect(n) {
  const sel = $(`tCat${n}`);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">카테고리${n} 없음</option>`
    + CATS[n - 1].map((c) => `<option value="${esc(c.value)}">${esc(c.label)}</option>`).join('');
  if (cur && CATS[n - 1].find((c) => c.value === cur)) sel.value = cur;
}

function buildTargetTimeSelects() {
  const hSel = $('tScheduleH');
  if (hSel && hSel.options.length <= 1) {
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option');
      o.value = h; o.textContent = `${pad2(h)}시`;
      hSel.appendChild(o);
    }
  }
  const mSel = $('tScheduleM');
  if (mSel && mSel.options.length <= 1) {
    for (const m of [0, 10, 15, 20, 30, 40, 45, 50]) {
      const o = document.createElement('option');
      o.value = m; o.textContent = `${pad2(m)}분`;
      mSel.appendChild(o);
    }
  }
}

const WEEKDAY_LABELS = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };
const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function truncateUrl(u, max = 48) {
  if (!u) return '';
  const s = String(u);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
function formatSchedule(t) {
  const days = Array.isArray(t.schedule_days) ? t.schedule_days : [];
  const hasTime = t.schedule_hour != null && t.schedule_hour !== '';
  if (!hasTime || !days.length) return '자동 실행 꺼짐';
  const sorted = WEEKDAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_LABELS[d]);
  const time = `${pad2(t.schedule_hour)}:${pad2(t.schedule_minute ?? 0)}`;
  return `매주 ${sorted.join('·')} ${time} (KST)`;
}

function syncBrandLabel() {
  const sel = $('fBrand');
  $('fBrandLabel').value = sel.options[sel.selectedIndex]?.dataset.label || '';
}

// ─── EVENTS ──────────────────────────────────────────────
async function loadEvents() {
  const { data, error } = await db.from('events').select('*').order('id', { ascending: false });
  if (error) return showMsg('adminMsg', error.message, true);
  EVENTS = data || [];
  renderEventList();
}

function getEventListFiltered() {
  const q = ($('adminListSearch')?.value || '').trim().toLowerCase();
  return q ? EVENTS.filter((e) => (e.name + ' ' + (e.brand_label || e.brand)).toLowerCase().includes(q)) : EVENTS;
}

function getProdListFiltered() {
  const q = ($('prodListSearch')?.value || '').trim().toLowerCase();
  return q ? PRODUCTS.filter((p) => (p.name + ' ' + p.brand).toLowerCase().includes(q)) : PRODUCTS;
}

function renderEventList() {
  const box = $('adminList');
  $('adminCount').textContent = EVENTS.length;
  for (const id of [...selected]) if (!EVENTS.find((e) => e.id === id)) selected.delete(id);
  const filtered = getEventListFiltered();
  if (!filtered.length) {
    box.innerHTML = `<div class="admin-row-empty">${EVENTS.length ? '검색 결과가 없습니다.' : '등록된 이벤트가 없습니다.'}</div>`;
    updateBulk('bulk', selected, filtered);
    return;
  }
  box.innerHTML = filtered.map((e) => {
    const period = [fmtDt(e.start_date), fmtDt(e.end_date)].filter(Boolean).join(' ~ ') || '상시';
    return `<div class="admin-row ${e.id === editingId ? 'active' : ''}" data-id="${e.id}">
      <input type="checkbox" class="admin-row-check" data-id="${e.id}" ${selected.has(e.id) ? 'checked' : ''} />
      <div class="admin-row-thumb">${thumbHtml(e.thumbnail, '🏷️')}</div>
      <div class="admin-row-body">
        <div class="admin-row-name">${esc(e.name)}</div>
        <div class="admin-row-meta">${esc(e.brand_label || e.brand)} · ${esc(period)}</div>
      </div>
    </div>`;
  }).join('');
  updateBulk('bulk', selected, filtered);
}

function updateBulk(prefix, set, filtered) {
  $(`${prefix}Selected`).textContent = `${set.size}개 선택`;
  $(`${prefix}Delete`).disabled = set.size === 0;
  const all = $(`${prefix}CheckAll`) || $(`${prefix}All`);
  const selInFiltered = filtered.reduce((n, x) => n + (set.has(x.id) ? 1 : 0), 0);
  all.checked = filtered.length > 0 && selInFiltered === filtered.length;
  all.indeterminate = selInFiltered > 0 && selInFiltered < filtered.length;
}

async function doBulkDelete(table, set, btnId, onDone) {
  if (!set.size || !confirm(`${set.size}개를 정말 삭제하시겠습니까?`)) return;
  const ids = [...set];
  const btn = $(btnId);
  btn.disabled = true; btn.textContent = '삭제 중...';
  const { error } = await db.from(table).delete().in('id', ids);
  btn.textContent = '선택 삭제';
  if (error) { btn.disabled = false; return showMsg('adminMsg', error.message, true); }
  set.clear();
  onDone(ids);
}

const EVENT_FIELDS = [
  ['fName', 'name'], ['fBrand', 'brand'], ['fBrandLabel', 'brand_label'],
  ['fThumbnail', 'thumbnail'], ['fDescription', 'description'],
  ['fDiscount', 'discount_pct'], ['fDiscountAmount', 'discount_amount'],
  ['fLink', 'link'], ['fCouponCode', 'coupon_code'], ['fCouponNote', 'coupon_note'],
];

function toggleOngoing(on) {
  $('fDateFields').classList.toggle('hidden', on);
  if (on) {
    ['fStartDate', 'fEndDate'].forEach((id) => $(id).value = '');
    ['fStartH', 'fStartM', 'fEndH', 'fEndM'].forEach((id) => $(id).value = '');
  }
}

function fillEventForm(e) {
  editingId = e?.id ?? null;
  $('fId').value = e?.id ?? '';
  EVENT_FIELDS.forEach(([id, key]) => {
    if (id === 'fBrand' || id === 'fBrandLabel') return;
    $(id).value = e?.[key] ?? (id === 'fDiscount' || id === 'fDiscountAmount' ? 0 : '');
  });
  const ongoing = !e?.start_date && !e?.end_date;
  $('fOngoing').checked = ongoing;
  toggleOngoing(ongoing);
  if (!ongoing) {
    $('fStartDate').value = isoToDatePart(e?.start_date);
    $('fEndDate').value = isoToDatePart(e?.end_date);
    if (e?.start_date) { const d = new Date(e.start_date); $('fStartH').value = d.getHours(); $('fStartM').value = d.getMinutes(); }
    else { $('fStartH').value = ''; $('fStartM').value = ''; }
    if (e?.end_date) { const d = new Date(e.end_date); $('fEndH').value = d.getHours(); $('fEndM').value = d.getMinutes(); }
    else { $('fEndH').value = ''; $('fEndM').value = ''; }
  }
  $('fBrand').value = e?.brand ?? '';
  syncBrandLabel();
  $('fActive').value = e?.active === false ? 'false' : 'true';
  $('fCombinable').checked = e?.combinable ?? false;
  const base = e?.discount_base || 'sale';
  document.querySelector(`input[name="discountBase"][value="${base}"]`).checked = true;
  $('fConditions').value = arrToLines(e?.conditions);
  $('fHowTo').value = arrToLines(e?.how_to);
  linkedProducts.clear();
  (e?.product_ids || []).forEach((id) => linkedProducts.add(id));
  $('prodSearch').value = '';
  renderProdPicker('');
  $('adminFormTitle').textContent = e ? `이벤트 #${e.id} 수정` : '새 이벤트 등록';
  $('adminDelete').classList.toggle('hidden', !e);
  renderEventList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Shared picker renderer — used for both product picker and event picker
function renderPicker(q, { boxId, countId, items, linked, attr, searchText, rowMeta, emptyMsg, fallback }) {
  const box = $(boxId);
  const qLow = q.toLowerCase();
  const filtered = qLow ? items.filter((x) => searchText(x).toLowerCase().includes(qLow)) : items;
  $(countId).textContent = linked.size ? `(${linked.size}개 연결됨)` : '';
  if (!filtered.length) { box.innerHTML = `<div class="admin-picker-empty">${emptyMsg}</div>`; return; }
  box.innerHTML = filtered.map((x) => `<label class="admin-picker-row">
    <input type="checkbox" ${attr}="${x.id}" ${linked.has(x.id) ? 'checked' : ''} />
    <div class="admin-picker-thumb">${thumbHtml(x.thumbnail, x.emoji || fallback)}</div>
    <div class="admin-picker-info">
      <div class="admin-picker-name">${esc(x.name)}</div>
      <div class="admin-picker-meta">${rowMeta(x)}</div>
    </div>
  </label>`).join('');
}

const renderProdPicker = (q) => renderPicker(q, {
  boxId: 'prodPicker', countId: 'linkedCount',
  items: PRODUCTS, linked: linkedProducts, attr: 'data-pid',
  searchText: (p) => p.name + ' ' + p.brand,
  rowMeta: (p) => { const d = discPct(p); return `${esc(p.store || p.brand)}${d ? ` · -${d}%` : ''} · ${fmtPrice(p.sale_price)}`; },
  emptyMsg: '검색 결과가 없습니다.', fallback: '💊',
});

const renderEventPicker = (q) => renderPicker(q, {
  boxId: 'eventPicker', countId: 'linkedEventCount',
  items: EVENTS, linked: linkedEvents, attr: 'data-eid',
  searchText: (e) => e.name + ' ' + (e.brand_label || e.brand),
  rowMeta: (e) => `${esc(e.brand_label || e.brand)} · ${esc(e.start_date || e.end_date ? [fmtDt(e.start_date), fmtDt(e.end_date)].filter(Boolean).join(' ~ ') : '상시')}`,
  emptyMsg: '이벤트가 없습니다.', fallback: '🏷️',
});

function collectEventForm() {
  const payload = {};
  EVENT_FIELDS.forEach(([id, key]) => {
    const v = $(id).value.trim();
    payload[key] = v === '' ? null : (key === 'discount_pct' || key === 'discount_amount' ? +v : v);
  });
  payload.start_date = $('fOngoing').checked ? null : partsToISO($('fStartDate').value, $('fStartH').value, $('fStartM').value);
  payload.end_date = $('fOngoing').checked ? null : partsToISO($('fEndDate').value, $('fEndH').value, $('fEndM').value);
  payload.active = $('fActive').value === 'true';
  payload.combinable = $('fCombinable').checked;
  payload.discount_base = document.querySelector('input[name="discountBase"]:checked')?.value || 'sale';
  payload.conditions = linesToArr($('fConditions').value);
  payload.how_to = linesToArr($('fHowTo').value);
  payload.product_ids = [...linkedProducts];
  return payload;
}

async function saveEvent(ev) {
  ev.preventDefault();
  const payload = collectEventForm();
  if (!payload.brand || !payload.brand_label || !payload.name) return showMsg('adminMsg', '브랜드/이름은 필수입니다.', true);
  const btn = $('adminSave');
  btn.disabled = true; btn.textContent = '저장 중...';
  const id = $('fId').value;
  const { error } = await (id ? db.from('events').update(payload).eq('id', +id) : db.from('events').insert(payload));
  btn.disabled = false; btn.textContent = '저장';
  if (error) return showMsg('adminMsg', error.message, true);
  showMsg('adminMsg', id ? '수정되었습니다.' : '등록되었습니다.');
  fillEventForm(null);
  await loadEvents();
}

async function deleteEvent() {
  const id = +$('fId').value;
  if (!id || !confirm('정말 삭제하시겠습니까?')) return;
  const { error } = await db.from('events').delete().eq('id', id);
  if (error) return showMsg('adminMsg', error.message, true);
  showMsg('adminMsg', '삭제되었습니다.');
  fillEventForm(null);
  await loadEvents();
}

// ─── PRODUCTS ────────────────────────────────────────────
async function loadProducts() {
  const { data } = await db.from('products').select('*').order('id', { ascending: false });
  PRODUCTS = data || [];
  renderProdList();
}

function renderProdList() {
  const box = $('prodList');
  $('prodCount').textContent = PRODUCTS.length;
  for (const id of [...prodSelected]) if (!PRODUCTS.find((p) => p.id === id)) prodSelected.delete(id);
  const filtered = getProdListFiltered();
  if (!filtered.length) {
    box.innerHTML = `<div class="admin-row-empty">${PRODUCTS.length ? '검색 결과가 없습니다.' : '상품이 없습니다.'}</div>`;
    updateBulk('prodBulk', prodSelected, filtered);
    return;
  }
  box.innerHTML = filtered.map((p) => {
    const d = discPct(p);
    return `<div class="admin-row ${p.id === prodEditingId ? 'active' : ''}" data-id="${p.id}">
      <input type="checkbox" class="prod-row-check" data-id="${p.id}" ${prodSelected.has(p.id) ? 'checked' : ''} />
      <div class="admin-row-thumb">${thumbHtml(p.thumbnail, p.emoji || '💊')}</div>
      <div class="admin-row-body">
        <div class="admin-row-name">${esc(p.name)}</div>
        <div class="admin-row-meta">${esc(p.brand)}${d ? ` · -${d}%` : ''} · ${fmtPrice(p.sale_price)}</div>
      </div>
    </div>`;
  }).join('');
  updateBulk('prodBulk', prodSelected, filtered);
}

function setCatExtraFromValues() {
  $('pCat3Wrap').classList.toggle('hidden', !$('pCat3').value);
  $('pCat4Wrap').classList.toggle('hidden', !$('pCat4').value);
  updateCatExtraVisibility();
}
function updateCatExtraVisibility() {
  const cat3Shown = !$('pCat3Wrap').classList.contains('hidden');
  const cat4Shown = !$('pCat4Wrap').classList.contains('hidden');
  $('catExtraBtnWrap').classList.toggle('hidden', cat3Shown && cat4Shown);
  $('showCat3Btn').textContent = cat3Shown ? '+ 카테고리 4 추가' : '+ 세부 카테고리 추가';
}

function fillProdForm(p) {
  prodEditingId = p?.id ?? null;
  $('pId').value = p?.id ?? '';
  $('pName').value = p?.name ?? '';
  $('pBrand').value = p?.brand ?? '';
  $('pStore').value = p?.store ?? '';
  $('pEmoji').value = p?.emoji ?? '';
  $('pThumbnail').value = p?.thumbnail ?? '';
  $('pShortDesc').value = p?.short_desc ?? '';
  $('pOrigPrice').value = p?.original_price ?? '';
  $('pSalePrice').value = p?.sale_price ?? '';
  $('pLink').value = p?.link ?? '';
  $('pCalories').value = p?.calories ?? '';
  $('pServingSize').value = p?.serving_size_g ?? '';
  $('pProtein').value = p?.protein_g ?? '';
  $('pCarb').value = p?.carb_g ?? '';
  $('pFat').value = p?.fat_g ?? '';
  $('pSodium').value = p?.sodium_mg ?? '';
  $('pSugar').value = p?.sugar_g ?? '';
  $('pSaturatedFat').value = p?.saturated_fat_g ?? '';
  $('pTransFat').value = p?.trans_fat_g ?? '';
  $('pCholesterol').value = p?.cholesterol_mg ?? '';
  [1, 2, 3, 4].forEach((n) => { $(`pCat${n}`).value = p?.[`category${n}`] ?? ''; });
  setCatExtraFromValues();
  currentOptions = JSON.parse(JSON.stringify(p?.options || []));
  currentSkus = (p?.option_skus || []).map((s) => ({ combo: [...(s.combo || [])], price: s.price || 0, origPrice: s.orig_price || 0 }));
  renderOptionGroups();
  linkedEvents.clear();
  if (p?.id) EVENTS.filter((e) => (e.product_ids || []).includes(p.id)).forEach((e) => linkedEvents.add(e.id));
  $('eventSearch').value = '';
  renderEventPicker('');
  $('prodFormTitle').textContent = p ? `상품 #${p.id} 수정` : '새 상품 등록';
  $('prodDelete').classList.toggle('hidden', !p);
  renderProdList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveProd(ev) {
  ev.preventDefault();
  const name = $('pName').value.trim(), brand = $('pBrand').value;
  if (!name || !brand) return showMsg('prodMsg', '상품명과 브랜드는 필수입니다.', true);
  const payload = {
    name, brand,
    store: $('pStore').value.trim() || brand,
    emoji: $('pEmoji').value.trim() || '💊',
    category1: $('pCat1').value || null,
    category2: $('pCat2').value || null,
    category3: $('pCat3').value || null,
    category4: $('pCat4').value || null,
    thumbnail: $('pThumbnail').value.trim() || null,
    short_desc: $('pShortDesc').value.trim() || null,
    original_price: +$('pOrigPrice').value || 0,
    sale_price: +$('pSalePrice').value || 0,
    link: $('pLink').value.trim() || null,
    calories: +$('pCalories').value || null,
    serving_size_g: +$('pServingSize').value || null,
    protein_g: +$('pProtein').value || null,
    carb_g: +$('pCarb').value || null,
    fat_g: +$('pFat').value || null,
    sodium_mg: +$('pSodium').value || null,
    sugar_g: +$('pSugar').value || null,
    saturated_fat_g: +$('pSaturatedFat').value || null,
    trans_fat_g: +$('pTransFat').value || null,
    cholesterol_mg: +$('pCholesterol').value || null,
    updated_at: new Date().toISOString(),
  };
  syncOptionsFromDOM();
  payload.options = currentOptions.filter((g) => g.name && g.values.filter(Boolean).length);
  payload.option_skus = currentSkus.filter((s) => s.price > 0).map((s) => ({ combo: s.combo, price: s.price, orig_price: s.origPrice || 0 }));
  const btn = $('prodSave');
  btn.disabled = true; btn.textContent = '저장 중...';
  const existingId = $('pId').value;
  let prodId = existingId ? +existingId : null;
  let saveError;
  if (existingId) {
    ({ error: saveError } = await db.from('products').update(payload).eq('id', +existingId));
  } else {
    const { data, error } = await db.from('products').insert(payload).select('id').single();
    saveError = error;
    if (data) prodId = data.id;
  }
  btn.disabled = false; btn.textContent = '저장';
  if (saveError) return showMsg('prodMsg', saveError.message, true);

  if (prodId) {
    const evMap = new Map(EVENTS.map((e) => [e.id, e]));
    const prevLinked = new Set(EVENTS.filter((e) => (e.product_ids || []).includes(prodId)).map((e) => e.id));
    const toAdd = [...linkedEvents].filter((id) => !prevLinked.has(id));
    const toRemove = [...prevLinked].filter((id) => !linkedEvents.has(id));
    await Promise.all([
      ...toAdd.map((evId) => {
        const e = evMap.get(evId);
        if (!e) return Promise.resolve();
        e.product_ids = [...new Set([...(e.product_ids || []), prodId])];
        return db.from('events').update({ product_ids: e.product_ids }).eq('id', evId);
      }),
      ...toRemove.map((evId) => {
        const e = evMap.get(evId);
        if (!e) return Promise.resolve();
        e.product_ids = (e.product_ids || []).filter((id) => id !== prodId);
        return db.from('events').update({ product_ids: e.product_ids }).eq('id', evId);
      }),
    ]);
  }

  showMsg('prodMsg', existingId ? '수정되었습니다.' : '등록되었습니다.');
  fillProdForm(null);
  await loadProducts();
}

async function deleteProd() {
  const id = +$('pId').value;
  if (!id || !confirm('정말 삭제하시겠습니까?')) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) return showMsg('prodMsg', error.message, true);
  showMsg('prodMsg', '삭제되었습니다.');
  fillProdForm(null);
  await loadProducts();
}

// ─── PRODUCT OPTIONS ──────────────────────────────────────
function syncOptionsFromDOM() {
  document.querySelectorAll('.option-name-input').forEach((inp) => {
    const gi = +inp.dataset.gi;
    if (currentOptions[gi]) currentOptions[gi].name = inp.value.trim();
  });
  document.querySelectorAll('.sku-combo-sel').forEach((sel) => {
    const si = +sel.dataset.si, ci = +sel.dataset.ci;
    if (currentSkus[si]) currentSkus[si].combo[ci] = sel.value;
  });
  document.querySelectorAll('.sku-price').forEach((inp) => {
    const si = +inp.dataset.si;
    if (currentSkus[si]) currentSkus[si].price = +inp.value || 0;
  });
  document.querySelectorAll('.sku-orig').forEach((inp) => {
    const si = +inp.dataset.si;
    if (currentSkus[si]) currentSkus[si].origPrice = +inp.value || 0;
  });
}

function addOptionValue(gi) {
  syncOptionsFromDOM();
  const inp = document.querySelector(`.admin-opt-val-new[data-gi="${gi}"]`);
  const val = inp ? inp.value.trim() : '';
  if (!val) return;
  if (currentOptions[gi].values.includes(val)) return;
  currentOptions[gi].values.push(val);
  renderOptionGroups();
  const next = document.querySelector(`.admin-opt-val-new[data-gi="${gi}"]`);
  if (next) next.focus();
}

function renderOptionGroups() {
  const c = $('optionGroupsContainer');
  $('addOptionGroupBtn').disabled = currentOptions.length >= 3;
  if (!currentOptions.length) {
    c.innerHTML = '<div class="admin-option-empty">옵션 없음 (맛, 용량 등을 추가하세요)</div>';
    $('skuSection').classList.add('hidden');
    toggleBasePriceFields(false);
    return;
  }
  c.innerHTML = currentOptions.map((g, gi) => `
    <div class="admin-option-group">
      <div class="admin-option-group-row">
        <button type="button" class="admin-ghost opt-group-move-up" data-gi="${gi}" ${gi === 0 ? 'disabled' : ''} title="위로">↑</button>
        <button type="button" class="admin-ghost opt-group-move-down" data-gi="${gi}" ${gi === currentOptions.length - 1 ? 'disabled' : ''} title="아래로">↓</button>
        <input type="text" class="admin-input-sm option-name-input" data-gi="${gi}" value="${esc(g.name)}" placeholder="옵션명 (예: 맛)" />
        <button type="button" class="admin-ghost option-group-del" data-gi="${gi}">삭제</button>
      </div>
      <div class="admin-option-vals">
        ${g.values.map((v, vi) => `<span class="admin-opt-chip" data-gi="${gi}" data-vi="${vi}">
          ${vi > 0 ? `<button type="button" class="opt-chip-move opt-chip-up" data-gi="${gi}" data-vi="${vi}">↑</button>` : ''}
          ${vi < g.values.length - 1 ? `<button type="button" class="opt-chip-move opt-chip-down" data-gi="${gi}" data-vi="${vi}">↓</button>` : ''}
          <span class="opt-chip-label" data-gi="${gi}" data-vi="${vi}" title="클릭하여 이름 수정">${esc(v)}</span>
          <button type="button" class="opt-chip-del" data-gi="${gi}" data-vi="${vi}">✕</button>
        </span>`).join('')}
        ${!g.values.length ? '<span class="admin-option-empty-hint">아직 추가된 값이 없습니다</span>' : ''}
      </div>
      <div class="admin-opt-add-row">
        <input type="text" class="admin-input-sm admin-opt-val-new" data-gi="${gi}" placeholder="예) 초콜렛 스무스" />
        <button type="button" class="admin-opt-add-confirm" data-gi="${gi}">+ 추가</button>
      </div>
    </div>`).join('');
  c.querySelectorAll('.admin-opt-add-confirm').forEach((btn) => {
    btn.addEventListener('click', () => addOptionValue(+btn.dataset.gi));
  });
  c.querySelectorAll('.admin-opt-val-new').forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOptionValue(+inp.dataset.gi); } });
  });
  $('skuSection').classList.remove('hidden');
  renderSkuTable();
  toggleBasePriceFields(true);
}

function toggleBasePriceFields(hasOptions) {
  const origField = $('pOrigPrice').closest('label') || $('pOrigPrice').parentElement;
  const saleField = $('pSalePrice').closest('label') || $('pSalePrice').parentElement;
  $('pOrigPrice').disabled = hasOptions;
  $('pSalePrice').disabled = hasOptions;
  $('pSalePrice').required = !hasOptions;
  origField.style.opacity = hasOptions ? '0.4' : '';
  saleField.style.opacity = hasOptions ? '0.4' : '';
  const hint = $('basePriceHint');
  if (hint) hint.classList.toggle('hidden', !hasOptions);
}

function renderSkuTable() {
  const c = $('skuTableContainer');
  if (!currentSkus.length) {
    c.innerHTML = '<div class="admin-option-empty">조합별 가격을 추가하거나 "자동 생성"을 눌러주세요.</div>';
    return;
  }
  const headers = currentOptions.map((g) => esc(g.name || '?'));
  c.innerHTML = `<div class="admin-sku-wrap"><table class="admin-sku-table">
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}<th>판매가</th><th>정가</th><th></th></tr></thead>
    <tbody>${currentSkus.map((sku, si) => `<tr>
      ${currentOptions.map((g, ci) => `<td><select class="admin-input-sm sku-combo-sel" data-si="${si}" data-ci="${ci}">
        <option value="">선택</option>
        ${g.values.map((v) => `<option value="${esc(v)}" ${sku.combo[ci] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select></td>`).join('')}
      <td><input type="number" class="admin-input-sm sku-price" data-si="${si}" value="${sku.price || ''}" placeholder="판매가" style="width:90px" /></td>
      <td><input type="number" class="admin-input-sm sku-orig" data-si="${si}" value="${sku.origPrice || ''}" placeholder="정가" style="width:90px" /></td>
      <td><button type="button" class="admin-ghost sku-del-btn" data-si="${si}">✕</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function generateAllCombinations() {
  syncOptionsFromDOM();
  const groups = currentOptions.map((g) => g.values.filter(Boolean));
  if (!groups.length || groups.some((v) => !v.length)) {
    showMsg('prodMsg', '모든 옵션 그룹에 값을 추가해 주세요.', true);
    return;
  }
  const combos = groups.reduce((acc, vals) => acc.flatMap((a) => vals.map((v) => [...a, v])), [[]]);
  const existing = new Set(currentSkus.map((s) => s.combo.join('\0')));
  combos.forEach((combo) => {
    if (!existing.has(combo.join('\0'))) { currentSkus.push({ combo, price: 0, origPrice: 0 }); existing.add(combo.join('\0')); }
  });
  renderSkuTable();
}

// ─── OPTION MODAL ─────────────────────────────────────────
const MODAL_TITLES = { brand: '새 브랜드 추가', cat1: '카테고리 1 추가', cat2: '카테고리 2 추가', cat3: '카테고리 3 추가', cat4: '카테고리 4 추가' };

function openOptionModal(kind) {
  optionModalKind = kind;
  $('optionModalTitle').textContent = MODAL_TITLES[kind] || '새 항목 추가';
  $('optKey').value = ''; $('optLabel').value = '';
  $('optionMsg').classList.add('hidden');
  $('optionModal').classList.remove('hidden');
  setTimeout(() => $('optKey').focus(), 50);
}
function closeOptionModal() { $('optionModal').classList.add('hidden'); optionModalKind = null; }

async function saveOption() {
  const key = $('optKey').value.trim(), label = $('optLabel').value.trim();
  const setErr = (t) => { const m = $('optionMsg'); m.textContent = t; m.classList.remove('hidden'); m.classList.add('error'); };
  if (!key || !label) return setErr('키와 표시명을 모두 입력해 주세요.');
  if (!/^[a-z0-9_-]+$/i.test(key)) return setErr('키는 영문/숫자/-/_ 만 가능합니다.');
  const checkList = optionModalKind === 'brand' ? BRANDS : (CATS[+optionModalKind.slice(3) - 1] || []);
  if (checkList.find((r) => r.value === key)) return setErr('이미 존재하는 키입니다.');
  const btn = $('optionSave');
  btn.disabled = true; btn.textContent = '추가 중...';
  const { error } = await db.from('filter_options').insert({
    type: optionModalKind === 'brand' ? 'brand' : optionModalKind,
    value: key, label, sort_order: 999,
  });
  btn.disabled = false; btn.textContent = '추가';
  if (error) return setErr(error.message);
  await loadOptions();
  if (optionModalKind === 'brand') { $('fBrand').value = key; syncBrandLabel(); }
  else if (/^cat[1-4]$/.test(optionModalKind)) { const n = +optionModalKind[3]; renderCatSelect(n); $(`pCat${n}`).value = key; }
  closeOptionModal();
  showMsg('adminMsg', '추가되었습니다.');
}

// ─── UTILS ────────────────────────────────────────────────
function showMsg(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('adminEventsTab').classList.toggle('hidden', tab !== 'events');
  $('adminProductsTab').classList.toggle('hidden', tab !== 'products');
  $('adminAlertsTab').classList.toggle('hidden', tab !== 'alerts');
  $('adminStatsTab').classList.toggle('hidden', tab !== 'stats');
  if (tab === 'alerts') { loadAlerts(); loadCrawlTargets(); }
  if (tab === 'stats') loadStats();
}

const KST_OFFSET_MS = 9 * 60 * 60_000;
function kstDayStartUtc(daysBack) {
  // UTC Date corresponding to 00:00 KST `daysBack` days ago.
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const midKst = Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - daysBack);
  return new Date(midKst - KST_OFFSET_MS);
}
function kstHourKey(d) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${k.getUTCMonth()}-${k.getUTCDate()}-${k.getUTCHours()}`;
}
function kstDayKey(d) {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}
// Stack a short label (e.g. "15시") character-by-character so each glyph stays
// upright — reads straight top-to-bottom without needing to tilt the head.
function stackedLabel(x, y, text) {
  const chars = [...String(text)];
  return `<text class="chart-xlbl" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${
    chars.map((c, i) => `<tspan x="${x.toFixed(1)}" dy="${i === 0 ? 0 : 1.1}em">${esc(c)}</tspan>`).join('')
  }</text>`;
}
function renderLineChart(el, bins, valueFn, labelFn, unit = '', onSelect = null) {
  const n = bins.length;
  // Canvas is 900×300 (3:1) — wide enough to breathe, short enough that the
  // whole thing fits on screen without scrolling.
  const W = 900, H = 320;
  const padL = 70, padR = 18, padT = 18, padB = 80;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...bins.map(valueFn));
  const step = n > 1 ? innerW / (n - 1) : 0;
  const pts = bins.map((b, i) => {
    const v = valueFn(b);
    return [padL + i * step, padT + innerH - (v / max) * innerH, v];
  });
  // Round Y-axis max up to a "nice" number so grid lines fall on round values.
  const niceMax = (() => {
    if (max <= 4) return Math.max(1, Math.ceil(max));
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const norm = max / pow;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * pow;
  })();
  const ySteps = 4;
  const grid = [];
  const yLabels = [];
  for (let i = 0; i <= ySteps; i++) {
    const ratio = i / ySteps;
    const y = padT + innerH - ratio * innerH;
    const v = Math.round(niceMax * ratio);
    grid.push(`<line class="chart-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${(padL + innerW).toFixed(1)}" y2="${y.toFixed(1)}" />`);
    yLabels.push(`<text class="chart-ylbl" x="${padL - 10}" y="${(y + 6).toFixed(1)}" text-anchor="end">${v}${unit}</text>`);
  }
  // Recompute Y-positions against niceMax so the line lines up with grid lines.
  const ptsScaled = bins.map((b, i) => {
    const v = valueFn(b);
    return [padL + i * step, padT + innerH - (v / niceMax) * innerH, v];
  });
  const line = ptsScaled.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(padL + innerW).toFixed(1)},${(padT + innerH).toFixed(1)} L${padL.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const dots = ptsScaled.map(([x, y, v], i) => v
    ? `<circle class="chart-dot" data-idx="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"><title>${labelFn(bins[i])}: ${v}${unit}</title></circle>`
    : '').join('');
  const hitW = step || innerW;
  const hits = ptsScaled.map(([x], i) => `<rect class="chart-hit" data-idx="${i}" x="${(x - hitW / 2).toFixed(1)}" y="${padT}" width="${hitW.toFixed(1)}" height="${innerH}"></rect>`).join('');
  // Show ~6 X-axis labels max — first, last, evenly-spaced in between.
  const labelStride = n <= 7 ? 1 : Math.max(1, Math.floor((n - 1) / 5));
  const xLabels = ptsScaled.map(([x], i) => {
    const show = i === 0 || i === n - 1 || (i % labelStride === 0 && (n - 1 - i) >= labelStride / 2);
    return show ? stackedLabel(x, padT + innerH + 22, labelFn(bins[i])) : '';
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img">
    ${grid.join('')}
    ${yLabels.join('')}
    <path class="chart-area" d="${area}" />
    <path class="chart-line" d="${line}" />
    ${dots}
    ${xLabels}
    ${hits}
  </svg>`;
  if (onSelect) {
    el.querySelectorAll('[data-idx]').forEach((node) => {
      node.addEventListener('click', () => {
        const i = +node.dataset.idx;
        el.querySelectorAll('.chart-dot').forEach((d) => d.classList.toggle('chart-dot--active', +d.dataset.idx === i));
        onSelect(bins[i], valueFn(bins[i]), i);
      });
    });
  }
}

let STATS_RANGE = 7;
async function loadStats() {
  $('statNow').textContent = $('adminOnlineCount').textContent || '0';
  const now = new Date();
  const sixtyAgo = new Date(now.getTime() - 60 * 60_000);
  const dayStart = kstDayStartUtc(0);
  const weekStart = kstDayStartUtc(6);
  // Fetch window covers the chosen range plus the 14-day retention baseline.
  const rangeStart = STATS_RANGE === 1
    ? new Date(now.getTime() - 24 * 3600_000)
    : kstDayStartUtc(STATS_RANGE - 1);
  const fetchFrom = new Date(Math.min(+rangeStart, now.getTime() - 14 * 24 * 3600_000));
  const exclude = `email.neq.${ADMIN_EMAIL},email.is.null`;

  const { data: rows = [], error } = await db
    .from('site_visits')
    .select('identity, email, visited_at, event_type, product_id')
    .gte('visited_at', fetchFrom.toISOString())
    .or(exclude)
    .order('visited_at', { ascending: false });
  if (error) { $('statsUpdated').textContent = `오류: ${error.message}`; return; }

  const weekRows = rows.filter((r) => new Date(r.visited_at) >= weekStart);
  const visits = weekRows.filter((r) => r.event_type === 'visit' || r.event_type === 'product_view');
  const buys = weekRows.filter((r) => r.event_type === 'buy_click');

  const uniq = (arr) => new Set(arr.map((r) => r.identity)).size;
  $('stat60m').textContent = uniq(visits.filter((r) => new Date(r.visited_at) >= sixtyAgo));
  $('statToday').textContent = uniq(visits.filter((r) => new Date(r.visited_at) >= dayStart));
  $('statBuyToday').textContent = buys.filter((r) => new Date(r.visited_at) >= dayStart).length;
  $('statBuyWeek').textContent = buys.length;

  // Build the rolling time axis once and reuse for both visitor + session charts.
  // Range 1 → 24 hourly bins ending at the current hour (rightmost = now).
  // Range N>1 → N daily bins ending at today (rightmost = today).
  const rangeRows = rows.filter((r) => new Date(r.visited_at) >= rangeStart);
  const rangeVisits = rangeRows.filter((r) => r.event_type === 'visit' || r.event_type === 'product_view');
  const useHour = STATS_RANGE === 1;
  const keyFn = (d) => useHour ? kstHourKey(d) : kstDayKey(d);
  const bins = [];
  if (useHour) {
    for (let i = 23; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 3600_000);
      const k = new Date(t.getTime() + KST_OFFSET_MS);
      bins.push({
        key: kstHourKey(t),
        label: String(k.getUTCHours()) + '시',
        full: `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${k.getUTCHours()}시`,
        visitors: new Set(), sUsers: new Set(), sDur: 0, sCount: 0,
        userDurs: new Map(),
      });
    }
    $('chartVisitorsTitle').innerHTML = '시간대별 방문자 <small>(최근 24시간 · KST)</small>';
  } else {
    for (let i = STATS_RANGE - 1; i >= 0; i--) {
      const start = kstDayStartUtc(i);
      const k = new Date(start.getTime() + KST_OFFSET_MS);
      const dow = ['일', '월', '화', '수', '목', '금', '토'][k.getUTCDay()];
      bins.push({
        key: kstDayKey(start),
        label: kstDayKey(start),
        full: `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 (${dow})`,
        visitors: new Set(), sUsers: new Set(), sDur: 0, sCount: 0,
        userDurs: new Map(),
      });
    }
    $('chartVisitorsTitle').innerHTML = `일별 방문자 <small>(최근 ${STATS_RANGE}일 · KST)</small>`;
  }
  const binMap = new Map(bins.map((b) => [b.key, b]));
  for (const v of rangeVisits) {
    const b = binMap.get(keyFn(new Date(v.visited_at)));
    if (b) b.visitors.add(v.identity);
  }
  renderLineChart($('chartVisitors'), bins, (b) => b.visitors.size, (b) => b.label, '명', (b) => {
    const emails = [...b.visitors].filter((id) => id.includes('@')).slice(0, 10);
    const anon = [...b.visitors].length - emails.length;
    $('chartVisitorsDetail').innerHTML = `
      <div class="chart-detail-row"><strong>${esc(b.full)}</strong><span>${b.visitors.size}명 방문</span></div>
      ${emails.length ? `<div class="chart-detail-sub">${emails.map(esc).join(', ')}${anon ? ` · 익명 ${anon}명` : ''}</div>` : (anon ? `<div class="chart-detail-sub">익명 ${anon}명</div>` : '')}
    `;
  });

  // Approximate sessions for the selected range — group per identity, split on
  // 30-minute gaps, then keep (startTime, durationSeconds, identity) for each session.
  const sessions = [];
  {
    const byId = new Map();
    for (const r of rangeRows) {
      if (!byId.has(r.identity)) byId.set(r.identity, []);
      byId.get(r.identity).push(+new Date(r.visited_at));
    }
    for (const [identity, arr] of byId.entries()) {
      arr.sort((a, b) => a - b);
      let start = arr[0], last = arr[0];
      for (let i = 1; i < arr.length; i++) {
        if (arr[i] - last > 30 * 60_000) {
          sessions.push({ start, dur: (last - start) / 1000, identity });
          start = arr[i];
        }
        last = arr[i];
      }
      if (start !== undefined) sessions.push({ start, dur: (last - start) / 1000, identity });
    }
    if (!sessions.length) {
      $('statAvgSession').textContent = '–';
    } else {
      const avg = Math.round(sessions.reduce((a, s) => a + s.dur, 0) / sessions.length);
      const mm = Math.floor(avg / 60), ss = avg % 60;
      $('statAvgSession').textContent = mm ? `${mm}분 ${ss}초` : `${ss}초`;
    }
  }

  // Average session duration on the same rolling time axis as the visitor
  // chart — each bin = a specific (date, hour) for range 1 or a specific date
  // for range >1. Rightmost bin = current hour / today.
  for (const s of sessions) {
    const b = binMap.get(keyFn(new Date(s.start)));
    if (b) {
      b.sDur += s.dur; b.sCount += 1; b.sUsers.add(s.identity);
      b.userDurs.set(s.identity, (b.userDurs.get(s.identity) || 0) + s.dur);
    }
  }
  const rangeLbl = STATS_RANGE === 1 ? '최근 24시간' : `최근 ${STATS_RANGE}일`;
  const axisLbl = useHour ? '시간대별' : '일별';
  $('chartSessionTitle').innerHTML = `${axisLbl} 평균 접속 시간 <small>(${rangeLbl} · KST · 초)</small>`;
  renderLineChart(
    $('chartSession'),
    bins,
    (b) => b.sCount ? Math.round(b.sDur / b.sCount) : 0,
    (b) => b.label,
    '초',
    (b) => {
      const avg = b.sCount ? Math.round(b.sDur / b.sCount) : 0;
      const fmt = (sec) => {
        const s = Math.round(sec);
        const m = Math.floor(s / 60), r = s % 60;
        return m ? `${m}분 ${r}초` : `${r}초`;
      };
      const userRows = [...b.userDurs.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([id, dur]) => `<li class="ses-user-row"><span class="ses-user-name">${id.includes('@') ? esc(id) : '<span class="visitor-anon">익명</span>'}</span><span class="ses-user-dur">${fmt(dur)}</span></li>`)
        .join('');
      $('chartSessionDetail').innerHTML = `
        <div class="chart-detail-row"><strong>${esc(b.full)}</strong><span>평균 ${fmt(avg)} · ${b.sUsers.size}명 접속</span></div>
        <div class="chart-detail-sub">세션 ${b.sCount}건 · 총 ${fmt(b.sDur)}</div>
        ${userRows ? `<ul class="ses-user-list">${userRows}</ul>` : ''}
      `;
    },
  );

  // Buy-click / distinct visitor ratio (last 7d)
  {
    const visitors = new Set(weekRows.filter((r) => r.event_type === 'visit' || r.event_type === 'product_view').map((r) => r.identity)).size;
    const clicks = buys.length;
    $('statBuyRatio').textContent = visitors
      ? `${clicks}/${visitors} (${Math.round((clicks / visitors) * 100)}%)`
      : '–';
  }

  // Retention — users active in the last 7d who were ALSO active in the prior 7d.
  const cutoff7 = new Date(now.getTime() - 7 * 24 * 3600_000);
  const recentUsers = new Set(), priorUsers = new Set();
  for (const r of rows) {
    if (r.event_type !== 'visit' && r.event_type !== 'product_view') continue;
    const t = new Date(r.visited_at);
    if (t >= cutoff7) recentUsers.add(r.identity);
    else priorUsers.add(r.identity);
  }
  const returned = [...recentUsers].filter((i) => priorUsers.has(i)).length;
  const pctRet = recentUsers.size ? Math.round((returned / recentUsers.size) * 100) : 0;
  $('statRetentionPct').textContent = `${pctRet}%`;
  $('statRetentionReturned').textContent = returned;
  $('statRetentionTotal').textContent = recentUsers.size;

  // Top-viewed + top-buy products (last 7d)
  const prodStats = (type) => {
    const m = new Map();
    for (const r of weekRows) {
      if (r.event_type !== type || !r.product_id) continue;
      const e = m.get(r.product_id) || { distinct: new Set(), total: 0 };
      e.distinct.add(r.identity); e.total += 1;
      m.set(r.product_id, e);
    }
    return [...m.entries()]
      .map(([pid, v]) => {
        const p = PRODUCTS.find((x) => x.id === pid);
        return { pid, name: p?.name || `#${pid}`, brand: p?.brand || '', distinct: v.distinct.size, total: v.total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  };
  const renderRank = (el, arr, unit) => {
    el.innerHTML = arr.length
      ? arr.map((x, i) => `<li class="rank-row">
          <span class="rank-num">${i + 1}</span>
          <span class="rank-name">${esc(x.name)}<small>${esc(x.brand)}</small></span>
          <span class="rank-val">${x.total}<small>${unit}</small></span>
        </li>`).join('')
      : '<li class="rank-empty">데이터 없음</li>';
  };
  renderRank($('topViewed'), prodStats('product_view'), '회');
  renderRank($('topBuys'), prodStats('buy_click'), '클릭');

  // Recent visitor list (24h, distinct by identity, latest first)
  const cutoff = new Date(now.getTime() - 24 * 3600_000);
  const seen = new Set();
  const recent = [];
  for (const v of visits) {
    if (new Date(v.visited_at) < cutoff) break;
    if (seen.has(v.identity)) continue;
    seen.add(v.identity);
    recent.push(v);
  }
  $('visitorList').innerHTML = recent.length
    ? recent.map((r) => {
        const who = r.email ? esc(r.email) : '<span class="visitor-anon">익명</span>';
        const t = new Date(r.visited_at).toLocaleString('ko-KR', { hour12: false });
        return `<li class="visitor-row"><span class="visitor-who">${who}</span><span class="visitor-when">${t}</span></li>`;
      }).join('')
    : '<li class="visitor-empty">방문 기록 없음</li>';

  $('statsUpdated').textContent = `갱신: ${now.toLocaleTimeString('ko-KR')}`;
}

// ─── CRAWL ALERTS ──────────────────────────────────────────
let ALERTS = [], TARGETS = [];
let editingTargetId = null;

async function loadAlerts() {
  const { data, error } = await db.from('crawl_alerts').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) {
    console.error('[loadAlerts]', error);
    $('alertList').innerHTML = `<div class="admin-row-empty">알림을 불러오지 못했습니다: ${esc(error.message)}</div>`;
    ALERTS = [];
    return;
  }
  ALERTS = data || [];
  renderAlerts();
}

function renderAlerts() {
  const badge = $('alertBadge');
  const unseen = ALERTS.filter((a) => !a.seen).length;
  badge.textContent = unseen;
  badge.classList.toggle('hidden', unseen === 0);

  const box = $('alertList');
  if (!ALERTS.length) { box.innerHTML = '<div class="admin-row-empty">알림이 없습니다.</div>'; return; }
  const typeClass = (label) => {
    if (!label) return '';
    if (label.includes('가격 변동')) return 'alert-type--price';
    if (label.includes('새 상품')) return 'alert-type--product';
    if (label.includes('새 이벤트')) return 'alert-type--event';
    if (label.includes('페이지 변경')) return 'alert-type--page';
    return '';
  };
  box.innerHTML = ALERTS.map((a) => `
    <div class="alert-row ${a.seen ? 'alert-row--seen' : ''}" data-id="${a.id}">
      <div class="alert-row-head">
        <span class="alert-type-badge ${typeClass(a.label)}">${esc(a.label || a.brand || '알림')}</span>
        <span class="alert-date">${fmtDt(a.created_at)}</span>
        ${!a.seen ? `<button class="admin-ghost alert-seen-btn" data-id="${a.id}">확인</button>` : '<span class="alert-done">✓</span>'}
        <button class="alert-close-btn" data-id="${a.id}" title="삭제" aria-label="알림 삭제">✕</button>
      </div>
      ${a.url ? `<a class="alert-url" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(truncateUrl(a.url, 60))}</a>` : ''}
      ${a.snippet ? `<div class="alert-snippet">${esc(a.snippet)}</div>` : ''}
    </div>`).join('');
}

async function deleteAlert(id) {
  const { error } = await db.from('crawl_alerts').delete().eq('id', id);
  if (error) { console.error('[deleteAlert]', error); return; }
  ALERTS = ALERTS.filter((a) => a.id !== id);
  renderAlerts();
}

async function markSeen(id) {
  await db.from('crawl_alerts').update({ seen: true }).eq('id', id);
  ALERTS = ALERTS.map((a) => (a.id === id ? { ...a, seen: true } : a));
  renderAlerts();
}

async function markAllSeen() {
  const ids = ALERTS.filter((a) => !a.seen).map((a) => a.id);
  if (!ids.length) return;
  await db.from('crawl_alerts').update({ seen: true }).in('id', ids);
  ALERTS = ALERTS.map((a) => ({ ...a, seen: true }));
  renderAlerts();
}

async function deleteAllAlerts() {
  if (!ALERTS.length) return;
  if (!confirm(`알림 ${ALERTS.length}개를 모두 삭제하시겠습니까?`)) return;
  const ids = ALERTS.map((a) => a.id);
  const { error } = await db.from('crawl_alerts').delete().in('id', ids);
  if (error) { showMsg('targetMsg', '알림 삭제 실패: ' + error.message, true); return; }
  ALERTS = [];
  renderAlerts();
}

async function loadCrawlTargets() {
  const { data, error } = await db.from('crawl_targets').select('*').order('id');
  if (error) {
    console.error('[loadCrawlTargets]', error);
    $('targetList').innerHTML = `<div class="admin-row-empty">모니터링 대상을 불러오지 못했습니다: ${esc(error.message)}</div>`;
    TARGETS = [];
    return;
  }
  TARGETS = data || [];
  renderCrawlTargets();
}

function renderCrawlTargets() {
  const box = $('targetList');
  if (!TARGETS.length) { box.innerHTML = '<div class="admin-row-empty">모니터링 대상이 없습니다. URL을 추가해 주세요.</div>'; return; }
  box.innerHTML = TARGETS.map((t) => {
    const brandLabel = BRANDS.find((b) => b.value === t.brand)?.label || t.brand || '';
    const scheduleText = formatSchedule(t);
    const scheduleClass = (t.schedule_hour != null && t.schedule_hour !== '' && (t.schedule_days || []).length) ? '' : 'target-schedule--off';
    const displayName = t.admin_title || t.label || brandLabel || t.url;
    const subtitle = t.admin_title && t.label ? ` · ${esc(t.label)}` : '';
    const typeLabel = t.target_type === 'event' ? '이벤트' : '상품';
    return `
    <div class="admin-row" data-id="${t.id}">
      <button type="button" class="admin-row-body target-edit-body" data-id="${t.id}" title="클릭하여 편집">
        <div class="admin-row-name">
          <span class="target-status-dot ${t.active ? 'on' : 'off'}" title="${t.active ? '활성' : '비활성'}"></span>
          ${esc(displayName)}${subtitle}
          <span class="target-type-chip target-type--${t.target_type || 'product'}">${typeLabel}</span>
        </div>
        <div class="admin-row-meta">
          <span class="target-url-wrap"><span class="target-url">${esc(truncateUrl(t.url, 40))}</span></span>
          <span class="target-schedule-chip ${scheduleClass}">${esc(scheduleText)}</span>
          ${t.last_checked_at ? `<span>· 마지막: ${fmtDt(t.last_checked_at)}</span>` : '<span>· 미확인</span>'}
        </div>
      </button>
      <button type="button" class="admin-ghost target-run-btn" data-id="${t.id}" title="이 대상만 지금 실행">▶ 실행</button>
      <div class="target-menu" data-id="${t.id}">
        <button type="button" class="admin-ghost target-menu-btn" data-id="${t.id}" aria-label="더보기">⋮</button>
        <div class="target-menu-pop hidden">
          <a class="target-menu-item" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">링크 열기</a>
          <button type="button" class="target-menu-item target-toggle-btn" data-id="${t.id}" data-active="${t.active}">${t.active ? '비활성화' : '활성화'}</button>
          <button type="button" class="target-menu-item target-menu-danger target-del-btn" data-id="${t.id}">삭제</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function getSelectedWeekdays() {
  return [...document.querySelectorAll('.t-weekday:checked')].map((c) => c.value);
}
function setSelectedWeekdays(days) {
  const set = new Set(days || []);
  document.querySelectorAll('.t-weekday').forEach((c) => { c.checked = set.has(c.value); });
}

function resetTargetForm() {
  editingTargetId = null;
  $('tId').value = '';
  $('tType').value = 'product';
  $('tAdminTitle').value = '';
  $('tBrand').value = ''; $('tLabel').value = ''; $('tUrl').value = '';
  ['tCat1', 'tCat2', 'tCat3', 'tCat4'].forEach((id) => { $(id).value = ''; });
  $('tScheduleH').value = ''; $('tScheduleM').value = '';
  setSelectedWeekdays([]);
  $('targetSave').textContent = 'URL 추가';
  $('targetCancel').classList.add('hidden');
}

function fillTargetForm(t) {
  editingTargetId = t.id;
  $('tId').value = t.id;
  $('tType').value = t.target_type || 'product';
  $('tAdminTitle').value = t.admin_title || '';
  $('tBrand').value = t.brand || '';
  $('tLabel').value = t.label || '';
  $('tUrl').value = t.url || '';
  [1, 2, 3, 4].forEach((n) => { $(`tCat${n}`).value = t[`category${n}`] || ''; });
  $('tScheduleH').value = t.schedule_hour != null ? t.schedule_hour : '';
  $('tScheduleM').value = t.schedule_minute != null ? t.schedule_minute : '';
  setSelectedWeekdays(t.schedule_days || []);
  $('targetSave').textContent = '수정 저장';
  $('targetCancel').classList.remove('hidden');
  document.querySelector('#adminAlertsTab .admin-panel:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveCrawlTarget(ev) {
  ev.preventDefault();
  const brand = $('tBrand').value;
  const label = $('tLabel').value.trim();
  const url = $('tUrl').value.trim();
  if (!brand) return showMsg('targetMsg', '브랜드를 선택해 주세요.', true);
  if (!url) return showMsg('targetMsg', 'URL을 입력해 주세요.', true);

  const brandLabel = BRANDS.find((b) => b.value === brand)?.label || brand;
  const hVal = $('tScheduleH').value;
  const mVal = $('tScheduleM').value;
  const days = getSelectedWeekdays();

  const payload = {
    brand,
    label: label || brandLabel,
    admin_title: $('tAdminTitle').value.trim() || null,
    target_type: $('tType').value || 'product',
    url,
    category1: $('tCat1').value || null,
    category2: $('tCat2').value || null,
    category3: $('tCat3').value || null,
    category4: $('tCat4').value || null,
    schedule_hour: hVal === '' ? null : +hVal,
    schedule_minute: mVal === '' ? 0 : +mVal,
    schedule_days: days,
  };

  const btn = $('targetSave');
  btn.disabled = true;
  const id = $('tId').value;
  const { error } = id
    ? await db.from('crawl_targets').update(payload).eq('id', +id)
    : await db.from('crawl_targets').insert(payload);
  btn.disabled = false;
  if (error) return showMsg('targetMsg', error.message, true);
  showMsg('targetMsg', id ? '수정되었습니다.' : '추가되었습니다.');
  resetTargetForm();
  await loadCrawlTargets();
}

let crawlResultDetailed = false;
let lastCrawlResults = null;

const NUTRI_LABELS = [
  ['calories', '칼로리', 'kcal'],
  ['serving_size_g', '1회 제공량', 'g'],
  ['protein_g', '단백질', 'g'],
  ['carb_g', '탄수화물', 'g'],
  ['fat_g', '지방', 'g'],
  ['sugar_g', '당류', 'g'],
  ['saturated_fat_g', '포화지방', 'g'],
  ['trans_fat_g', '트랜스지방', 'g'],
  ['cholesterol_mg', '콜레스테롤', 'mg'],
  ['sodium_mg', '나트륨', 'mg'],
];

function categoryLabelOf(n, value) {
  if (!value) return '';
  return CATS[n - 1].find((c) => c.value === value)?.label || value;
}

function renderCrawlResults(data) {
  lastCrawlResults = data;
  const panel = $('crawlResultPanel');
  const list = $('crawlResultList');
  const meta = $('crawlResultMeta');
  const count = $('crawlResultCount');

  if (!data || !Array.isArray(data.results) || !data.results.length) {
    panel.classList.add('hidden');
    return;
  }
  const totalProducts = data.products ?? data.results.reduce((n, r) => n + (r.products?.length || 0), 0);
  count.textContent = totalProducts;
  meta.textContent = `${data.checked ?? data.results.length}개 대상 · 상품 ${totalProducts}개 · 변경 ${data.alerts ?? 0}건`;

  list.innerHTML = data.results.map((r) => {
    const catChain = [1, 2, 3, 4].map((n) => categoryLabelOf(n, r[`category${n}`])).filter(Boolean).join(' > ') || '카테고리 없음';
    const header = `
      <div class="crawl-result-target-header ${r.error ? 'crawl-result-target-header--error' : ''}">
        ${esc(r.label || r.brand)} · ${esc(catChain)}
        ${r.error ? ` · ❌ ${esc(r.error)}` : ` · 상품 ${r.products?.length || 0}개 · 변경 ${r.alerts || 0}건`}
      </div>`;
    const cards = (r.products || []).map((p) => renderCrawlCard(p)).join('');
    return header + cards;
  }).join('');

  panel.classList.remove('hidden');
  applyCrawlDetailMode();
}

function renderCrawlCard(p) {
  const discount = (p.original_price && p.original_price > p.sale_price)
    ? Math.round((1 - p.sale_price / p.original_price) * 100) : 0;
  const statusClass = p.status === 'new' ? 'crawl-card--new' : (p.status === 'updated' ? 'crawl-card--updated' : '');
  const statusLabel = p.status === 'new' ? '신규' : (p.status === 'updated' ? '변동' : '동일');
  const opts = (p.options || []).map((o) => `
    <div class="crawl-card-section">
      <div class="crawl-card-section-title">${esc(o.name)} (${o.values.length})</div>
      <div class="crawl-card-opts">${o.values.map((v) => `<span class="crawl-card-opt-chip">${esc(v)}</span>`).join('')}</div>
    </div>`).join('');

  const nutri = p.nutrition || {};
  const nutriItems = NUTRI_LABELS.filter(([k]) => nutri[k] != null && nutri[k] !== '')
    .map(([k, label, unit]) => `<div class="crawl-card-nutri-item"><span class="crawl-card-nutri-label">${label}</span><span class="crawl-card-nutri-value">${nutri[k]}${unit}</span></div>`).join('');
  const nutriBlock = nutriItems
    ? `<div class="crawl-card-section"><div class="crawl-card-section-title">영양성분</div><div class="crawl-card-nutri-grid">${nutriItems}</div></div>`
    : `<div class="crawl-card-section"><div class="crawl-card-section-title">영양성분</div><div class="admin-option-empty-hint">페이지에서 찾지 못함</div></div>`;

  const skus = p.option_skus || [];
  const skusBlock = skus.length ? `
    <div class="crawl-card-section">
      <div class="crawl-card-section-title">SKU 조합 (${skus.length}개)</div>
      <div class="crawl-card-sku-wrap"><table class="crawl-card-sku-table">
        <thead><tr><th>옵션</th><th>판매가</th><th>정가</th></tr></thead>
        <tbody>${skus.slice(0, 40).map((s) => `
          <tr><td>${esc((s.combo || []).join(' / ') || '-')}</td><td>${fmtPrice(s.price)}</td><td>${s.orig_price && s.orig_price > s.price ? fmtPrice(s.orig_price) : '-'}</td></tr>
        `).join('')}${skus.length > 40 ? `<tr><td colspan="3" style="text-align:center;color:var(--muted)">... 외 ${skus.length - 40}개</td></tr>` : ''}</tbody>
      </table></div>
    </div>` : '';

  const breadcrumbs = (p.breadcrumbs || []).filter(Boolean);
  const bc = breadcrumbs.length ? `<div class="crawl-card-breadcrumbs">${esc(breadcrumbs.join(' > '))}</div>` : '';

  return `
    <div class="crawl-card ${statusClass}">
      <div class="crawl-card-thumb">${thumbHtml(p.thumbnail, '💊')}</div>
      <div class="crawl-card-body">
        <div class="crawl-card-head">
          <div class="crawl-card-name">${esc(p.name)}</div>
          <span class="crawl-card-status crawl-card-status--${p.status || 'unchanged'}">${statusLabel}</span>
        </div>
        ${bc}
        <div class="crawl-card-price">
          ${fmtPrice(p.sale_price)}
          ${discount ? `<span class="crawl-card-price-orig">${fmtPrice(p.original_price)}</span><span class="crawl-card-price-discount">-${discount}%</span>` : ''}
        </div>
        <div class="crawl-card-meta">
          ${(p.options || []).length ? `<span>옵션 ${p.options.reduce((n, o) => n + (o.values?.length || 0), 0)}개</span>` : ''}
          ${skus.length ? `<span>SKU ${skus.length}조합</span>` : ''}
        </div>
        ${p.short_desc ? `<div class="crawl-card-desc">${esc(p.short_desc)}</div>` : ''}
        <a class="crawl-card-link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.link)}</a>
        <div class="crawl-card-details">
          ${opts}
          ${nutriBlock}
          ${skusBlock}
        </div>
      </div>
    </div>`;
}

function applyCrawlDetailMode() {
  const list = $('crawlResultList');
  list.querySelectorAll('.crawl-card').forEach((c) => c.classList.toggle('detailed', crawlResultDetailed));
  list.querySelectorAll('.crawl-card-desc').forEach((d) => d.classList.toggle('expanded', crawlResultDetailed));
  $('crawlResultToggle').textContent = crawlResultDetailed ? '간결히' : '자세히';
}

async function runCrawlTarget(targetId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '실행 중...'; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/crawl-run`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ target_id: targetId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
    const products = data.products ?? 0, alerts = data.alerts ?? 0;
    showMsg('targetMsg', `완료: 상품 ${products}개 · 변경 ${alerts}건`);
    renderCrawlResults(data);
    await loadAlerts();
    await loadCrawlTargets();
    await loadProducts();
  } catch (e) {
    clearTimeout(timeout);
    const msg = e?.name === 'AbortError' ? '시간 초과' : (e?.message || String(e));
    console.error('[runCrawlTarget]', e);
    showMsg('targetMsg', '실행 실패: ' + msg, true);
  }
  if (btn) { btn.disabled = false; btn.textContent = '▶ 실행'; }
}

function renderGate(forbidden = false) {
  document.querySelector('main').innerHTML = `
    <div class="admin-gate">
      <h2>${forbidden ? '⛔ 접근 권한이 없습니다' : '🔒 로그인이 필요합니다'}</h2>
      <p>${forbidden ? '관리자 계정으로만 접근할 수 있습니다.' : '관리는 로그인한 사용자만 접근할 수 있습니다.'}</p>
      <button class="admin-primary" id="gateLogin">${forbidden ? '홈으로' : '로그인 페이지로'}</button>
    </div>`;
  $('gateLogin').addEventListener('click', () => (location.href = 'index.html'));
}

function attachListHandler(listId, items, selSet, fill, updateFn) {
  $(listId).addEventListener('click', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-id]');
    if (cb) {
      e.stopPropagation();
      const id = +cb.dataset.id;
      if (cb.checked) selSet.add(id); else selSet.delete(id);
      updateFn();
      return;
    }
    const row = e.target.closest('.admin-row');
    if (row) {
      const found = items().find((x) => x.id === +row.dataset.id);
      if (found) fill(found);
    }
  });
}

// ─── INIT ─────────────────────────────────────────────────
async function init() {
  buildTimeSelects();
  const mainEl = document.querySelector('main');
  const { data } = await db.auth.getSession();
  mainEl.style.visibility = '';
  if (!data.session) { renderGate(false); return; }
  if (data.session.user.email !== ADMIN_EMAIL) { renderGate(true); return; }

  $('adminLogin').textContent = data.session.user.email || '로그인됨';
  $('adminLogin').addEventListener('click', async () => { await db.auth.signOut(); location.href = 'index.html'; });

  // Online-user count (presence). Admin is observe-only — does not call .track()
  // so this tab itself is not added to the count. Excludes the admin email key.
  const online = db.channel('site-online');
  const updateOnline = () => {
    const state = online.presenceState();
    const count = Object.keys(state).filter((k) => k !== ADMIN_EMAIL).length;
    const el = $('adminOnlineCount');
    if (el) el.textContent = count;
  };
  online.on('presence', { event: 'sync' }, updateOnline);
  online.on('presence', { event: 'join' }, updateOnline);
  online.on('presence', { event: 'leave' }, updateOnline);
  online.subscribe();

  document.querySelectorAll('.admin-tab').forEach((b) => b.addEventListener('click', () => switchAdminTab(b.dataset.tab)));
  $('statsRefresh')?.addEventListener('click', loadStats);
  document.querySelectorAll('.stats-range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      STATS_RANGE = +btn.dataset.range;
      document.querySelectorAll('.stats-range-btn').forEach((b) => b.classList.toggle('active', b === btn));
      loadStats();
    });
  });

  // Event form
  $('adminForm').addEventListener('submit', saveEvent);
  $('adminReset').addEventListener('click', () => fillEventForm(null));
  $('adminDelete').addEventListener('click', deleteEvent);
  $('fOngoing').addEventListener('change', () => toggleOngoing($('fOngoing').checked));
  $('fBrand').addEventListener('change', syncBrandLabel);
  $('prodSearch').addEventListener('input', (e) => renderProdPicker(e.target.value));
  $('prodPicker').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-pid]');
    if (!cb) return;
    const id = +cb.dataset.pid;
    if (cb.checked) linkedProducts.add(id); else linkedProducts.delete(id);
    $('linkedCount').textContent = linkedProducts.size ? `(${linkedProducts.size}개 연결됨)` : '';
  });

  // Event list
  attachListHandler('adminList', () => EVENTS, selected, fillEventForm, () => updateBulk('bulk', selected, getEventListFiltered()));
  $('adminListSearch').addEventListener('input', renderEventList);
  $('bulkCheckAll').addEventListener('change', (e) => {
    const filtered = getEventListFiltered();
    if (e.target.checked) filtered.forEach((ev) => selected.add(ev.id));
    else filtered.forEach((ev) => selected.delete(ev.id));
    renderEventList();
  });
  $('bulkDelete').addEventListener('click', () => doBulkDelete('events', selected, 'bulkDelete', (ids) => {
    if (ids.includes(editingId)) fillEventForm(null);
    showMsg('adminMsg', `${ids.length}개 삭제되었습니다.`);
    loadEvents();
  }));

  // Brand/cat modals
  $('addBrandBtn').addEventListener('click', () => openOptionModal('brand'));
  $('optionModalClose').addEventListener('click', closeOptionModal);
  $('optionCancel').addEventListener('click', closeOptionModal);
  $('optionSave').addEventListener('click', saveOption);
  $('optionModal').addEventListener('click', (e) => { if (e.target === $('optionModal')) closeOptionModal(); });
  [$('optKey'), $('optLabel')].forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveOption(); }));

  // Product form
  $('prodForm').addEventListener('submit', saveProd);
  $('prodReset').addEventListener('click', () => fillProdForm(null));
  $('prodDelete').addEventListener('click', deleteProd);
  [1, 2, 3, 4].forEach((n) => $(`addCat${n}Btn`).addEventListener('click', () => openOptionModal(`cat${n}`)));
  $('showCat3Btn').addEventListener('click', () => {
    if ($('pCat3Wrap').classList.contains('hidden')) $('pCat3Wrap').classList.remove('hidden');
    else $('pCat4Wrap').classList.remove('hidden');
    updateCatExtraVisibility();
  });
  $('removeCat3Btn').addEventListener('click', () => {
    $('pCat3').value = '';
    $('pCat3Wrap').classList.add('hidden');
    $('pCat4').value = '';
    $('pCat4Wrap').classList.add('hidden');
    updateCatExtraVisibility();
  });
  $('removeCat4Btn').addEventListener('click', () => {
    $('pCat4').value = '';
    $('pCat4Wrap').classList.add('hidden');
    updateCatExtraVisibility();
  });
  $('eventSearch').addEventListener('input', (e) => renderEventPicker(e.target.value));
  $('eventPicker').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-eid]');
    if (!cb) return;
    const id = +cb.dataset.eid;
    if (cb.checked) linkedEvents.add(id); else linkedEvents.delete(id);
    $('linkedEventCount').textContent = linkedEvents.size ? `(${linkedEvents.size}개 연결됨)` : '';
  });

  // Product options
  $('addOptionGroupBtn').addEventListener('click', () => {
    syncOptionsFromDOM();
    if (currentOptions.length >= 3) return;
    currentOptions.push({ name: '', values: [] });
    renderOptionGroups();
    const inputs = document.querySelectorAll('.option-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  $('optionGroupsContainer').addEventListener('click', (e) => {
    const up = e.target.closest('.opt-group-move-up');
    if (up) {
      syncOptionsFromDOM();
      const gi = +up.dataset.gi;
      if (gi > 0) {
        [currentOptions[gi - 1], currentOptions[gi]] = [currentOptions[gi], currentOptions[gi - 1]];
        currentSkus.forEach((s) => { [s.combo[gi - 1], s.combo[gi]] = [s.combo[gi], s.combo[gi - 1]]; });
        renderOptionGroups();
      }
      return;
    }
    const down = e.target.closest('.opt-group-move-down');
    if (down) {
      syncOptionsFromDOM();
      const gi = +down.dataset.gi;
      if (gi < currentOptions.length - 1) {
        [currentOptions[gi], currentOptions[gi + 1]] = [currentOptions[gi + 1], currentOptions[gi]];
        currentSkus.forEach((s) => { [s.combo[gi], s.combo[gi + 1]] = [s.combo[gi + 1], s.combo[gi]]; });
        renderOptionGroups();
      }
      return;
    }
    const del = e.target.closest('.option-group-del');
    if (del) {
      syncOptionsFromDOM();
      currentOptions.splice(+del.dataset.gi, 1);
      currentSkus = [];
      renderOptionGroups();
      return;
    }
    const chipDel = e.target.closest('.opt-chip-del');
    if (chipDel) {
      syncOptionsFromDOM();
      const gi = +chipDel.dataset.gi, vi = +chipDel.dataset.vi;
      const removed = currentOptions[gi].values[vi];
      currentOptions[gi].values.splice(vi, 1);
      currentSkus = currentSkus.filter((s) => s.combo[gi] !== removed);
      renderOptionGroups();
      return;
    }
    const chipUp = e.target.closest('.opt-chip-up');
    if (chipUp) {
      syncOptionsFromDOM();
      const gi = +chipUp.dataset.gi, vi = +chipUp.dataset.vi;
      if (vi > 0) {
        const vals = currentOptions[gi].values;
        [vals[vi], vals[vi - 1]] = [vals[vi - 1], vals[vi]];
        renderOptionGroups();
      }
      return;
    }
    const chipDown = e.target.closest('.opt-chip-down');
    if (chipDown) {
      syncOptionsFromDOM();
      const gi = +chipDown.dataset.gi, vi = +chipDown.dataset.vi;
      const vals = currentOptions[gi].values;
      if (vi < vals.length - 1) {
        [vals[vi], vals[vi + 1]] = [vals[vi + 1], vals[vi]];
        renderOptionGroups();
      }
      return;
    }
    const chipLabel = e.target.closest('.opt-chip-label');
    if (chipLabel && !chipLabel.querySelector('input')) {
      const gi = +chipLabel.dataset.gi, vi = +chipLabel.dataset.vi;
      const oldVal = currentOptions[gi]?.values[vi];
      if (oldVal == null) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'admin-input-sm opt-chip-rename';
      input.value = oldVal;
      chipLabel.textContent = '';
      chipLabel.appendChild(input);
      input.focus();
      input.select();
      let done = false;
      const commit = (save) => {
        if (done) return;
        done = true;
        const newVal = input.value.trim();
        if (!save || !newVal || newVal === oldVal) return renderOptionGroups();
        if (currentOptions[gi].values.includes(newVal)) {
          alert(`"${newVal}" 값이 이미 존재합니다.`);
          return renderOptionGroups();
        }
        syncOptionsFromDOM();
        currentOptions[gi].values[vi] = newVal;
        currentSkus.forEach((s) => { if (s.combo[gi] === oldVal) s.combo[gi] = newVal; });
        renderOptionGroups();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
      });
      input.addEventListener('blur', () => commit(true));
      return;
    }
  });
  $('skuTableContainer').addEventListener('click', (e) => {
    const del = e.target.closest('.sku-del-btn');
    if (!del) return;
    syncOptionsFromDOM();
    currentSkus.splice(+del.dataset.si, 1);
    renderSkuTable();
  });
  $('addSkuRowBtn').addEventListener('click', () => {
    syncOptionsFromDOM();
    currentSkus.push({ combo: currentOptions.map(() => ''), price: 0, origPrice: 0 });
    renderSkuTable();
  });
  $('genCombosBtn').addEventListener('click', generateAllCombinations);

  // Product list
  $('prodListSearch').addEventListener('input', renderProdList);
  attachListHandler('prodList', () => PRODUCTS, prodSelected, fillProdForm, () => updateBulk('prodBulk', prodSelected, getProdListFiltered()));
  $('prodBulkAll').addEventListener('change', (e) => {
    const filtered = getProdListFiltered();
    if (e.target.checked) filtered.forEach((p) => prodSelected.add(p.id));
    else filtered.forEach((p) => prodSelected.delete(p.id));
    renderProdList();
  });
  $('prodBulkDelete').addEventListener('click', () => doBulkDelete('products', prodSelected, 'prodBulkDelete', (ids) => {
    if (ids.includes(prodEditingId)) fillProdForm(null);
    showMsg('prodMsg', `${ids.length}개 삭제되었습니다.`);
    loadProducts();
  }));

  // Alerts tab
  $('alertList').addEventListener('click', async (e) => {
    const del = e.target.closest('.alert-close-btn');
    if (del) { await deleteAlert(+del.dataset.id); return; }
    const btn = e.target.closest('.alert-seen-btn');
    if (btn) await markSeen(+btn.dataset.id);
  });
  $('markAllSeenBtn').addEventListener('click', markAllSeen);
  $('deleteAllAlertsBtn').addEventListener('click', deleteAllAlerts);
  buildTargetTimeSelects();
  $('targetForm').addEventListener('submit', saveCrawlTarget);
  $('targetCancel').addEventListener('click', () => { resetTargetForm(); showMsg('targetMsg', '취소되었습니다.'); });
  $('targetList').addEventListener('click', async (e) => {
    const run = e.target.closest('.target-run-btn');
    if (run) { await runCrawlTarget(+run.dataset.id, run); return; }
    const menuBtn = e.target.closest('.target-menu-btn');
    if (menuBtn) {
      const pop = menuBtn.parentElement.querySelector('.target-menu-pop');
      document.querySelectorAll('.target-menu-pop').forEach((p) => { if (p !== pop) p.classList.add('hidden'); });
      pop.classList.toggle('hidden');
      return;
    }
    const edit = e.target.closest('.target-edit-body');
    if (edit) { const t = TARGETS.find((x) => x.id === +edit.dataset.id); if (t) fillTargetForm(t); return; }
    const del = e.target.closest('.target-del-btn');
    if (del) {
      if (!confirm('삭제하시겠습니까?')) return;
      const { error } = await db.from('crawl_targets').delete().eq('id', +del.dataset.id);
      if (error) return showMsg('targetMsg', error.message, true);
      if (editingTargetId === +del.dataset.id) resetTargetForm();
      await loadCrawlTargets();
      return;
    }
    const tog = e.target.closest('.target-toggle-btn');
    if (tog) {
      const { error } = await db.from('crawl_targets').update({ active: tog.dataset.active !== 'true' }).eq('id', +tog.dataset.id);
      if (error) return showMsg('targetMsg', error.message, true);
      await loadCrawlTargets();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.target-menu')) {
      document.querySelectorAll('.target-menu-pop').forEach((p) => p.classList.add('hidden'));
    }
  });
  // (removed global runCrawlNowBtn — per-target buttons replace it)
  $('crawlResultToggle').addEventListener('click', () => { crawlResultDetailed = !crawlResultDetailed; applyCrawlDetailMode(); });
  $('crawlResultClose').addEventListener('click', () => { $('crawlResultPanel').classList.add('hidden'); });

  await Promise.all([loadOptions(), loadEvents(), loadProducts()]);
  renderProdPicker('');
  renderEventPicker('');
  loadAlerts();
}

document.addEventListener('DOMContentLoaded', init);
