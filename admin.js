'use strict';

const SUPABASE_URL = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
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

let EVENTS = [], PRODUCTS = [], BRANDS = [], TYPES = [];
let CATS = [[], [], [], []]; // cat1..cat4
let editingId = null, prodEditingId = null, optionModalKind = null;
const selected = new Set();
const selectedTypes = new Set();
const linkedProducts = new Set();
const prodSelected = new Set();

// ─── filter_options ──────────────────────────────────────
async function loadOptions() {
  const { data } = await db.from('filter_options').select('*').order('sort_order').order('id');
  const rows = data || [];
  BRANDS = rows.filter((r) => r.type === 'brand');
  TYPES = rows.filter((r) => r.type === 'category');
  CATS = [1, 2, 3, 4].map((n) => rows.filter((r) => r.type === `cat${n}`));
  renderBrandSelect('fBrand'); renderBrandSelect('pBrand');
  renderTypeChips('fProductTypes', selectedTypes);
  renderProductTypeSelect();
  [1, 2, 3, 4].forEach(renderCatSelect);
}

function renderProductTypeSelect() {
  const sel = $('pProductType');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">선택 안함</option>'
    + TYPES.map((t) => `<option value="${esc(t.value)}">${esc(t.label)}</option>`).join('');
  if (cur && TYPES.find((t) => t.value === cur)) sel.value = cur;
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
  const sel = $(id), cur = sel.value;
  sel.innerHTML = '<option value="">브랜드 선택</option>'
    + BRANDS.map((b) => `<option value="${esc(b.value)}" data-label="${esc(b.label)}">${esc(b.label)}</option>`).join('');
  if (cur && BRANDS.find((b) => b.value === cur)) sel.value = cur;
  if (id === 'fBrand') syncBrandLabel();
}

function syncBrandLabel() {
  const sel = $('fBrand');
  $('fBrandLabel').value = sel.options[sel.selectedIndex]?.dataset.label || '';
}

function renderTypeChips(targetId, set) {
  $(targetId).innerHTML = TYPES.map((t) => `
    <label class="admin-chip-item ${set.has(t.value) ? 'checked' : ''}" data-value="${esc(t.value)}">
      <input type="checkbox" ${set.has(t.value) ? 'checked' : ''} /><span>${esc(t.label)}</span>
    </label>`).join('');
}

// ─── EVENTS ──────────────────────────────────────────────
async function loadEvents() {
  const { data, error } = await db.from('events').select('*').order('id', { ascending: false });
  if (error) return showMsg('adminMsg', error.message, true);
  EVENTS = data || [];
  renderEventList();
}

function renderEventList() {
  const box = $('adminList');
  $('adminCount').textContent = EVENTS.length;
  for (const id of [...selected]) if (!EVENTS.find((e) => e.id === id)) selected.delete(id);
  if (!EVENTS.length) { box.innerHTML = '<div class="admin-row-empty">등록된 이벤트가 없습니다.</div>'; updateBulk('bulk', selected, EVENTS.length); return; }
  box.innerHTML = EVENTS.map((e) => {
    const period = [e.start_date, e.end_date].filter(Boolean).join(' ~ ') || '상시';
    return `<div class="admin-row ${e.id === editingId ? 'active' : ''}" data-id="${e.id}">
      <input type="checkbox" class="admin-row-check" data-id="${e.id}" ${selected.has(e.id) ? 'checked' : ''} />
      <div class="admin-row-thumb">${thumbHtml(e.thumbnail, '🏷️')}</div>
      <div class="admin-row-body">
        <div class="admin-row-name">${esc(e.name)}</div>
        <div class="admin-row-meta">${esc(e.brand_label || e.brand)} · ${esc(period)}</div>
      </div>
    </div>`;
  }).join('');
  updateBulk('bulk', selected, EVENTS.length);
}

