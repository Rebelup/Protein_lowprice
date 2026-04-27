/* v2.0.0 - 2026-04-17
   프로틴 이벤트 모음 | 이벤트 전용 홈
   - 1열 이벤트 카드 + 풀스크린 상세 페이지
   - 필터: 브랜드 / 상품유형 / 기간
   - 보안: XSS 방지, noopener/noreferrer
*/
'use strict';

/* ============================================================
   SUPABASE
   ============================================================ */
const SUPABASE_URL      = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   DATA
   ============================================================ */
let EVENTS            = [];
let ALL_BRANDS        = [];   // [{value, label}]
let ALL_PRODUCT_TYPES = [];   // [{value, label}]
let currentUser       = null;
let pendingEventLink  = null;

async function loadEvents() {
  const { data, error } = await db.from('events').select('*').order('id');
  if (error) throw new Error(error.message);
  EVENTS = (data || []).map(e => ({
    id:           e.id,
    brand:        e.brand,
    brandLabel:   e.brand_label,
    name:         e.name,
    desc:         e.description || '',
    discountPct:  e.discount_pct,
    color:        e.color || '#0077CC',
    active:       e.active,
    startDate:    e.start_date || '',
    endDate:      e.end_date   || '',
    link:         e.link       || '',
    conditions:   e.conditions || [],
    howTo:        e.how_to     || [],
    couponNote:   e.coupon_note || '',
    couponCode:   e.coupon_code || '',
    productTypes: e.product_types || [],
  }));
}

async function loadFilterOptions() {
  const { data } = await db.from('filter_options').select('*').order('sort_order');
  if (!data) return;
  ALL_BRANDS        = data.filter(r => r.type === 'brand')   .map(r => ({ value: r.value, label: r.label }));
  ALL_PRODUCT_TYPES = data.filter(r => r.type === 'category').map(r => ({ value: r.value, label: r.label }));
}

/* ============================================================
   HELPERS
   ============================================================ */
function el(id) { return document.getElementById(id); }

