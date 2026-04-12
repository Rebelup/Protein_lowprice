'use strict';

/* ============================================================
   SUPABASE 설정
   ============================================================ */
const SUPABASE_URL      = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   전역 데이터
   ============================================================ */
let PRODUCTS         = [];
let currentUser      = null;
let pendingProductLink = null;   // 로그인 후 열 상품 링크

const ALL_STORES = ['쿠팡', '마켓컬리', '이마트', '홈플러스', 'GS25', '올리브영', '오늘의식탁'];
const THUMB_CACHE_KEY = 'protein_thumb_v1';

/* ============================================================
   HELPERS
   ============================================================ */
function el(id) { return document.getElementById(id); }

function discountPct(orig, sale) {
  return Math.round(((orig - sale) / orig) * 100);
}
function formatKRW(n) {
  return n.toLocaleString('ko-KR') + '원';
}
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - today) / 86400000);
}
function deliveryInfo(store) {
  if (store === '쿠팡')     return { label: '🚀 로켓배송', cls: 'rocket' };
  if (store === '마켓컬리') return { label: '🌿 새벽배송', cls: 'fresh'  };
  return                           { label: `📦 ${store}`,  cls: 'normal' };
}
function viewerCount(id) {
  return ((id * 7 + 3) % 19) + 3;
}

/* ============================================================
   STATE
   ============================================================ */
let state = {
  search:     '',
  category:   'all',
  rocketOnly: false,
  activeOnly: false,
  sort:       'discount',
  stores:     new Set(ALL_STORES),
};

/* ============================================================
   로딩 / 에러
   ============================================================ */
function showLoading(visible) {
  el('loadingOverlay').classList.toggle('hidden', !visible);
}
function showDbError(msg) {
  const grid = el('productGrid');
  grid.style.display = 'block';
  grid.innerHTML = `
    <div class="db-error">
      <span class="db-error-icon">⚠️</span>
      <p>데이터를 불러오지 못했습니다</p>
      <small>Supabase SQL Editor에서 setup.sql을 먼저 실행해 주세요.<br>${msg}</small>
    </div>`;
  showLoading(false);
}

/* ============================================================
   SUPABASE 데이터 로드
   ============================================================ */
async function loadProducts() {
  const { data, error } = await db.from('products').select('*').order('id');
  if (error) throw new Error(error.message);

  PRODUCTS = data.map(p => ({
    id:            p.id,
    name:          p.name,
    brand:         p.brand,
    store:         p.store,
    category:      p.category,
    flavor:        p.flavor,
    weight:        p.weight,
    grams:         p.grams,
    emoji:         p.emoji,
    thumbnail:     p.thumbnail || null,
    originalPrice: p.original_price,
    salePrice:     p.sale_price,
    expiryDate:    p.expiry_date,
    link:          p.link || '#',
  }));
}

/* ============================================================
   썸네일 자동 크롤링 (CORS 프록시 사용)
   - localStorage 캐시로 반복 요청 방지
   ============================================================ */
function getThumbCache() {
  try { return JSON.parse(localStorage.getItem(THUMB_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function setThumbCache(cache) {
  try { localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(cache)); }
  catch {}
}

async function fetchOgImage(url) {
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res   = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    const html = data.contents || '';
    // og:image 추출
    const m = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
           || html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function loadThumbnailsInBackground() {
  const cache = getThumbCache();
  const missing = PRODUCTS.filter(p => !p.thumbnail && !cache[p.id] && p.link && p.link !== '#');

  // 동시에 최대 3개씩 요청
  for (let i = 0; i < missing.length; i += 3) {
    const batch = missing.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(p => fetchOgImage(p.link).then(url => ({ id: p.id, url })))
    );
    let updated = false;
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.url) {
        cache[r.value.id] = r.value.url;
        // 메모리 내 PRODUCTS 도 업데이트
        const prod = PRODUCTS.find(p => p.id === r.value.id);
        if (prod) {
          prod.thumbnail = r.value.url;
          // 렌더링된 이미지 즉시 교체
          const imgEl = document.querySelector(`[data-pid="${prod.id}"] .thumb-img`);
          if (imgEl) {
            imgEl.src = r.value.url;
            imgEl.style.display = 'block';
            const fallback = document.querySelector(`[data-pid="${prod.id}"] .card-img-fallback`);
            if (fallback) fallback.style.display = 'none';
          }
        }
        updated = true;
      }
    });
    if (updated) setThumbCache(cache);
  }
}

function getThumbUrl(p) {
  if (p.thumbnail) return p.thumbnail;
  const cache = getThumbCache();
  return cache[p.id] || null;
}

