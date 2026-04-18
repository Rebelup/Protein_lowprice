'use strict';

const SUPABASE_URL      = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let EVENTS = [], PRODUCTS = [], ALL_BRANDS = [], ALL_TYPES = [];
let currentUser = null, pendingLink = null;
let brandGroup = null, typeGroup = null, prodBrandGroup = null;

const state = { search: '', sort: 'discount_desc', brands: new Set(), productTypes: new Set(), period: 'all' };
const prodState = { sort: 'discount_desc', category: '', brands: new Set(), priceRange: 'all', discountMin: 0 };

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
const safeUrl = (u) => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? u : '#'; } catch { return '#'; } };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysUntil = (d) => { if (!d) return Infinity; const t = new Date(); t.setHours(0, 0, 0, 0); return Math.ceil((new Date(d) - t) / 86400000); };
const fmtDate = (d) => d ? d.replaceAll('-', '.') : '';

const STATUS_LABEL = { ongoing: '진행중', ending: '종료임박', upcoming: '예정', ended: '종료' };
function eventStatus(e) {
  const t = todayISO();
  if (e.startDate && e.startDate > t) return 'upcoming';
  if ((e.endDate && e.endDate < t) || !e.active) return 'ended';
  const left = daysUntil(e.endDate);
  return (left <= 7 && left >= 0) ? 'ending' : 'ongoing';
}
function dDayText(e, long = false) {
  const st = eventStatus(e);
  if (st !== 'ongoing' && st !== 'ending') return '';
  const left = daysUntil(e.endDate);
  if (!isFinite(left) || left < 0) return '';
  return long ? (left === 0 ? '오늘 종료' : `${left}일 남음`) : (left === 0 ? 'D-DAY' : `D-${left}`);
}

/* ── DATA ── */
async function loadProducts() {
  const { data } = await db.from('products').select('*').order('id');
  PRODUCTS = (data || []).map((p) => ({
    id: p.id, name: p.name, brand: p.brand, store: p.store || p.brand,
    category: p.category, emoji: p.emoji || '💊',
    thumbnail: p.thumbnail || '',
    originalPrice: p.original_price || 0, salePrice: p.sale_price || 0,
    link: p.link || '#',
  }));
}

async function loadEvents() {
  const { data, error } = await db.from('events').select('*').order('id');
  if (error) throw new Error(error.message);
  EVENTS = (data || []).map((e) => ({
    id: e.id, brand: e.brand, brandLabel: e.brand_label, name: e.name,
    desc: e.description || '', discountPct: e.discount_pct,
    color: e.color || '#0077CC', active: e.active,
    startDate: e.start_date || '', endDate: e.end_date || '', link: e.link || '',
    conditions: e.conditions || [], howTo: e.how_to || [],
    couponNote: e.coupon_note || '', couponCode: e.coupon_code || '',
    productTypes: e.product_types || [],
    thumbnail: e.thumbnail || '',
  }));
}

async function loadFilterOptions() {
  const { data } = await db.from('filter_options').select('*').order('sort_order');
  if (!data) return;
  const map = (t) => data.filter((r) => r.type === t).map((r) => ({ value: r.value, label: r.label }));
  ALL_BRANDS = map('brand');
  ALL_TYPES = map('category');
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
    if (state.sort === 'end_asc') return (a.endDate || '9999-12-31').localeCompare(b.endDate || '9999-12-31');
    if (state.sort === 'name') return a.name.localeCompare(b.name, 'ko');
    return 0;
  });
}

/* ── PRODUCTS ── */
const fmtPrice = (n) => n ? '₩' + n.toLocaleString('ko-KR') : '';