const _escMap = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
function escHtml(s) { return String(s).replace(/[&<>"']/g, c => _escMap[c]); }
function safeUrl(u) {
  try {
    const p = new URL(u);
    return (p.protocol === 'https:' || p.protocol === 'http:') ? u : '#';
  } catch { return '#'; }
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - t) / 86400000);
}
function fmtDate(d) { return d ? d.replaceAll('-', '.') : ''; }

function eventStatus(e) {
  const today = todayISO();
  if (e.startDate && e.startDate > today) return 'upcoming';
  if (e.endDate   && e.endDate   < today) return 'ended';
  if (!e.active) return 'ended';
  const left = daysUntil(e.endDate);
  if (left <= 7 && left >= 0) return 'ending';
  return 'ongoing';
}
function statusLabel(s) {
  return { ongoing:'진행중', ending:'종료임박', upcoming:'예정', ended:'종료' }[s] || '';
}

/* ============================================================
   STATE
   ============================================================ */
let state = {
  search:       '',
  sort:         'discount_desc',
  brands:       new Set(),
  productTypes: new Set(),
  period:       'all',
};

/* ============================================================
   LOADING
   ============================================================ */
function showLoading(v) { el('loadingOverlay').classList.toggle('hidden', !v); }

function showDbError(msg) {
  const grid = el('eventsGrid');
  grid.innerHTML = `
    <div class="db-error">
      <span class="db-error-icon">⚠️</span>
      <p>데이터를 불러오지 못했습니다</p>
      <small>${escHtml(msg)}</small>
    </div>`;
  showLoading(false);
}

/* ============================================================
   FILTER + SORT
   ============================================================ */
function getFiltered() {
  const q = state.search.toLowerCase();
  return EVENTS
    .filter(e => {
      if (q) {
        const hay = (e.name + ' ' + e.brandLabel + ' ' + e.desc).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!state.brands.has(e.brand)) return false;

      // 상품유형: 이벤트 product_types 배열이 비어있으면 모든 유형에 적용 → 항상 통과
      if (e.productTypes?.length) {
        const matched = e.productTypes.some(t => state.productTypes.has(t));
        if (!matched) return false;
      }

      if (state.period !== 'all') {
        if (eventStatus(e) !== state.period) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const stA = eventStatus(a);
      const stB = eventStatus(b);
      if (stA === 'ended' && stB !== 'ended') return 1;
      if (stB === 'ended' && stA !== 'ended') return -1;
      if (state.sort === 'discount_desc') return (b.discountPct || 0) - (a.discountPct || 0);
      if (state.sort === 'end_asc') {
        const ea = a.endDate || '9999-12-31';
        const eb = b.endDate || '9999-12-31';
        return ea.localeCompare(eb);
      }
      if (state.sort === 'name') return a.name.localeCompare(b.name, 'ko');
      return 0;
    });
}

/* ============================================================
   RENDER — 이벤트 카드 (1열 그리드)
   ============================================================ */
function renderEventCard(e) {
  const st     = eventStatus(e);
  const stLbl  = statusLabel(st);
  const period = (e.startDate || e.endDate)
    ? `${fmtDate(e.startDate) || '상시'} ~ ${fmtDate(e.endDate) || '상시'}`
    : '상시 진행';
  const left   = daysUntil(e.endDate);
  const dDay   = (st === 'ongoing' || st === 'ending') && isFinite(left) && left >= 0
    ? (left === 0 ? 'D-DAY' : `D-${left}`) : '';

  return `
    <article class="evt-card evt-card--${st}" data-eid="${e.id}">
      <div class="evt-card-top" style="background:${e.color}">
        <span class="evt-card-brand">${escHtml(e.brandLabel)}</span>
        <span class="evt-card-status evt-card-status--${st}">${stLbl}</span>
      </div>
      <div class="evt-card-body">
        <div class="evt-card-head">
          <span class="evt-card-pct" style="color:${e.color}">-${e.discountPct}%</span>
          <span class="evt-card-name">${escHtml(e.name)}</span>
        </div>
        ${e.desc ? `<p class="evt-card-desc">${escHtml(e.desc)}</p>` : ''}
        <div class="evt-card-foot">
          <span class="evt-card-period">📅 ${period}</span>
          <div class="evt-card-foot-right">
            <span class="evt-card-brand-tag" style="color:${e.color};background:${e.color}1A">${escHtml(e.brandLabel)}</span>
            ${dDay ? `<span class="evt-card-dday">${dDay}</span>` : ''}
          </div>
        </div>
      </div>
    </article>`;
}

function render() {
  const items = getFiltered();
  const grid  = el('eventsGrid');
  const empty = el('emptyState');
  el('resultCount').textContent = items.length;
  if (!items.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    grid.innerHTML = items.map(renderEventCard).join('');
    empty.classList.add('hidden');
  }
}

/* ============================================================
   EVENT DETAIL PAGE
   ============================================================ */
function openEventPage(eventId) {
  const e = EVENTS.find(x => x.id === eventId);
  if (!e) return;
  renderEventPageContent(e);
  const page = el('eventPage');
  page.classList.remove('hidden');
  page.getBoundingClientRect();
  page.classList.add('page-open');
  document.body.style.overflow = 'hidden';
  history.pushState({ eventId }, '', `?event=${eventId}`);
}

function closeEventPage() {
  const page = el('eventPage');
  page.classList.remove('page-open');
  page.addEventListener('transitionend', () => {
    page.classList.add('hidden');
    el('eventPageBody').textContent = '';
    document.body.style.overflow = '';
  }, { once: true });
  if (history.state?.eventId) history.back();
}

function renderEventPageContent(e) {
  const st       = eventStatus(e);
  const stLbl    = statusLabel(st);
  const safeLink = escHtml(safeUrl(e.link));
  const left     = daysUntil(e.endDate);
  const dDay     = (st === 'ongoing' || st === 'ending') && isFinite(left) && left >= 0
    ? (left === 0 ? '오늘 종료' : `${left}일 남음`) : '';

  el('eventPageBody').innerHTML = `
    <div class="ep-hero" style="background:linear-gradient(135deg, ${e.color}, ${e.color}dd)">
      <div class="ep-hero-brand">${escHtml(e.brandLabel)}</div>
      <div class="ep-hero-pct">-${e.discountPct}%</div>
      <div class="ep-hero-name">${escHtml(e.name)}</div>
      ${e.desc ? `<p class="ep-hero-desc">${escHtml(e.desc)}</p>` : ''}
      <div class="ep-hero-meta">
        <span class="ep-hero-status ep-hero-status--${st}">${stLbl}</span>
        ${dDay ? `<span class="ep-hero-dday">${dDay}</span>` : ''}
      </div>
    </div>

    <div class="ep-section">
      <div class="ep-section-title">📅 기간</div>
      <div class="ep-info-box">
        ${e.startDate ? fmtDate(e.startDate) : '상시'} ~ ${e.endDate ? fmtDate(e.endDate) : '상시'}
      </div>
    </div>

    ${e.productTypes?.length ? `
    <div class="ep-section">
      <div class="ep-section-title">🏷️ 적용 상품 유형</div>
      <div class="ep-chips">
        ${e.productTypes.map(t => {
          const label = ALL_PRODUCT_TYPES.find(pt => pt.value === t)?.label || t;
          return `<span class="ep-chip">${escHtml(label)}</span>`;
        }).join('')}
      </div>
    </div>` : ''}

    ${(e.conditions || []).length ? `
    <div class="ep-section">
      <div class="ep-section-title">💡 이벤트 조건</div>
      <ul class="ep-list">
        ${e.conditions.map(c => `<li>${escHtml(c)}</li>`).join('')}
      </ul>
    </div>` : ''}

    ${(e.howTo || []).length ? `
    <div class="ep-section">
      <div class="ep-section-title">📋 참여 방법</div>
      <ol class="ep-steps">
        ${e.howTo.map((s, i) => `
          <li class="ep-step">
            <span class="ep-step-num" style="background:${e.color}">${i + 1}</span>
            <span class="ep-step-text">${escHtml(s)}</span>
          </li>`).join('')}
      </ol>
    </div>` : ''}

    ${e.couponCode ? `
    <div class="ep-section">
      <div class="ep-section-title">🎟️ 쿠폰 코드</div>
      <div class="ep-coupon">
        <code id="epCouponCode">${escHtml(e.couponCode)}</code>
        <button class="ep-coupon-copy" data-code="${escHtml(e.couponCode)}">복사</button>
      </div>
      ${e.couponNote ? `<p class="ep-coupon-note">${escHtml(e.couponNote)}</p>` : ''}
    </div>` : (e.couponNote ? `
    <div class="ep-section">
      <div class="ep-section-title">📌 안내</div>
      <p class="ep-coupon-note">${escHtml(e.couponNote)}</p>
    </div>` : '')}

    <div class="ep-cta-wrap">
      <a class="ep-cta" href="${safeLink}" target="_blank" rel="noopener noreferrer" id="epCtaBtn">
        이벤트 페이지로 이동 →
      </a>
    </div>`;

  const copyBtn = el('eventPageBody').querySelector('.ep-coupon-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(copyBtn.dataset.code).then(() => {
        copyBtn.textContent = '복사됨!';
        setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
      });
    });
  }

  const cta = el('epCtaBtn');
  if (cta) {
    cta.addEventListener('click', ev => {
      if (!currentUser) {
        ev.preventDefault();
        pendingEventLink = cta.getAttribute('href');
        openLoginSheet();
      }
    });
  }
}