/* ============================================================
   필터 배지 카운트
   ============================================================ */
function updateFilterCount() {
  const deselected = ALL_STORES.length - state.stores.size;
  const countEl    = el('filterCount');
  const filterBtn  = el('filterBtn');
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
   필터 + 정렬
   ============================================================ */
function getFiltered() {
  let list = PRODUCTS;

  if (state.category === 'hotdeal') {
    list = list.filter(p => discountPct(p.originalPrice, p.salePrice) >= 30);
  } else if (state.category !== 'all') {
    list = list.filter(p => p.category === state.category);
  }

  return list
    .filter(p => {
      if (state.search) {
        const q = state.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      }
      if (!state.stores.has(p.store)) return false;
      if (state.rocketOnly && p.store !== '쿠팡') return false;
      if (state.activeOnly && daysUntil(p.expiryDate) <= 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'discount')   return discountPct(b.originalPrice, b.salePrice) - discountPct(a.originalPrice, a.salePrice);
      if (state.sort === 'price_asc')  return a.salePrice - b.salePrice;
      if (state.sort === 'price_desc') return b.salePrice - a.salePrice;
      if (state.sort === 'name')       return a.name.localeCompare(b.name, 'ko');
      return 0;
    });
}

/* ============================================================
   TOP 10 렌더링
   ============================================================ */
function renderTop10() {
  const top10 = [...PRODUCTS]
    .sort((a, b) => discountPct(b.originalPrice, b.salePrice) - discountPct(a.originalPrice, a.salePrice))
    .slice(0, 10);

  el('top10Grid').innerHTML = top10.map((p, i) => {
    const pct      = discountPct(p.originalPrice, p.salePrice);
    const delivery = deliveryInfo(p.store);
    const rank     = i + 1;
    const thumb    = getThumbUrl(p);

    return `
      <div class="top10-card" data-pid="${p.id}" data-link="${p.link}" onclick="handleProductClick(event, '${p.link}')">
        <div class="top10-img-wrap ${!thumb ? 'thumb-loading' : ''}">
          ${pct >= 25 ? '<span class="badge-yeokdaegup">역대급</span>' : ''}
          ${thumb
            ? `<img class="thumb-img" src="${thumb}" alt="${p.name}" loading="lazy"
                 onerror="this.style.display='none';this.nextSibling.style.display='flex'" />
               <span class="top10-img-fallback" style="display:none">${p.emoji}</span>`
            : `<span class="top10-img-fallback">${p.emoji}</span>`
          }
          <span class="rank-badge ${rank === 1 ? 'rank-1' : ''}">${rank}</span>
        </div>
        <div class="top10-body">
          <div class="delivery-tag ${delivery.cls}">${delivery.label}</div>
          <div class="top10-name">${p.name}</div>
          <div class="price-row">
            <span class="price-main">${formatKRW(p.salePrice)}</span>
            <span class="price-down">▼${pct}%</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ============================================================
   상품 카드 렌더링
   ============================================================ */
function renderCard(p) {
  const pct      = discountPct(p.originalPrice, p.salePrice);
  const delivery = deliveryInfo(p.store);
  const viewers  = viewerCount(p.id);
  const thumb    = getThumbUrl(p);
  const showBadge = pct >= 30;
  const isHotdeal = pct >= 40;

  return `
    <article class="product-card" data-pid="${p.id}" onclick="handleProductClick(event, '${p.link}')">
      <div class="card-img-wrap ${!thumb ? 'thumb-loading' : ''}">
        ${showBadge ? `<div class="badge-lowprice">${isHotdeal ? '🔥 핫딜' : '역대급최저가'}<br>${isHotdeal ? '지금 바로!' : '구매타이밍'}</div>` : ''}
        ${thumb
          ? `<img class="thumb-img" src="${thumb}" alt="${p.name}" loading="lazy"
               onerror="this.style.display='none';this.nextSibling.style.display='flex'" />
             <span class="card-img-fallback" style="display:none">${p.emoji}</span>`
          : `<span class="card-img-fallback">${p.emoji}</span>`
        }
        <button class="add-btn"
          onclick="event.stopPropagation(); handleProductClick(event, '${p.link}')"
          aria-label="바로가기">+</button>
      </div>
      <div class="card-body">
        <div class="card-delivery ${delivery.cls}">${delivery.label}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-price-row">
          <span class="card-price">${formatKRW(p.salePrice)}</span>
          <span class="card-discount">▼${pct}%</span>
        </div>
        <div class="card-viewers">${viewers}명 추가</div>
      </div>
    </article>`;
}

/* ============================================================
   전체 렌더
   ============================================================ */
function render() {
  const items = getFiltered();
  const grid  = el('productGrid');
  const empty = el('emptyState');

  el('resultCount').textContent = items.length;

  // 핫딜 배너 토글
  el('hotdealBanner').classList.toggle('hidden', state.category !== 'hotdeal');
  el('top10Section').classList.toggle('hidden', state.category === 'hotdeal');

  if (items.length === 0) {
    grid.innerHTML     = '';
    grid.style.display = 'none';
    empty.classList.remove('hidden');
  } else {
    grid.innerHTML     = items.map(renderCard).join('');
    grid.style.display = 'grid';
    empty.classList.add('hidden');
  }
}

/* ============================================================
   상품 클릭 → 로그인 게이트
   ============================================================ */
function handleProductClick(e, link) {
  e.stopPropagation();
  if (currentUser) {
    window.open(link, '_blank');
  } else {
    pendingProductLink = link;
    openLoginSheet();
  }
}

/* ============================================================
   AUTH — 로그인 UI
   ============================================================ */
function openLoginSheet() {
  el('loginOverlay').classList.remove('hidden');
  el('loginSheet').classList.remove('hidden');
  el('loginForm').classList.remove('hidden');
  el('signupForm').classList.add('hidden');
  clearErrors();
}
function closeLoginSheet() {
  el('loginOverlay').classList.add('hidden');
  el('loginSheet').classList.add('hidden');
  pendingProductLink = null;
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
  const btn   = el('authBtn');
  const label = el('authBtnLabel');
  if (user) {
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || '내 계정';
    label.textContent = name;
    btn.classList.add('logged-in');
  } else {
    label.textContent = '로그인';
    btn.classList.remove('logged-in');
  }
}

/* ============================================================
   AUTH — 소셜 로그인
   ============================================================ */
async function socialLogin(provider) {
  const { error } = await db.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.href,
    },
  });
  if (error) showError('loginError', error.message);
}

/* ============================================================
   AUTH — 이메일 로그인
   ============================================================ */
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
    if (pendingProductLink) {
      window.open(pendingProductLink, '_blank');
      pendingProductLink = null;
    }
  }
}

/* ============================================================
   AUTH — 이메일 회원가입
   ============================================================ */
async function emailSignup() {
  const email   = el('signupEmail').value.trim();
  const pw      = el('signupPassword').value;
  const pwConf  = el('signupPasswordConfirm').value;

  if (!email || !pw) return showError('signupError', '이메일과 비밀번호를 입력해 주세요.');
  if (pw.length < 6) return showError('signupError', '비밀번호는 6자 이상이어야 합니다.');
  if (pw !== pwConf) return showError('signupError', '비밀번호가 일치하지 않습니다.');

  setLoading('signupSubmit', true);
  const { error } = await db.auth.signUp({ email, password: pw });
  setLoading('signupSubmit', false);

  if (error) {
    showError('signupError', error.message);
  } else {
    el('signupError').classList.remove('hidden');
    el('signupError').style.background = '#F0FFF4';
    el('signupError').style.borderColor = '#A5D6A7';
    el('signupError').style.color = '#2E7D32';
    el('signupError').textContent = '가입 완료! 이메일을 확인해 주세요 ✉️';
  }
}

/* ============================================================
   AUTH — 로그아웃
   ============================================================ */
async function logout() {
  await db.auth.signOut();
}

/* ============================================================
   이벤트 리스너
   ============================================================ */
function initListeners() {
  const searchInput  = el('searchInput');
  const sheetOverlay = el('sheetOverlay');
  const sortSheet    = el('sortSheet');
  const filterSheet  = el('filterSheet');
  const sortLabel    = el('sortLabel');

  /* 검색 */
  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim();
    render();
  });
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') render(); });
  el('searchBtn').addEventListener('click', () => render());

  /* 카테고리 탭 */
  el('categoryFilter').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('#categoryFilter .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.category = tab.dataset.category;
    render();
  });

  /* 로켓배송 / 품절제외 */
  el('filterRocket').addEventListener('change', e => { state.rocketOnly = e.target.checked; render(); });
  el('filterActive').addEventListener('change', e => { state.activeOnly = e.target.checked; render(); });

  /* 공유 오버레이 */
  sheetOverlay.addEventListener('click', () => {
    sortSheet.classList.add('hidden');
    filterSheet.classList.add('hidden');
    sheetOverlay.classList.add('hidden');
  });

  /* 정렬 시트 */
  el('sortBtn').addEventListener('click', () => {
    sortSheet.classList.remove('hidden');
    sheetOverlay.classList.remove('hidden');
  });
  document.querySelectorAll('.sort-option').forEach(btn => {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      document.querySelectorAll('.sort-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortLabel.textContent = btn.textContent.replace('✓', '').trim();
      sortSheet.classList.add('hidden');
      sheetOverlay.classList.add('hidden');
      render();
    });
  });

  /* 필터 시트 */
  const selectAllCb    = el('storeSelectAll');
  const selectAllLabel = selectAllCb.closest('.filter-sheet-item');
  const storeCbs       = document.querySelectorAll('.store-cb');

  selectAllLabel.classList.add('checked');
  storeCbs.forEach(cb => cb.closest('.filter-sheet-item').classList.add('checked'));

  selectAllLabel.addEventListener('click', () => {
    const willCheck = !selectAllCb.checked;
    selectAllCb.checked = willCheck;
    selectAllLabel.classList.toggle('checked', willCheck);
    storeCbs.forEach(cb => {
      cb.checked = willCheck;
      cb.closest('.filter-sheet-item').classList.toggle('checked', willCheck);
    });
  });
  storeCbs.forEach(cb => {
    cb.closest('.filter-sheet-item').addEventListener('click', () => {
      cb.checked = !cb.checked;
      cb.closest('.filter-sheet-item').classList.toggle('checked', cb.checked);
      const allChecked = [...storeCbs].every(c => c.checked);
      selectAllCb.checked = allChecked;
      selectAllLabel.classList.toggle('checked', allChecked);
    });
  });

  el('filterBtn').addEventListener('click', () => {
    filterSheet.classList.remove('hidden');
    sheetOverlay.classList.remove('hidden');
  });
  el('filterSheetClose').addEventListener('click', () => {
    filterSheet.classList.add('hidden');
    sheetOverlay.classList.add('hidden');
  });
  el('filterReset').addEventListener('click', () => {
    selectAllCb.checked = true;
    selectAllLabel.classList.add('checked');
    storeCbs.forEach(cb => { cb.checked = true; cb.closest('.filter-sheet-item').classList.add('checked'); });
  });
  el('filterApply').addEventListener('click', () => {
    state.stores = new Set([...storeCbs].filter(cb => cb.checked).map(cb => cb.value));
    updateFilterCount();
    filterSheet.classList.add('hidden');
    sheetOverlay.classList.add('hidden');
    render();
  });

  /* 빈 상태 초기화 */
  el('resetFilters').addEventListener('click', () => {
    state = { search: '', category: 'all', rocketOnly: false, activeOnly: false, sort: 'discount', stores: new Set(ALL_STORES) };
    searchInput.value = '';
    document.querySelectorAll('#categoryFilter .tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    el('filterRocket').checked = false;
    el('filterActive').checked = false;
    sortLabel.textContent = '급하락순';
    document.querySelectorAll('.sort-option').forEach((b, i) => b.classList.toggle('active', i === 0));
    selectAllCb.checked = true;
    selectAllLabel.classList.add('checked');
    storeCbs.forEach(cb => { cb.checked = true; cb.closest('.filter-sheet-item').classList.add('checked'); });
    updateFilterCount();
    render();
  });

  /* ---- 로그인 UI 이벤트 ---- */
  el('authBtn').addEventListener('click', () => {
    if (currentUser) {
      // 로그인 상태 → 로그아웃 확인
      if (confirm('로그아웃 하시겠습니까?')) logout();
    } else {
      openLoginSheet();
    }
  });
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
  el('loginKakao').addEventListener('click', () => socialLogin('kakao'));
  el('loginSubmit').addEventListener('click', emailLogin);
  el('signupSubmit').addEventListener('click', emailSignup);

  // Enter 키 로그인
  [el('loginEmail'), el('loginPassword')].forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') emailLogin(); });
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);

  /* 인증 상태 감지 */
  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    updateAuthUI(currentUser);
    // 로그인 성공 후 대기 중이던 링크 처리
    if (currentUser && pendingProductLink) {
      window.open(pendingProductLink, '_blank');
      pendingProductLink = null;
      closeLoginSheet();
    }
  });

  try {
    await loadProducts();
    renderTop10();
    initListeners();
    render();
    showLoading(false);

    // 백그라운드에서 썸네일 크롤링 (비동기)
    loadThumbnailsInBackground().catch(() => {});
  } catch (err) {
    showDbError(err.message);
  }
});