function renderProductCard(p) {
  const disc = p.originalPrice > p.salePrice ? Math.round((1 - p.salePrice / p.originalPrice) * 100) : 0;
  const thumb = p.thumbnail
    ? `<img src="${esc(safeUrl(p.thumbnail))}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : p.emoji;
  return `<a class="prod-card" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener noreferrer">
    <div class="prod-card-thumb">${thumb}</div>
    <div class="prod-card-body">
      <div class="prod-card-name">${esc(p.name)}</div>
      <div class="prod-card-brand">${esc(p.store)}</div>
      <div class="prod-card-price">
        ${disc > 0 ? `<span class="prod-pct">-${disc}%</span>` : ''}
        <span class="prod-sale">${fmtPrice(p.salePrice)}</span>
        ${disc > 0 ? `<span class="prod-orig">${fmtPrice(p.originalPrice)}</span>` : ''}
      </div>
    </div>
  </a>`;
}

function renderProdCategoryChips() {
  const row = $('prodCatRow');
  if (!row) return;
  row.innerHTML = `<button class="prod-cat-chip ${!prodState.category ? 'active' : ''}" data-cat="">전체</button>`
    + ALL_TYPES.map((t) => `<button class="prod-cat-chip ${prodState.category === t.value ? 'active' : ''}" data-cat="${esc(t.value)}">${esc(t.label)}</button>`).join('');
}

function renderProducts() {
  let items = PRODUCTS.filter((p) => {
    if (prodState.category && p.category !== prodState.category) return false;
    if (prodState.brands.size && !prodState.brands.has(p.brand)) return false;
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
      const da = a.originalPrice > a.salePrice ? 1 - a.salePrice / a.originalPrice : 0;
      const db2 = b.originalPrice > b.salePrice ? 1 - b.salePrice / b.originalPrice : 0;
      return db2 - da;
    }
    if (prodState.sort === 'price_asc') return a.salePrice - b.salePrice;
    if (prodState.sort === 'price_desc') return b.salePrice - a.salePrice;
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
  const period = (e.startDate || e.endDate)
    ? `${fmtDate(e.startDate) || '상시'} ~ ${fmtDate(e.endDate) || '상시'}`
    : '상시 진행';
  const dd = dDayText(e, true);
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
}

function showLoading(v) { $('loadingOverlay').classList.toggle('hidden', !v); }
function showDbError(msg) {
  $('eventsGrid').innerHTML = `<div class="db-error"><span class="db-error-icon">⚠️</span><p>데이터를 불러오지 못했습니다</p><small>${esc(msg)}</small></div>`;
  showLoading(false);
}

/* ── EVENT DETAIL PAGE ── */
function openEventPage(id) {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) return;
  renderEventPage(e);
  const page = $('eventPage');
  page.classList.remove('hidden');
  page.getBoundingClientRect();
  page.classList.add('page-open');
  document.body.style.overflow = 'hidden';
  history.pushState({ eventId: id }, '', `?event=${id}`);
}

function closeEventPage() {
  const page = $('eventPage');
  page.classList.remove('page-open');
  page.addEventListener('transitionend', () => {
    page.classList.add('hidden');
    $('eventPageBody').textContent = '';
    document.body.style.overflow = '';
  }, { once: true });
  if (history.state?.eventId) history.back();
}

function renderEventPage(e) {
  const st = eventStatus(e);
  const dd = dDayText(e, true);
  const safeLink = esc(safeUrl(e.link));
  const sect = (title, body) => `<div class="ep-section"><div class="ep-section-title">${title}</div>${body}</div>`;

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
      <div class="ep-hero-pct">-${e.discountPct}%</div>
      <div class="ep-hero-name">${esc(e.name)}</div>
      ${e.desc ? `<p class="ep-hero-desc">${esc(e.desc)}</p>` : ''}
      <div class="ep-hero-meta">
        <span class="ep-hero-status ep-hero-status--${st}">${STATUS_LABEL[st] || ''}</span>
        ${dd ? `<span class="ep-hero-dday">${dd}</span>` : ''}
      </div>
    </div>
    ${sect('📅 기간', `<div class="ep-info-box">${e.startDate ? fmtDate(e.startDate) : '상시'} ~ ${e.endDate ? fmtDate(e.endDate) : '상시'}</div>`)}
    ${typeChips}${conds}${howTo}${coupon}
    <div class="ep-cta-wrap"><a class="ep-cta" href="${safeLink}" target="_blank" rel="noopener noreferrer" id="epCtaBtn">이벤트 페이지로 이동 →</a></div>`;

  const copyBtn = $('eventPageBody').querySelector('.ep-coupon-copy');
  copyBtn?.addEventListener('click', () => {
    navigator.clipboard?.writeText(copyBtn.dataset.code).then(() => {
      copyBtn.textContent = '복사됨!';
      setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
    });
  });

  $('epCtaBtn')?.addEventListener('click', (ev) => {
    if (!currentUser) { ev.preventDefault(); pendingLink = ev.currentTarget.getAttribute('href'); openLoginSheet(); }
  });
}