/* ============================================================
   SHEET HELPERS
   ============================================================ */
function openSheet(sheetEl, overlayEl) {
  sheetEl.classList.remove('hidden');
  sheetEl.getBoundingClientRect();
  sheetEl.classList.add('sheet-open');
  if (overlayEl) {
    overlayEl.classList.remove('hidden');
    overlayEl.getBoundingClientRect();
  }
}

function closeSheet(sheetEl, overlayEl) {
  sheetEl.classList.remove('sheet-open');
  sheetEl.addEventListener('transitionend', () => {
    sheetEl.classList.add('hidden');
    if (overlayEl) overlayEl.classList.add('hidden');
  }, { once: true });
}

function setupDragToClose(sheetEl, closeFn) {
  let startY = 0, curDy = 0, active = false;
  sheetEl.addEventListener('touchstart', e => {
    if (sheetEl.scrollTop > 0) return;
    startY = e.touches[0].clientY; curDy = 0; active = true;
    sheetEl.style.transition = 'none';
  }, { passive: true });
  sheetEl.addEventListener('touchmove', e => {
    if (!active) return;
    curDy = Math.max(0, e.touches[0].clientY - startY);
    sheetEl.style.transform = `translateX(-50%) translateY(${curDy}px)`;
  }, { passive: true });
  sheetEl.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
    if (curDy > 120) closeFn();
    curDy = 0;
  });
}

