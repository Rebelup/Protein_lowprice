'use strict';

const SUPABASE_URL = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const linesToArr = (s) => String(s ?? '').split('\n').map(v => v.trim()).filter(Boolean);
const arrToLines = (a) => (a || []).join('\n');
const csvToArr = (s) => String(s ?? '').split(',').map(v => v.trim()).filter(Boolean);

let EVENTS = [];
let editingId = null;
const selected = new Set();

const FIELDS = [
  ['fBrand', 'brand'], ['fBrandLabel', 'brand_label'],
  ['fName', 'name'], ['fThumbnail', 'thumbnail'],
  ['fDescription', 'description'], ['fDiscount', 'discount_pct'],
  ['fStart', 'start_date'], ['fEnd', 'end_date'],
  ['fLink', 'link'], ['fCouponCode', 'coupon_code'], ['fCouponNote', 'coupon_note'],
];

async function loadEvents() {
  const { data, error } = await db.from('events').select('*').order('id', { ascending: false });
  if (error) return showMsg(error.message, true);
  EVENTS = data || [];
  renderList();
}

function renderList() {
  const box = $('adminList');
  $('adminCount').textContent = EVENTS.length;
  for (const id of [...selected]) if (!EVENTS.find((e) => e.id === id)) selected.delete(id);
  if (!EVENTS.length) {
    box.innerHTML = '<div class="admin-row-empty">등록된 이벤트가 없습니다.</div>';
    updateBulkUI();
    return;
  }
  box.innerHTML = EVENTS.map((e) => {
    const thumb = e.thumbnail
      ? `<img src="${esc(e.thumbnail)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🏷️'}))">`
      : '🏷️';
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
  if (!selected.size) return;
  if (!confirm(`${selected.size}개 이벤트를 정말 삭제하시겠습니까?`)) return;
  const ids = [...selected];
  const btn = $('bulkDelete');
  btn.disabled = true; btn.textContent = '삭제 중...';
  const { error } = await db.from('events').delete().in('id', ids);
  btn.textContent = '선택 삭제';
  if (error) { btn.disabled = false; return showMsg(error.message, true); }
  if (ids.includes(editingId)) fillForm(null);
  selected.clear();
  showMsg(`${ids.length}개 삭제되었습니다.`);
  await loadEvents();
}

function fillForm(e) {
  editingId = e?.id ?? null;
  $('fId').value = e?.id ?? '';
  FIELDS.forEach(([id, key]) => { $(id).value = e?.[key] ?? (id === 'fDiscount' ? 0 : ''); });
  $('fActive').value = e?.active === false ? 'false' : 'true';
  $('fConditions').value = arrToLines(e?.conditions);
  $('fHowTo').value = arrToLines(e?.how_to);
  $('fProductTypes').value = (e?.product_types || []).join(', ');
  $('adminFormTitle').textContent = e ? `이벤트 #${e.id} 수정` : '새 이벤트 등록';
  $('adminDelete').classList.toggle('hidden', !e);
  renderList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function collectForm() {
  const payload = {};
  FIELDS.forEach(([id, key]) => {
    const v = $(id).value.trim();
    payload[key] = v === '' ? null : (key === 'discount_pct' ? +v : v);
  });
  payload.active = $('fActive').value === 'true';
  payload.conditions = linesToArr($('fConditions').value);
  payload.how_to = linesToArr($('fHowTo').value);
  payload.product_types = csvToArr($('fProductTypes').value);
  return payload;
}

function showMsg(text, isError = false) {
  const el = $('adminMsg');
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

async function saveEvent(ev) {
  ev.preventDefault();
  const payload = collectForm();
  if (!payload.brand || !payload.brand_label || !payload.name) {
    return showMsg('브랜드 키/표시명/이름은 필수입니다.', true);
  }
  const btn = $('adminSave');
  btn.disabled = true; btn.textContent = '저장 중...';
  const id = $('fId').value;
  const q = id
    ? db.from('events').update(payload).eq('id', +id)
    : db.from('events').insert(payload);
  const { error } = await q;
  btn.disabled = false; btn.textContent = '저장';
  if (error) return showMsg(error.message, true);
  showMsg(id ? '수정되었습니다.' : '등록되었습니다.');
  fillForm(null);
  await loadEvents();
}

async function deleteEvent() {
  const id = +$('fId').value;
  if (!id || !confirm('정말 삭제하시겠습니까?')) return;
  const { error } = await db.from('events').delete().eq('id', id);
  if (error) return showMsg(error.message, true);
  showMsg('삭제되었습니다.');
  fillForm(null);
  await loadEvents();
}

function renderGate() {
  document.querySelector('main').innerHTML = `
    <div class="admin-gate">
      <h2>🔒 로그인이 필요합니다</h2>
      <p>이벤트 관리는 로그인한 사용자만 접근할 수 있습니다.</p>
      <button class="admin-primary" id="gateLogin">로그인 페이지로</button>
    </div>`;
  $('gateLogin').addEventListener('click', () => location.href = 'index.html');
}

async function init() {
  const { data } = await db.auth.getSession();
  if (!data.session) { renderGate(); return; }

  $('adminLogin').textContent = data.session.user.email || '로그인됨';
  $('adminLogin').addEventListener('click', async () => {
    await db.auth.signOut();
    location.href = 'index.html';
  });

  $('adminForm').addEventListener('submit', saveEvent);
  $('adminReset').addEventListener('click', () => fillForm(null));
  $('adminDelete').addEventListener('click', deleteEvent);
  $('adminList').addEventListener('click', (e) => {
    const cb = e.target.closest('.admin-row-check');
    if (cb) {
      e.stopPropagation();
      const id = +cb.dataset.id;
      if (cb.checked) selected.add(id); else selected.delete(id);
      updateBulkUI();
      return;
    }
    const row = e.target.closest('.admin-row');
    if (!row) return;
    const found = EVENTS.find((x) => x.id === +row.dataset.id);
    if (found) fillForm(found);
  });

  $('bulkCheckAll').addEventListener('change', (e) => {
    selected.clear();
    if (e.target.checked) EVENTS.forEach((ev) => selected.add(ev.id));
    renderList();
  });

  $('bulkDelete').addEventListener('click', bulkDelete);

  await loadEvents();
}

document.addEventListener('DOMContentLoaded', init);