function updateBulk(prefix, set, total) {
  $(`${prefix}Selected`).textContent = `${set.size}개 선택`;
  $(`${prefix}Delete`).disabled = set.size === 0;
  const all = $(`${prefix}CheckAll`) || $(`${prefix}All`);
  all.checked = total > 0 && set.size === total;
  all.indeterminate = set.size > 0 && set.size < total;
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
  ['fDiscount', 'discount_pct'], ['fStart', 'start_date'], ['fEnd', 'end_date'],
  ['fLink', 'link'], ['fCouponCode', 'coupon_code'], ['fCouponNote', 'coupon_note'],
];

function fillEventForm(e) {
  editingId = e?.id ?? null;
  $('fId').value = e?.id ?? '';
  EVENT_FIELDS.forEach(([id, key]) => {
    if (id === 'fBrand' || id === 'fBrandLabel') return;
    $(id).value = e?.[key] ?? (id === 'fDiscount' ? 0 : '');
  });
  $('fBrand').value = e?.brand ?? '';
  syncBrandLabel();
  $('fActive').value = e?.active === false ? 'false' : 'true';
  $('fConditions').value = arrToLines(e?.conditions);
  $('fHowTo').value = arrToLines(e?.how_to);
  selectedTypes.clear();
  (e?.product_types || []).forEach((t) => selectedTypes.add(t));
  renderTypeChips('fProductTypes', selectedTypes);
  linkedProducts.clear();
  (e?.product_ids || []).forEach((id) => linkedProducts.add(id));
  $('prodSearch').value = '';
  renderProdPicker('');
  $('adminFormTitle').textContent = e ? `이벤트 #${e.id} 수정` : '새 이벤트 등록';
  $('adminDelete').classList.toggle('hidden', !e);
  renderEventList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProdPicker(q) {
  const box = $('prodPicker');
  const qLow = q.toLowerCase();
  const filtered = qLow
    ? PRODUCTS.filter((p) => (p.name + ' ' + p.brand).toLowerCase().includes(qLow))
    : PRODUCTS;
  $('linkedCount').textContent = linkedProducts.size ? `(${linkedProducts.size}개 연결됨)` : '';
  if (!filtered.length) { box.innerHTML = '<div class="admin-picker-empty">검색 결과가 없습니다.</div>'; return; }
  box.innerHTML = filtered.map((p) => {
    const d = discPct(p);
    return `<label class="admin-picker-row">
      <input type="checkbox" data-pid="${p.id}" ${linkedProducts.has(p.id) ? 'checked' : ''} />
      <div class="admin-picker-thumb">${thumbHtml(p.thumbnail, p.emoji || '💊')}</div>
      <div class="admin-picker-info">
        <div class="admin-picker-name">${esc(p.name)}</div>
        <div class="admin-picker-meta">${esc(p.store || p.brand)}${d ? ` · -${d}%` : ''} · ${fmtPrice(p.sale_price)}</div>
      </div>
    </label>`;
  }).join('');
}

function collectEventForm() {
  const payload = {};
  EVENT_FIELDS.forEach(([id, key]) => {
    const v = $(id).value.trim();
    payload[key] = v === '' ? null : (key === 'discount_pct' ? +v : v);
  });
  payload.active = $('fActive').value === 'true';
  payload.conditions = linesToArr($('fConditions').value);
  payload.how_to = linesToArr($('fHowTo').value);
  payload.product_types = [...selectedTypes];
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
  renderProdList('');
}

function renderProdList(q) {
  const box = $('prodList');
  const qLow = q.toLowerCase();
  const filtered = qLow
    ? PRODUCTS.filter((p) => (p.name + ' ' + p.brand).toLowerCase().includes(qLow))
    : PRODUCTS;
  $('prodCount').textContent = PRODUCTS.length;
  for (const id of [...prodSelected]) if (!PRODUCTS.find((p) => p.id === id)) prodSelected.delete(id);
  if (!filtered.length) { box.innerHTML = '<div class="admin-row-empty">상품이 없습니다.</div>'; updateBulk('prodBulk', prodSelected, PRODUCTS.length); return; }
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
  updateBulk('prodBulk', prodSelected, PRODUCTS.length);
}

function fillProdForm(p) {
  prodEditingId = p?.id ?? null;
  $('pId').value = p?.id ?? '';
  $('pName').value = p?.name ?? '';
  $('pBrand').value = p?.brand ?? '';
  $('pStore').value = p?.store ?? '';
  $('pEmoji').value = p?.emoji ?? '';
  $('pThumbnail').value = p?.thumbnail ?? '';
  $('pOrigPrice').value = p?.original_price ?? '';
  $('pSalePrice').value = p?.sale_price ?? '';
  $('pLink').value = p?.link ?? '';
  $('pProductType').value = p?.product_type ?? '';
  [1, 2, 3, 4].forEach((n) => { $(`pCat${n}`).value = p?.[`category${n}`] ?? ''; });
  $('prodFormTitle').textContent = p ? `상품 #${p.id} 수정` : '새 상품 등록';
  $('prodDelete').classList.toggle('hidden', !p);
  renderProdList($('prodListSearch').value);
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
    product_type: $('pProductType').value || null,
    category1: $('pCat1').value || null,
    category2: $('pCat2').value || null,
    category3: $('pCat3').value || null,
    category4: $('pCat4').value || null,
    thumbnail: $('pThumbnail').value.trim() || null,
    original_price: +$('pOrigPrice').value || 0,
    sale_price: +$('pSalePrice').value || 0,
    link: $('pLink').value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const btn = $('prodSave');
  btn.disabled = true; btn.textContent = '저장 중...';
  const id = $('pId').value;
  const { error } = await (id ? db.from('products').update(payload).eq('id', +id) : db.from('products').insert(payload));
  btn.disabled = false; btn.textContent = '저장';
  if (error) return showMsg('prodMsg', error.message, true);
  showMsg('prodMsg', id ? '수정되었습니다.' : '등록되었습니다.');
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

// ─── OPTION MODAL ─────────────────────────────────────────
const MODAL_TITLES = { brand: '새 브랜드 추가', type: '새 이벤트 상품유형 추가', cat1: '카테고리 1 추가', cat2: '카테고리 2 추가', cat3: '카테고리 3 추가', cat4: '카테고리 4 추가' };

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
  const checkList = optionModalKind === 'brand' ? BRANDS : optionModalKind === 'type' ? TYPES : (CATS[+optionModalKind.slice(3) - 1] || []);
  if (checkList.find((r) => r.value === key)) return setErr('이미 존재하는 키입니다.');
  const btn = $('optionSave');
  btn.disabled = true; btn.textContent = '추가 중...';
  const { error } = await db.from('filter_options').insert({
    type: optionModalKind === 'brand' ? 'brand' : optionModalKind === 'type' ? 'category' : optionModalKind,
    value: key, label, sort_order: 999,
  });
  btn.disabled = false; btn.textContent = '추가';
  if (error) return setErr(error.message);
  await loadOptions();
  if (optionModalKind === 'brand') { $('fBrand').value = key; syncBrandLabel(); }
  else if (optionModalKind === 'type') { selectedTypes.add(key); renderTypeChips('fProductTypes', selectedTypes); renderProductTypeSelect(); $('pProductType').value = key; }
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
}

function renderGate() {
  document.querySelector('main').innerHTML = `
    <div class="admin-gate">
      <h2>🔒 로그인이 필요합니다</h2>
      <p>관리는 로그인한 사용자만 접근할 수 있습니다.</p>
      <button class="admin-primary" id="gateLogin">로그인 페이지로</button>
    </div>`;
  $('gateLogin').addEventListener('click', () => (location.href = 'index.html'));
}

// Chip toggle handler (single-select or multi-select)
function attachChipHandler(containerId, set, multi) {
  $(containerId).addEventListener('click', (e) => {
    const item = e.target.closest('.admin-chip-item');
    if (!item) return;
    e.preventDefault();
    const v = item.dataset.value;
    if (multi) {
      if (set.has(v)) set.delete(v); else set.add(v);
      item.querySelector('input').checked = set.has(v);
      item.classList.toggle('checked', set.has(v));
    } else {
      set.clear(); set.add(v);
      renderTypeChips(containerId, set);
    }
  });
}

// List row click/check handler factory
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
  const { data } = await db.auth.getSession();
  if (!data.session) { renderGate(); return; }

  $('adminLogin').textContent = data.session.user.email || '로그인됨';
  $('adminLogin').addEventListener('click', async () => { await db.auth.signOut(); location.href = 'index.html'; });

  document.querySelectorAll('.admin-tab').forEach((b) => b.addEventListener('click', () => switchAdminTab(b.dataset.tab)));

  // Event form
  $('adminForm').addEventListener('submit', saveEvent);
  $('adminReset').addEventListener('click', () => fillEventForm(null));
  $('adminDelete').addEventListener('click', deleteEvent);
  $('fBrand').addEventListener('change', syncBrandLabel);
  attachChipHandler('fProductTypes', selectedTypes, true);

  // Product picker
  $('prodSearch').addEventListener('input', (e) => renderProdPicker(e.target.value));
  $('prodPicker').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-pid]');
    if (!cb) return;
    const id = +cb.dataset.pid;
    if (cb.checked) linkedProducts.add(id); else linkedProducts.delete(id);
    $('linkedCount').textContent = linkedProducts.size ? `(${linkedProducts.size}개 연결됨)` : '';
  });

  // Event list
  attachListHandler('adminList', () => EVENTS, selected, fillEventForm, () => updateBulk('bulk', selected, EVENTS.length));
  $('bulkCheckAll').addEventListener('change', (e) => {
    selected.clear();
    if (e.target.checked) EVENTS.forEach((ev) => selected.add(ev.id));
    renderEventList();
  });
  $('bulkDelete').addEventListener('click', () => doBulkDelete('events', selected, 'bulkDelete', (ids) => {
    if (ids.includes(editingId)) fillEventForm(null);
    showMsg('adminMsg', `${ids.length}개 삭제되었습니다.`);
    loadEvents();
  }));

  // Brand/type modals
  $('addBrandBtn').addEventListener('click', () => openOptionModal('brand'));
  $('addTypeBtn').addEventListener('click', () => openOptionModal('type'));
  $('optionModalClose').addEventListener('click', closeOptionModal);
  $('optionCancel').addEventListener('click', closeOptionModal);
  $('optionSave').addEventListener('click', saveOption);
  $('optionModal').addEventListener('click', (e) => { if (e.target === $('optionModal')) closeOptionModal(); });
  [$('optKey'), $('optLabel')].forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveOption(); }));

  // Product form
  $('prodForm').addEventListener('submit', saveProd);
  $('prodReset').addEventListener('click', () => fillProdForm(null));
  $('prodDelete').addEventListener('click', deleteProd);
  $('addProdTypeBtn').addEventListener('click', () => openOptionModal('type'));
  [1, 2, 3, 4].forEach((n) => $(`addCat${n}Btn`).addEventListener('click', () => openOptionModal(`cat${n}`)));

  // Product list
  $('prodListSearch').addEventListener('input', (e) => renderProdList(e.target.value));
  attachListHandler('prodList', () => PRODUCTS, prodSelected, fillProdForm, () => updateBulk('prodBulk', prodSelected, PRODUCTS.length));
  $('prodBulkAll').addEventListener('change', (e) => {
    prodSelected.clear();
    if (e.target.checked) PRODUCTS.forEach((p) => prodSelected.add(p.id));
    renderProdList($('prodListSearch').value);
  });
  $('prodBulkDelete').addEventListener('click', () => doBulkDelete('products', prodSelected, 'prodBulkDelete', (ids) => {
    if (ids.includes(prodEditingId)) fillProdForm(null);
    showMsg('prodMsg', `${ids.length}개 삭제되었습니다.`);
    loadProducts();
  }));

  await Promise.all([loadOptions(), loadEvents(), loadProducts()]);
}

document.addEventListener('DOMContentLoaded', init);