/* ============================================================
   FILTER SHEET BUILDERS
   ============================================================ */
function buildCheckboxGroup(containerId, cbClass, items) {
  const group = el(containerId);
  group.textContent = '';

  const allLabel = document.createElement('label');
  allLabel.className = 'filter-sheet-item select-all-item checked';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox'; allCb.className = cbClass + '-all'; allCb.checked = true;
  const allSpan = document.createElement('span');
  allSpan.textContent = '전체 선택';
  allLabel.append(allCb, allSpan);
  group.appendChild(allLabel);

  items.forEach(item => {
    const label = document.createElement('label');
    label.className = 'filter-sheet-item checked';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = cbClass; cb.value = item.value; cb.checked = true;
    const span = document.createElement('span');
    span.textContent = item.label;
    label.append(cb, span);
    group.appendChild(label);
  });

  const cbs = group.querySelectorAll('.' + cbClass);

  allLabel.addEventListener('click', ev => {
    ev.preventDefault();
    const v = !allCb.checked;
    allCb.checked = v;
    allLabel.classList.toggle('checked', v);
    cbs.forEach(cb => {
      cb.checked = v;
      cb.closest('.filter-sheet-item').classList.toggle('checked', v);
    });
  });

  cbs.forEach(cb => {
    cb.closest('.filter-sheet-item').addEventListener('click', ev => {
      ev.preventDefault();
      cb.checked = !cb.checked;
      cb.closest('.filter-sheet-item').classList.toggle('checked', cb.checked);
      const all = [...cbs].every(c => c.checked);
      allCb.checked = all;
      allLabel.classList.toggle('checked', all);
    });
  });

  return { allCb, allLabel, cbs };
}

let brandGroup = null, typeGroup = null;

function buildDynamicFilters() {
  brandGroup = buildCheckboxGroup('brandFilterGroup', 'brand-cb', ALL_BRANDS);
  typeGroup  = buildCheckboxGroup('typeFilterGroup',  'type-cb',  ALL_PRODUCT_TYPES);
  state.brands       = new Set(ALL_BRANDS.map(b => b.value));
  state.productTypes = new Set(ALL_PRODUCT_TYPES.map(t => t.value));
}

function updateFilterCount() {
  const deselected = (ALL_BRANDS.length - state.brands.size)
                   + (ALL_PRODUCT_TYPES.length - state.productTypes.size)
                   + (state.period !== 'all' ? 1 : 0);
  const countEl   = el('filterCount');
  const filterBtn = el('filterBtn');
  if (deselected > 0) {
    countEl.textContent = deselected;
    countEl.classList.remove('hidden');
    filterBtn.style.color = 'var(--blue)';
  } else {
    countEl.classList.add('hidden');
    filterBtn.style.color = '';
  }
}

/* ============================================================
   AUTH
   ============================================================ */
function openLoginSheet() {
  el('loginForm').classList.remove('hidden');
  el('signupForm').classList.add('hidden');
  clearErrors();
  openSheet(el('loginSheet'), el('loginOverlay'));
}
function closeLoginSheet() {
  closeSheet(el('loginSheet'), el('loginOverlay'));
  pendingEventLink = null;
  clearErrors();
}
function clearErrors() {
  ['loginError', 'signupError'].forEach(id => {
    el(id).classList.add('hidden');
    el(id).textContent = '';
  });
}
function showError(id, msg) {
  el(id).textContent = msg;
  el(id).classList.remove('hidden');
}
function setLoading(btnId, loading) {
  const btn = el(btnId);
  btn.disabled = loading;
  btn.textContent = loading ? '처리 중...' : (btnId === 'loginSubmit' ? '로그인' : '가입하기');
}
function updateAuthUI(user) {
  const authBtn   = el('authBtn');
  const iconGroup = el('headerIconGroup');
  if (user) {
    authBtn.classList.add('hidden');
    iconGroup.classList.remove('hidden');
  } else {
    authBtn.classList.remove('hidden');
    iconGroup.classList.add('hidden');
  }
}

