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

let EVENTS = [], PRODUCTS = [], BRANDS = [], TYPES = [];
let editingId = null;
const selected = new Set();
const selectedTypes = new Set();
const linkedProducts = new Set();

let prodEditingId = null;
const prodSelected = new Set();
const selectedPCategory = new Set();

let optionModalKind = null;
let prodSearchQuery = '';

// ─── filter_options ──────────────────────────────────────
async function loadOptions() {
  const { data } = await db.from('filter_options').select('*').order('sort_order').order('id');
  const rows = data || [];
  BRANDS = rows.filter((r) => r.type === 'brand');
  TYPES = rows.filter((r) => r.type === 'category');
  renderBrandSelect('fBrand');
  renderBrandSelect('pBrand');
  renderTypeChips();
  renderPCategoryChips();
}

function renderBrandSelect(id) {
  const sel = $(id);
  const cur = sel.value;
  sel.innerHTML = '<option value="">브랜드 선택</option>'
    + BRANDS.map((b) => `<option value="${esc(b.value)}" data-label="${esc(b.label)}">${esc(b.label)}</option>`).join('');
  if (cur && BRANDS.find((b) => b.value === cur)) sel.value = cur;
  if (id === 'fBrand') syncBrandLabel();
}

function syncBrandLabel() {
  const sel = $('fBrand');
  $('fBrandLabel').value = sel.options[sel.selectedIndex]?.dataset.label || '';
}

function renderTypeChips() {
  $('fProductTypes').innerHTML = TYPES.map((t) => `
    <label class="admin-chip-item ${selectedTypes.has(t.value) ? 'checked' : ''}" data-value="${esc(t.value)}">
      <input type="checkbox" ${selectedTypes.has(t.value) ? 'checked' : ''} /><span>${esc(t.label)}</span>
    </label>`).join('');
}

function renderPCategoryChips() {
  $('pCategory').innerHTML = TYPES.map((t) => `
    <label class="admin-chip-item ${selectedPCategory.has(t.value) ? 'checked' : ''}" data-value="${esc(t.value)}">
      <input type="checkbox" ${selectedPCategory.has(t.value) ? 'checked' : ''} /><span>${esc(t.label)}</span>
    </label>`).join('');
}

// ─── EVENTS ──────────────────────────────────────────────
async function loadEvents() {
  const { data, error } = await db.from('events').select('*').order('id', { ascending: false });
  if (error) return showMsg(error.message, true);
  EVENTS = data || [];
  renderEventList();
}

function renderEventList() {
  const box = $('adminList');
  $('adminCount').textContent = EVENTS.length;
  for (const id of [...selected]) if (!EVENTS.find((e) => e.id === id)) selected.delete(id);
  if (!EVENTS.length) { box.innerHTML = '<div class="admin-row-empty">등록된 이벤트가 없습니다.</div>'; updateBulkUI(); return; }
  box.innerHTML = EVENTS.map((e) => {
    const thumb = e.thumbnail ? `<img src="${esc(e.thumbnail)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🏷️'}))">` : '🏷️';
    const period = [e.start_date, e.end_date].filter(Boolean).join(' ~ ') || '상시';
    return `<div class="admin-row ${e.id === editingId ? 'active' : ''}" data-id="${e.id}">
      <input type="checkbox" class="admin-row-check" data-id="${e.id}" ${selected.has(e.id) ? 'checked' : ''} />
      <div class="admin-row-thumb">${thumb}</div>
      <div class="admin-row-body">
        <div class="admin-row-name">${esc(e.name)}</div>
        <div class="admin-row-meta">${esc(e.brand_label || e.brand)} · ${esc(period)}</div>
      </div>
    </div>`;
  }).join('');
  updateBulkUI();
}

function updateBulkUI() {
  $('bulkSelected').textContent = `${selected.size}개 선택`;
  $('bulkDelete').disabled = selected.size === 0;
  const all = $('bulkCheckAll');
  all.checked = EVENTS.length > 0 && selected.size === EVENTS.length;
  all.indeterminate = selected.size > 0 && selected.size < EVENTS.length;
}