/* ── SHEET HELPERS ── */
function openSheet(sheet, overlay) {
  sheet.classList.remove('hidden');
  sheet.getBoundingClientRect();
  sheet.classList.add('sheet-open');
  if (overlay) { overlay.classList.remove('hidden'); overlay.getBoundingClientRect(); }
}
function closeSheet(sheet, overlay) {
  sheet.classList.remove('sheet-open');
  sheet.addEventListener('transitionend', () => {
    sheet.classList.add('hidden');
    overlay?.classList.add('hidden');
  }, { once: true });
}
function dragToClose(sheet, closeFn) {
  let startY = 0, dy = 0, active = false;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0) return;
    startY = e.touches[0].clientY; dy = 0; active = true;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!active) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = `translateX(-50%) translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 120) closeFn();
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
  btn.textContent = loading ? '처리 중...' : (id === 'loginSubmit' ? '로그인' : '가입하기');
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

  const doSearch = () => { state.search = searchInput.value.trim(); render(); };
  searchInput.addEventListener('input', debounce(doSearch, 250));
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('searchBtn').addEventListener('click', doSearch);

  $('eventsGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.evt-card');
    if (card) openEventPage(parseInt(card.dataset.eid));
  });

  overlay.addEventListener('click', () => {
    [sortSheet, filterSheet, $('userSheet')]
      .filter((s) => !s.classList.contains('hidden'))
      .forEach((s) => closeSheet(s, overlay));
  });

  $$('.tab-btn').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('prodCatRow').addEventListener('click', (e) => {
    const chip = e.target.closest('.prod-cat-chip');
    if (!chip) return;
    prodState.category = chip.dataset.cat;
    $$('.prod-cat-chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === prodState.category));
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

  dragToClose(prodFilterSheet, () => closeSheet(prodFilterSheet, overlay));

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
  window.addEventListener('popstate', () => {
    const page = $('eventPage');
    if (page.classList.contains('hidden')) return;
    page.classList.remove('page-open');
    page.addEventListener('transitionend', () => {
      page.classList.add('hidden');
      $('eventPageBody').textContent = '';
      document.body.style.overflow = '';
    }, { once: true });
  });

  dragToClose(sortSheet, () => closeSheet(sortSheet, overlay));
  dragToClose(filterSheet, () => closeSheet(filterSheet, overlay));
  dragToClose($('userSheet'), closeUserSheet);
  dragToClose($('loginSheet'), closeLoginSheet);

  $('authBtn').addEventListener('click', openLoginSheet);
  $('userBtn').addEventListener('click', openUserSheet);
  $('userSheetClose').addEventListener('click', closeUserSheet);
  $('userLogoutBtn').addEventListener('click', () => { closeUserSheet(); db.auth.signOut(); });
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
  });
  try {
    await Promise.all([loadEvents(), loadFilterOptions(), loadProducts()]);
    buildDynamicFilters();
    initListeners();
    renderProdCategoryChips();
    render();
    renderProducts();
    showLoading(false);
  } catch (err) { showDbError(err.message); }
});