function openUserSheet() {
  if (!currentUser) return;
  const name    = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || '내 계정';
  const email   = currentUser.email || '';
  const photo   = currentUser.user_metadata?.avatar_url || '';
  const initial = name.charAt(0).toUpperCase();

  el('userSheetName').textContent  = name;
  el('userSheetEmail').textContent = email;

  const avatarEl = el('userAvatar');
  avatarEl.textContent = '';
  if (photo) {
    const img = document.createElement('img');
    img.src = photo; img.alt = name;
    img.onerror = () => { avatarEl.textContent = initial; };
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = initial;
  }
  openSheet(el('userSheet'), el('sheetOverlay'));
}
function closeUserSheet() { closeSheet(el('userSheet'), el('sheetOverlay')); }

async function socialLogin(provider) {
  const { error } = await db.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.href },
  });
  if (error) showError('loginError', error.message);
}

async function emailLogin() {
  const email    = el('loginEmail').value.trim();
  const password = el('loginPassword').value;
  if (!email || !password) return showError('loginError', '이메일과 비밀번호를 입력해 주세요.');
  setLoading('loginSubmit', true);
  const { error } = await db.auth.signInWithPassword({ email, password });
  setLoading('loginSubmit', false);
  if (error) {
    showError('loginError', '이메일 또는 비밀번호가 올바르지 않습니다.');
  } else {
    closeLoginSheet();
    if (pendingEventLink) {
      window.open(pendingEventLink, '_blank', 'noopener,noreferrer');
      pendingEventLink = null;
    }
  }
}

async function emailSignup() {
  const email  = el('signupEmail').value.trim();
  const pw     = el('signupPassword').value;
  const pwConf = el('signupPasswordConfirm').value;
  if (!email || !pw) return showError('signupError', '이메일과 비밀번호를 입력해 주세요.');
  if (pw.length < 6) return showError('signupError', '비밀번호는 6자 이상이어야 합니다.');
  if (pw !== pwConf) return showError('signupError', '비밀번호가 일치하지 않습니다.');
  setLoading('signupSubmit', true);
  const { error } = await db.auth.signUp({ email, password: pw });
  setLoading('signupSubmit', false);
  if (error) {
    showError('signupError', error.message);
  } else {
    const errEl = el('signupError');
    errEl.classList.remove('hidden');
    errEl.style.background = '#F0FFF4';
    errEl.style.borderColor = '#A5D6A7';
    errEl.style.color = '#2E7D32';
    errEl.textContent = '가입 완료! 이메일을 확인해 주세요 ✉️';
  }
}

async function logout() { await db.auth.signOut(); }

/* ============================================================
   LISTENERS
   ============================================================ */