async function bulkDelete() {
  if (!selected.size || !confirm(`${selected.size}개 이벤트를 정말 삭제하시겠습니까?`)) return;
  const ids = [...selected];
  $('bulkDelete').disabled = true; $('bulkDelete').textContent = '삭제 중...';
  const { error } = await db.from('events').delete().in('id', ids);
  $('bulkDelete').textContent = '선택 삭제';
  if (error) { $('bulkDelete').disabled = false; return showMsg(error.message, true); }
  if (ids.includes(editingId)) fillEventForm(null);
  selected.clear();
  showMsg(`${ids.length}개 삭제되었습니다.`);
  await loadEvents();
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
  renderTypeChips();
  linkedProducts.clear();
  (e?.product_ids || []).forEach((id) => linkedProducts.add(id));
  renderProdPicker('');
  $('prodSearch').value = '';
  $('adminFormTitle').textContent = e ? `이벤트 #${e.id} 수정` : '새 이벤트 등록';
  $('adminDelete').classList.toggle('hidden', !e);
  renderEventList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProdPicker(q) {
  const box = $('prodPicker');
  const filtered = PRODUCTS.filter((p) =>
    !q || (p.name + ' ' + p.brand).toLowerCase().includes(q.toLowerCase())
  );
  $('linkedCount').textContent = linkedProducts.size ? `(${linkedProducts.size}개 연결됨)` : '';
  if (!filtered.length) { box.innerHTML = '<div class="admin-picker-empty">검색 결과가 없습니다.</div>'; return; }
  box.innerHTML = filtered.map((p) => {
    const thumb = p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="" onerror="this.style.display='none'">` : (p.emoji || '💊');
    const disc = p.original_price > p.sale_price ? Math.round((1 - p.sale_price / p.original_price) * 100) : 0;
    return `<label class="admin-picker-row">
      <input type="checkbox" data-pid="${p.id}" ${linkedProducts.has(p.id) ? 'checked' : ''} />
      <div class="admin-picker-thumb">${thumb}</div>
      <div>
        <div class="admin-picker-name">${esc(p.name)}</div>
        <div class="admin-picker-meta">${esc(p.store || p.brand)}${disc > 0 ? ` · -${disc}%` : ''} · ${fmtPrice(p.sale_price)}</div>
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
  if (!payload.brand || !payload.brand_label || !payload.name) return showMsg('브랜드/이름은 필수입니다.', true);
  $('adminSave').disabled = true; $('adminSave').textContent = '저장 중...';
  const id = $('fId').value;
  const { error } = await (id ? db.from('events').update(payload).eq('id', +id) : db.from('events').insert(payload));
  $('adminSave').disabled = false; $('adminSave').textContent = '저장';
  if (error) return showMsg(error.message, true);
  showMsg(id ? '수정되었습니다.' : '등록되었습니다.');
  fillEventForm(null);
  await loadEvents();
}

async function deleteEvent() {
  const id = +$('fId').value;
  if (!id || !confirm('정말 삭제하시겠습니까?')) return;
  const { error } = await db.from('events').delete().eq('id', id);
  if (error) return showMsg(error.message, true);
  showMsg('삭제되었습니다.');
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
  const filtered = PRODUCTS.filter((p) =>
    !q || (p.name + ' ' + p.brand).toLowerCase().includes(q.toLowerCase())
  );
  $('prodCount').textContent = PRODUCTS.length;
  for (const id of [...prodSelected]) if (!PRODUCTS.find((p) => p.id === id)) prodSelected.delete(id);
  if (!filtered.length) { box.innerHTML = '<div class="admin-row-empty">상품이 없습니다.</div>'; updateProdBulkUI(); return; }
  box.innerHTML = filtered.map((p) => {
    const thumb = p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="" onerror="this.style.display='none'">` : (p.emoji || '💊');
    const disc = p.original_price > p.sale_price ? Math.round((1 - p.sale_price / p.original_price) * 100) : 0;
    return `<div class="admin-row ${p.id === prodEditingId ? 'active' : ''}" data-id="${p.id}">
      <input type="checkbox" class="prod-row-check" data-id="${p.id}" ${prodSelected.has(p.id) ? 'checked' : ''} />
      <div class="admin-row-thumb">${thumb}</div>
      <div class="admin-row-body">
        <div class="admin-row-name">${esc(p.name)}</div>
        <div class="admin-row-meta">${esc(p.brand)}${disc > 0 ? ` · -${disc}%` : ''} · ${fmtPrice(p.sale_price)}</div>
      </div>
    </div>`;
  }).join('');
  updateProdBulkUI();
}

function updateProdBulkUI() {
  $('prodBulkSelected').textContent = `${prodSelected.size}개 선택`;
  $('prodBulkDelete').disabled = prodSelected.size === 0;
  const all = $('prodBulkAll');
  all.checked = PRODUCTS.length > 0 && prodSelected.size === PRODUCTS.length;
  all.indeterminate = prodSelected.size > 0 && prodSelected.size < PRODUCTS.length;
}

async function prodBulkDelete() {
  if (!prodSelected.size || !confirm(`${prodSelected.size}개 상품을 정말 삭제하시겠습니까?`)) return;
  const ids = [...prodSelected];
  $('prodBulkDelete').disabled = true; $('prodBulkDelete').textContent = '삭제 중...';
  const { error } = await db.from('products').delete().in('id', ids);
  $('prodBulkDelete').textContent = '선택 삭제';
  if (error) { $('prodBulkDelete').disabled = false; return showMsg(error.message, true); }
  if (ids.includes(prodEditingId)) fillProdForm(null);
  prodSelected.clear();
  showMsg(`${ids.length}개 삭제되었습니다.`);
  await loadProducts();
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
  selectedPCategory.clear();
  if (p?.category) selectedPCategory.add(p.category);
  renderPCategoryChips();
  $('prodFormTitle').textContent = p ? `상품 #${p.id} 수정` : '새 상품 등록';
  $('prodDelete').classList.toggle('hidden', !p);
  renderProdList($('prodListSearch').value);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveProd(ev) {
  ev.preventDefault();
  const name = $('pName').value.trim(), brand = $('pBrand').value;
  if (!name || !brand) return showProdMsg('상품명과 브랜드는 필수입니다.', true);
  const payload = {
    name, brand, store: $('pStore').value.trim() || brand,
    emoji: $('pEmoji').value.trim() || '💊',
    category: [...selectedPCategory][0] || '보충제',
    thumbnail: $('pThumbnail').value.trim() || null,
    original_price: +$('pOrigPrice').value || 0,
    sale_price: +$('pSalePrice').value || 0,
    link: $('pLink').value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  $('prodSave').disabled = true; $('prodSave').textContent = '저장 중...';
  const id = $('pId').value;
  const { error } = await (id ? db.from('products').update(payload).eq('id', +id) : db.from('products').insert(payload));
  $('prodSave').disabled = false; $('prodSave').textContent = '저장';
  if (error) return showProdMsg(error.message, true);
  showProdMsg(id ? '수정되었습니다.' : '등록되었습니다.');
  fillProdForm(null);
  await loadProducts();
}

async function deleteProd() {
  const id = +$('pId').value;
  if (!id || !confirm('정말 삭제하시겠습니까?')) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) return showProdMsg(error.message, true);
  showProdMsg('삭제되었습니다.');
  fillProdForm(null);
  await loadProducts();
}

// ─── OPTION MODAL ─────────────────────────────────────────
function openOptionModal(kind) {
  optionModalKind = kind;
  $('optionModalTitle').textContent = kind === 'brand' ? '새 브랜드 추가' : '새 상품유형 추가';
  $('optKey').value = ''; $('optLabel').value = '';
  $('optionMsg').classList.add('hidden');
  $('optionModal').classList.remove('hidden');
  setTimeout(() => $('optKey').focus(), 50);
}
function closeOptionModal() { $('optionModal').classList.add('hidden'); optionModalKind = null; }

async function saveOption() {
  const key = $('optKey').value.trim(), label = $('optLabel').value.trim();
  const setErr = (t) => { $('optionMsg').textContent = t; $('optionMsg').classList.remove('hidden', 'error'); $('optionMsg').classList.add('error'); };
  if (!key || !label) return setErr('키와 표시명을 모두 입력해 주세요.');
  if (!/^[a-z0-9_-]+$/i.test(key)) return setErr('키는 영문/숫자/-/_ 만 가능합니다.');
  if ((optionModalKind === 'brand' ? BRANDS : TYPES).find((r) => r.value === key)) return setErr('이미 존재하는 키입니다.');
  $('optionSave').disabled = true; $('optionSave').textContent = '추가 중...';
  const { error } = await db.from('filter_options').insert({ type: optionModalKind === 'brand' ? 'brand' : 'category', value: key, label, sort_order: 999 });
  $('optionSave').disabled = false; $('optionSave').textContent = '추가';
  if (error) return setErr(error.message);
  await loadOptions();
  if (optionModalKind === 'brand') { $('fBrand').value = key; syncBrandLabel(); }
  else { selectedTypes.add(key); renderTypeChips(); }
  closeOptionModal();
  showMsg('추가되었습니다.');
}

// ─── UTILS ────────────────────────────────────────────────
function showMsg(text, isError = false) {
  const el = $('adminMsg');
  el.textContent = text; el.classList.toggle('error', isError); el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}
function showProdMsg(text, isError = false) {
  const el = $('prodMsg');
  el.textContent = text; el.classList.toggle('error', isError); el.classList.remove('hidden');
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

// ─── INIT ─────────────────────────────────────────────────
async function init() {
  const { data } = await db.auth.getSession();
  if (!data.session) { renderGate(); return; }

  $('adminLogin').textContent = data.session.user.email || '로그인됨';
  $('adminLogin').addEventListener('click', async () => { await db.auth.signOut(); location.href = 'index.html'; });

  // Admin tab switching
  document.querySelectorAll('.admin-tab').forEach((b) => b.addEventListener('click', () => switchAdminTab(b.dataset.tab)));

  // Event form
  $('adminForm').addEventListener('submit', saveEvent);
  $('adminReset').addEventListener('click', () => fillEventForm(null));
  $('adminDelete').addEventListener('click', deleteEvent);
  $('fBrand').addEventListener('change', syncBrandLabel);

  $('fProductTypes').addEventListener('click', (e) => {
    const item = e.target.closest('.admin-chip-item');
    if (!item) return;
    e.preventDefault();
    const v = item.dataset.value;
    if (selectedTypes.has(v)) selectedTypes.delete(v); else selectedTypes.add(v);
    item.querySelector('input').checked = selectedTypes.has(v);
    item.classList.toggle('checked', selectedTypes.has(v));
  });

  // Product picker (linked products in event form)
  $('prodSearch').addEventListener('input', (e) => renderProdPicker(e.target.value));
  $('prodPicker').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-pid]');
    if (!cb) return;
    const id = +cb.dataset.pid;
    if (cb.checked) linkedProducts.add(id); else linkedProducts.delete(id);
    $('linkedCount').textContent = linkedProducts.size ? `(${linkedProducts.size}개 연결됨)` : '';
  });

  // Event list
  $('adminList').addEventListener('click', (e) => {
    const cb = e.target.closest('.admin-row-check');
    if (cb) { e.stopPropagation(); const id = +cb.dataset.id; if (cb.checked) selected.add(id); else selected.delete(id); updateBulkUI(); return; }
    const row = e.target.closest('.admin-row');
    if (row) { const found = EVENTS.find((x) => x.id === +row.dataset.id); if (found) fillEventForm(found); }
  });
  $('bulkCheckAll').addEventListener('change', (e) => { selected.clear(); if (e.target.checked) EVENTS.forEach((ev) => selected.add(ev.id)); renderEventList(); });
  $('bulkDelete').addEventListener('click', bulkDelete);

  // Brand/type option modals
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

  $('pCategory').addEventListener('click', (e) => {
    const item = e.target.closest('.admin-chip-item');
    if (!item) return;
    e.preventDefault();
    selectedPCategory.clear();
    selectedPCategory.add(item.dataset.value);
    renderPCategoryChips();
  });

  // Product list
  $('prodListSearch').addEventListener('input', (e) => renderProdList(e.target.value));
  $('prodList').addEventListener('click', (e) => {
    const cb = e.target.closest('.prod-row-check');
    if (cb) { e.stopPropagation(); const id = +cb.dataset.id; if (cb.checked) prodSelected.add(id); else prodSelected.delete(id); updateProdBulkUI(); return; }
    const row = e.target.closest('.admin-row');
    if (row) { const found = PRODUCTS.find((x) => x.id === +row.dataset.id); if (found) fillProdForm(found); }
  });
  $('prodBulkAll').addEventListener('change', (e) => { prodSelected.clear(); if (e.target.checked) PRODUCTS.forEach((p) => prodSelected.add(p.id)); renderProdList($('prodListSearch').value); });
  $('prodBulkDelete').addEventListener('click', prodBulkDelete);

  await Promise.all([loadOptions(), loadEvents(), loadProducts()]);
}

document.addEventListener('DOMContentLoaded', init);