function initListeners() {
  const searchInput  = el('searchInput');
  const sheetOverlay = el('sheetOverlay');
  const sortSheet    = el('sortSheet');
  const filterSheet  = el('filterSheet');
  const sortLabel    = el('sortLabel');

  /* 검색 */
  const doSearch = () => { state.search = searchInput.value.trim(); render(); };
  const debounced = debounce(doSearch, 250);
  searchInput.addEventListener('input', debounced);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  el('searchBtn').addEventListener('click', doSearch);

  /* 이벤트 카드 클릭 → 상세 페이지 */
  el('eventsGrid').addEventListener('click', e => {
    const card = e.target.closest('.evt-card');
    if (!card) return;
    openEventPage(parseInt(card.dataset.eid));
  });

  /* 오버레이 → 열린 시트 닫기 */
  sheetOverlay.addEventListener('click', () => {
    [sortSheet, filterSheet, el('userSheet')]
      .filter(s => !s.classList.contains('hidden'))
      .forEach(s => closeSheet(s, sheetOverlay));
  });

  /* 정렬 시트 */
  el('sortBtn').addEventListener('click', () => openSheet(sortSheet, sheetOverlay));
  document.querySelectorAll('.sort-option').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll('.sort-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortLabel.textContent = btn.textContent.trim();
      closeSheet(sortSheet, sheetOverlay);
      render();
    });
  });

  /* 필터 시트 */
  el('filterBtn').addEventListener('click', () => openSheet(filterSheet, sheetOverlay));
  el('filterSheetClose').addEventListener('click', () => closeSheet(filterSheet, sheetOverlay));

  /* 기간 라디오 — 즉시 미리보기 */
  document.querySelectorAll('.period-rb').forEach(rb => {
    rb.addEventListener('change', () => {
      document.querySelectorAll('#periodFilterGroup .filter-sheet-item').forEach(item => {
        item.classList.toggle('checked', item.querySelector('input').checked);
      });
    });
  });

  el('filterReset').addEventListener('click', () => {
    [brandGroup, typeGroup].forEach(g => {
      g.cbs.forEach(cb => { cb.checked = true; cb.closest('.filter-sheet-item').classList.add('checked'); });
      g.allCb.checked = true;
      g.allLabel.classList.add('checked');
    });
    document.querySelectorAll('.period-rb').forEach(rb => { rb.checked = rb.value === 'all'; });
    document.querySelectorAll('#periodFilterGroup .filter-sheet-item').forEach(item => {
      item.classList.toggle('checked', item.querySelector('input').checked);
    });
  });

  el('filterApply').addEventListener('click', () => {
    state.brands       = new Set([...brandGroup.cbs].filter(cb => cb.checked).map(cb => cb.value));
    state.productTypes = new Set([...typeGroup.cbs ].filter(cb => cb.checked).map(cb => cb.value));
    const periodRb = document.querySelector('.period-rb:checked');
    state.period = periodRb ? periodRb.value : 'all';
    updateFilterCount();
    closeSheet(filterSheet, sheetOverlay);
    render();
  });

  /* 빈 상태 초기화 */
  el('resetFilters').addEventListener('click', () => {
    state.search       = '';
    state.period       = 'all';
    state.brands       = new Set(ALL_BRANDS.map(b => b.value));
    state.productTypes = new Set(ALL_PRODUCT_TYPES.map(t => t.value));
    searchInput.value  = '';
    [brandGroup, typeGroup].forEach(g => {
      g.cbs.forEach(cb => { cb.checked = true; cb.closest('.filter-sheet-item').classList.add('checked'); });
      g.allCb.checked = true;
      g.allLabel.classList.add('checked');
    });
    document.querySelectorAll('.period-rb').forEach(rb => { rb.checked = rb.value === 'all'; });
    document.querySelectorAll('#periodFilterGroup .filter-sheet-item').forEach(item => {
      item.classList.toggle('checked', item.querySelector('input').checked);
    });
    updateFilterCount();
    render();
  });

  /* 이벤트 상세 페이지 */
  el('eventPageBack').addEventListener('click', closeEventPage);
  window.addEventListener('popstate', () => {
    const page = el('eventPage');
    if (!page.classList.contains('hidden')) {
      page.classList.remove('page-open');
      page.addEventListener('transitionend', () => {
        page.classList.add('hidden');
        el('eventPageBody').textContent = '';
        document.body.style.overflow = '';
      }, { once: true });
    }
  });

  /* 드래그 투 클로즈 */
  setupDragToClose(sortSheet,       () => closeSheet(sortSheet, sheetOverlay));
  setupDragToClose(filterSheet,     () => closeSheet(filterSheet, sheetOverlay));
  setupDragToClose(el('userSheet'),  closeUserSheet);
  setupDragToClose(el('loginSheet'), closeLoginSheet);

  /* 인증 버튼 */
  el('authBtn').addEventListener('click', openLoginSheet);
  el('userBtn').addEventListener('click', openUserSheet);
  el('userSheetClose').addEventListener('click', closeUserSheet);
  el('userLogoutBtn').addEventListener('click', () => { closeUserSheet(); logout(); });
  el('loginOverlay').addEventListener('click', closeLoginSheet);
  el('loginClose').addEventListener('click', closeLoginSheet);
  el('goSignup').addEventListener('click', () => {
    el('loginForm').classList.add('hidden');
    el('signupForm').classList.remove('hidden');
    clearErrors();
  });
  el('goLogin').addEventListener('click', () => {
    el('signupForm').classList.add('hidden');
    el('loginForm').classList.remove('hidden');
    clearErrors();
  });
  el('loginGoogle').addEventListener('click', () => socialLogin('google'));
  el('loginSubmit').addEventListener('click', emailLogin);
  el('signupSubmit').addEventListener('click', emailSignup);
  [el('loginEmail'), el('loginPassword')].forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') emailLogin(); });
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);

  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    updateAuthUI(currentUser);
    if (currentUser && pendingEventLink) {
      window.open(pendingEventLink, '_blank', 'noopener,noreferrer');
      pendingEventLink = null;
      closeLoginSheet();
    }
  });

  try {
    await Promise.all([loadEvents(), loadFilterOptions()]);
    buildDynamicFilters();
    initListeners();
    render();
    showLoading(false);
  } catch (err) {
    showDbError(err.message);
  }
});
