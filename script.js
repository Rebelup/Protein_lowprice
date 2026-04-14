/* v1.0.0 - 2026-04-13
   프로틴 특가 | 마이프로틴 & BSN 보충제 특가 모음
   - 이벤트 시스템 (진행중/예정 탭)
   - 상품 상세 페이지 (이벤트 선택 + 실시간 가격 계산)
   - 보안: XSS 방지, noopener/noreferrer, DOM API 사용
   - 최적화: 디바운스 검색, 이벤트 위임
*/
'use strict';

/* ============================================================
   SUPABASE 설정
   ============================================================ */
const SUPABASE_URL      = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   이벤트 데이터 (정적)
   ============================================================ */
const EVENTS = [
  {
    id: 1, brand: 'myprotein', brandLabel: '마이프로틴',
    name: '마이프로틴 할인코드 모음',
    desc: '할인 코드 적용 시 최대 35% 추가 할인. 코드 확인 후 장바구니에서 입력하세요.',
    discountPct: 35, color: '#0077CC',
    active: true, endDate: '2026-12-31',
    link: 'https://www.myprotein.co.kr/c/voucher-codes/?affil=thgppc&thg_ppc_campaign=821750852&gclid=Cj0KCQjwqPLOBhCiARIsAKRMPZppFlpuWJQZWpknDNHBpdmJXWLzmVpzTa3tTRozHc-6vpTKUTywYu8aAnx9EALw_wcB',
  },
  {
    id: 2, brand: 'bsn', brandLabel: 'BSN',
    name: "BSN Let's BSN 이벤트",
    desc: '신타6 구매 시 특별 프로모션 혜택. 이벤트 기간 구매 시 최대 20% 추가 할인.',
    discountPct: 20, color: '#E53935',
    active: true, endDate: '2026-06-30',
    link: 'https://www.bsn.co.kr/pages/lets-bsn',
  },
];

/* ============================================================
   전역 데이터
   ============================================================ */
let PRODUCTS           = [];
let currentUser        = null;
let pendingProductLink = null;
let ALL_FLAVORS        = [];   // buildDynamicFilters() 이후 채워짐
let ALL_WEIGHTS        = [];   // buildDynamicFilters() 이후 채워짐

const ALL_BRANDS        = ['마이프로틴', 'BSN'];
const ALL_PRODUCT_TYPES = ['단백질 파우더', 'BCAA', '크레아틴', '영양제'];
const BOOSTER_SUB       = ['단백질 파우더', 'BCAA', '크레아틴', '영양제'];
const THUMB_CACHE_KEY   = 'protein_thumb_v1';

/* ============================================================
   HELPERS
   ============================================================ */
function el(id) { return document.getElementById(id); }

const _escMap = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
function escHtml(s) { return String(s).replace(/[&<>"']/g, c => _escMap[c]); }
function safeUrl(u) {
  try {
    const parsed = new URL(u);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? u : '#';
  } catch { return '#'; }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

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
  if (store === '마이프로틴') return { label: '🔵 마이프로틴몰', cls: 'myprotein' };
  if (store === 'BSN')       return { label: '🔴 BSN코리아',    cls: 'bsn' };
  return { label: `📦 ${store}`, cls: 'normal' };
}
function viewerCount(id) {
  return ((id * 7 + 3) % 19) + 3;
}

/** 보충제 세부 분류 */
function getSubCat(p) {
  const n = p.name.toLowerCase();
  if (/bcaa/.test(n)) return 'BCAA';
  if (/크레아틴|creatine/.test(n)) return '크레아틴';
  if (/비타민|vitamin|영양제/.test(n)) return '영양제';
  return '단백질 파우더';
}

/** 탭별 세부 칩 목록 */
function getChipsForTab(tab) {
  if (tab === '보충제') return BOOSTER_SUB;
  return null;
}

/** 상품에 적용 가능한 이벤트 목록 */
function getProductEvents(p) {
  const brand = (p.brand || '').toLowerCase();
  return EVENTS.filter(e => {
    if (e.brand === 'myprotein') return brand.includes('마이프로틴');
    if (e.brand === 'bsn') return brand === 'bsn';
    return false;
  });
}

/** 이벤트 적용 시 최저가 계산 (활성화된 이벤트만) */
function getEventBestPrice(p) {
  const evts = getProductEvents(p).filter(e => state.activeEventIds.has(e.id));
  if (!evts.length) return null;
  const best = Math.max(...evts.map(e => e.discountPct));
  return Math.round(p.salePrice * (1 - best / 100));
}

/** 세부 카테고리 칩 렌더링 */
function renderSubcatChips() {
  const wrap  = el('subcatChipsWrap');
  const chips = getChipsForTab(state.category);
  if (!chips) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  el('subcatChips').innerHTML = ['전체', ...chips].map(c => {
    const val    = c === '전체' ? '' : c;
    const active = (!state.subCat && c === '전체') || state.subCat === val;
    return `<button class="subcat-chip${active ? ' active' : ''}" data-val="${val}">${c}</button>`;
  }).join('');
}

/* ============================================================
   STATE
   ============================================================ */
let state = {
  search:       '',
  category:     'all',
  subCat:       null,
  activeOnly:   false,
  sort:         'price_asc',
  brands:       new Set(ALL_BRANDS),
  productTypes: new Set(ALL_PRODUCT_TYPES),
  flavors:        new Set(),   // 제품 로드 후 채워짐
  weights:        new Set(),   // 제품 로드 후 채워짐
  activeEventIds: new Set(EVENTS.map(e => e.id)), // 활성 이벤트 (기본=전체)
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
  const allFlavors = [...document.querySelectorAll('.flavor-cb')].map(c => c.value);
  const allWeights = [...document.querySelectorAll('.weight-cb')].map(c => c.value);
  const deselected = (ALL_BRANDS.length - state.brands.size)
                   + (ALL_PRODUCT_TYPES.length - state.productTypes.size)
                   + (allFlavors.length - state.flavors.size)
                   + (allWeights.length - state.weights.size);
  const countEl = el('filterCount');
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
   필터 + 정렬
   ============================================================ */
function getFiltered() {
  let list = PRODUCTS;

  if (state.category !== 'all') {
    list = list.filter(p => p.category === state.category);
  }

  if (state.subCat) {
    list = list.filter(p => getSubCat(p) === state.subCat);
  }

  return list
    .filter(p => {
      if (state.search) {
        const q = state.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      }
      if (!state.brands.has(p.brand)) return false;
      if (!state.productTypes.has(getSubCat(p))) return false;
      if (state.flavors.size && !state.flavors.has(p.flavor)) return false;
      if (state.weights.size && !state.weights.has(p.weight)) return false;
      if (state.activeOnly && daysUntil(p.expiryDate) <= 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'price_asc')  return a.salePrice - b.salePrice;
      if (state.sort === 'price_desc') return b.salePrice - a.salePrice;
      if (state.sort === 'name')       return a.name.localeCompare(b.name, 'ko');
      return a.salePrice - b.salePrice;
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
      <div class="top10-card" data-pid="${p.id}" onclick="openProductDetail(${p.id})">
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
    <article class="product-card" data-pid="${p.id}" onclick="openProductDetail(${p.id})">
      <div class="card-img-wrap ${!thumb ? 'thumb-loading' : ''}">
        ${showBadge ? `<div class="badge-lowprice">${isHotdeal ? '🔥 핫딜' : '역대급최저가'}<br>${isHotdeal ? '지금 바로!' : '구매타이밍'}</div>` : ''}
        ${thumb
          ? `<img class="thumb-img" src="${thumb}" alt="${p.name}" loading="lazy"
               onerror="this.style.display='none';this.nextSibling.style.display='flex'" />
             <span class="card-img-fallback" style="display:none">${p.emoji}</span>`
          : `<span class="card-img-fallback">${p.emoji}</span>`
        }
        <button class="add-btn"
          onclick="event.stopPropagation(); addToCart(${p.id})"
          aria-label="장바구니에 추가">+</button>
      </div>
      <div class="card-body">
        <div class="card-delivery ${delivery.cls}">${delivery.label}</div>
        <div class="card-name">${p.name}</div>
        <div class="card-orig">정가 ${formatKRW(p.originalPrice)}</div>
        <div class="card-price-row">
          <span class="card-price">${formatKRW(p.salePrice)}</span>
          <span class="card-discount">▼${pct}%</span>
        </div>
        ${(() => { const ep = getEventBestPrice(p); return ep ? `<div class="card-event-price">🎁 이벤트 최저가 <strong>${formatKRW(ep)}</strong></div>` : ''; })()}
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
  el('top10Section').classList.remove('hidden');

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
   상품 상세 페이지 (바텀시트)
   ============================================================ */
/* ============================================================
   상품 페이지 (풀스크린, 오른쪽에서 슬라이드)
   ============================================================ */
function openProductDetail(productId) { openProductPage(productId); } // 하위 호환

function openProductPage(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  renderProductPageContent(p);
  const page = el('productPage');
  page.classList.remove('hidden');
  page.getBoundingClientRect();
  page.classList.add('page-open');
  history.pushState({ productId }, '', `?product=${productId}`);
}

function closeProductPage() {
  const page = el('productPage');
  page.classList.remove('page-open');
  page.addEventListener('transitionend', () => {
    page.classList.add('hidden');
    el('productPageBody').textContent = '';
  }, { once: true });
  if (history.state?.productId) history.back();
}

function renderProductPageContent(p) {
  const pct      = discountPct(p.originalPrice, p.salePrice);
  const delivery = deliveryInfo(p.store);
  const thumb    = getThumbUrl(p);
  const safeLink = escHtml(safeUrl(p.link));
  const evts     = getProductEvents(p);

  const eventsHtml = evts.length ? `
    <div class="pp-events-wrap">
      <div class="pp-section-title">🎁 적용 가능한 이벤트</div>
      ${evts.map(e => `
        <label class="pp-event-item">
          <span class="pp-event-dot" style="background:${e.color}"></span>
          <div class="pp-event-info">
            <div class="pp-event-name">${escHtml(e.name)}</div>
            <div class="pp-event-meta">추가 <strong>${e.discountPct}%</strong> 할인 · ~${e.endDate}</div>
          </div>
          <input type="checkbox" class="pp-event-cb" value="${e.id}"
            ${state.activeEventIds.has(e.id) ? 'checked' : ''}
            onchange="updatePpCalc(${p.id})">
        </label>`).join('')}
      <div class="pp-calc">
        <span class="pp-calc-label">이벤트 적용 예상가</span>
        <span class="pp-calc-price" id="ppCalcPrice">${formatKRW(p.salePrice)}</span>
      </div>
    </div>` : '';

  el('productPageBody').innerHTML = `
    <div class="pp-img-wrap">
      ${thumb
        ? `<img src="${escHtml(thumb)}" alt="${escHtml(p.name)}"
             onerror="this.style.display='none';this.nextSibling.style.display='flex'">
           <span class="pp-img-fallback" style="display:none">${p.emoji}</span>`
        : `<span class="pp-img-fallback">${p.emoji}</span>`}
    </div>
    <div class="pp-info">
      <div class="pp-brand-row">
        <span class="pp-brand">${escHtml(p.brand)}</span>
        <span class="card-delivery ${delivery.cls}">${delivery.label}</span>
      </div>
      <div class="pp-name">${escHtml(p.name)}</div>
      <div class="pp-price-row">
        <span class="pp-orig">${formatKRW(p.originalPrice)}</span>
        <span class="pp-sale">${formatKRW(p.salePrice)}</span>
        <span class="pp-pct">▼${pct}%</span>
      </div>
    </div>
    ${eventsHtml}
    <div class="pp-actions">
      <button class="pp-buy-btn" data-link="${safeLink}">구매하기 →</button>
    </div>`;

  updatePpCalc(p.id);

  el('productPageBody').querySelector('.pp-buy-btn')
    .addEventListener('click', function() { handleBuyClick(this.dataset.link); });
}

function updatePpCalc(pid) {
  const p = PRODUCTS.find(x => x.id === pid);
  const priceEl = el('ppCalcPrice');
  if (!p || !priceEl) return;
  const checked = [...document.querySelectorAll('.pp-event-cb:checked')];
  const evts = checked.map(cb => EVENTS.find(e => e.id === parseInt(cb.value))).filter(Boolean);
  if (!evts.length) { priceEl.textContent = formatKRW(p.salePrice); return; }
  const best = Math.max(...evts.map(e => e.discountPct));
  priceEl.textContent = formatKRW(Math.round(p.salePrice * (1 - best / 100)));
}

function handleBuyClick(link) {
  if (currentUser) {
    window.open(link, '_blank', 'noopener,noreferrer');
  } else {
    pendingProductLink = link;
    openLoginSheet();
  }
}

/* ============================================================
   SHEET HELPERS — 슬라이드 애니메이션 + 드래그 투 클로즈
   ============================================================ */
function openSheet(sheetEl, overlayEl) {
  sheetEl.classList.remove('hidden');
  sheetEl.getBoundingClientRect(); // force reflow
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
   이벤트 시트
   ============================================================ */
function openEventSheet() {
  renderEventChips();
  openSheet(el('eventSheet'), el('sheetOverlay'));
}
function closeEventSheet() {
  closeSheet(el('eventSheet'), el('sheetOverlay'));
}
function renderEventChips() {
  const container = el('eventChips');
  container.textContent = '';
  EVENTS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'event-chip' + (state.activeEventIds.has(e.id) ? ' active' : '');
    btn.dataset.eventId = e.id;

    const dot = document.createElement('span');
    dot.className = 'event-chip-dot';
    dot.style.background = e.color;

    const label = document.createElement('span');
    label.textContent = `${e.brandLabel} ${e.discountPct}% 할인`;

    btn.append(dot, label);
    container.appendChild(btn);
  });
}

/* ============================================================
   AUTH — 로그인 UI
   ============================================================ */
function openLoginSheet() {
  el('loginForm').classList.remove('hidden');
  el('signupForm').classList.add('hidden');
  clearErrors();
  openSheet(el('loginSheet'), el('loginOverlay'));
}
function closeLoginSheet() {
  closeSheet(el('loginSheet'), el('loginOverlay'));
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
  const authBtn        = el('authBtn');
  const iconGroup      = el('headerIconGroup');
  if (user) {
    authBtn.classList.add('hidden');
    iconGroup.classList.remove('hidden');
    updateCartBadge();
  } else {
    authBtn.classList.remove('hidden');
    iconGroup.classList.add('hidden');
  }
}

/* ============================================================
   CART — localStorage 기반
   ============================================================ */
const CART_KEY = 'protein_cart_v1';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}
function setCart(items) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)); }
  catch {}
}

function addToCart(productId) {
  if (!currentUser) { openLoginSheet(); return; }
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return;
  const cart = getCart();
  if (cart.some(c => c.id === productId)) {
    // 이미 추가됨 - 살짝 피드백
    showCartToast('이미 장바구니에 있어요');
    return;
  }
  cart.push({
    id:            p.id,
    name:          p.name,
    store:         p.store,
    emoji:         p.emoji,
    thumbnail:     getThumbUrl(p),
    salePrice:     p.salePrice,
    link:          p.link,
  });
  setCart(cart);
  updateCartBadge();
  showCartToast('장바구니에 추가됐어요');
}

function removeFromCart(productId) {
  setCart(getCart().filter(c => c.id !== productId));
  updateCartBadge();
  renderCartSheet();
}

function updateCartBadge() {
  const badge = el('cartBadge');
  const count = getCart().length;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

let toastTimer = null;
function showCartToast(msg) {
  let toast = document.getElementById('cartToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cartToast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;border-radius:99px;padding:9px 20px;font-size:13px;font-weight:600;z-index:500;white-space:nowrap;transition:opacity .3s';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

function renderCartSheet() {
  const body = el('cartSheetBody');
  const cart = getCart();
  if (cart.length === 0) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>장바구니가 비어있어요</p>
      </div>`;
    return;
  }
  body.innerHTML = cart.map(item => {
    const imgHtml = item.thumbnail
      ? `<img src="${escHtml(item.thumbnail)}" alt="${escHtml(item.name)}" onerror="this.style.display='none'">`
      : escHtml(item.emoji);
    return `
      <div class="cart-item">
        <div class="cart-item-img">${imgHtml}</div>
        <div class="cart-item-body">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          <div class="cart-item-price">${formatKRW(item.salePrice)}</div>
          <div class="cart-item-store">${escHtml(item.store)}</div>
        </div>
        <div class="cart-item-actions">
          <a class="cart-item-link" href="${escHtml(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer">구매</a>
          <button class="cart-item-remove" onclick="removeFromCart(${item.id})" aria-label="삭제">×</button>
        </div>
      </div>`;
  }).join('');
}

function openCartSheet() {
  renderCartSheet();
  openSheet(el('cartSheet'), el('sheetOverlay'));
}
function closeCartSheet() {
  closeSheet(el('cartSheet'), el('sheetOverlay'));
}

/* ============================================================
   USER INFO SHEET
   ============================================================ */
function openUserSheet() {
  if (!currentUser) return;
  const name  = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || '내 계정';
  const email = currentUser.email || '';
  const photo = currentUser.user_metadata?.avatar_url || '';
  const initial = name.charAt(0).toUpperCase();

  el('userSheetName').textContent  = name;
  el('userSheetEmail').textContent = email;

  const avatarEl = el('userAvatar');
  avatarEl.textContent = '';
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = name;
    img.onerror = () => { avatarEl.textContent = initial; };
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = initial;
  }

  openSheet(el('userSheet'), el('sheetOverlay'));
}
function closeUserSheet() {
  closeSheet(el('userSheet'), el('sheetOverlay'));
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
      window.open(pendingProductLink, '_blank', 'noopener,noreferrer');
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
function initCheckboxGroup(allCbId, cbClass) {
  const allCb    = el(allCbId);
  const allLabel = allCb.closest('.filter-sheet-item');
  const cbs      = document.querySelectorAll('.' + cbClass);
  allLabel.classList.add('checked');
  cbs.forEach(cb => cb.closest('.filter-sheet-item').classList.add('checked'));
  allLabel.addEventListener('click', () => {
    const v = !allCb.checked;
    allCb.checked = v;
    allLabel.classList.toggle('checked', v);
    cbs.forEach(cb => { cb.checked = v; cb.closest('.filter-sheet-item').classList.toggle('checked', v); });
  });
  cbs.forEach(cb => {
    cb.closest('.filter-sheet-item').addEventListener('click', () => {
      cb.checked = !cb.checked;
      cb.closest('.filter-sheet-item').classList.toggle('checked', cb.checked);
      const all = [...cbs].every(c => c.checked);
      allCb.checked = all;
      allLabel.classList.toggle('checked', all);
    });
  });
  return cbs;
}

/* ============================================================
   동적 필터 (맛 / 용량) 빌드 — 제품 로드 후 호출
   ============================================================ */
function buildDynamicFilters() {
  const WEIGHT_ORDER = ['250g','500g','912g','1kg','1.5kg','1.87kg','2.27kg','2.5kg'];

  ALL_FLAVORS = [...new Set(PRODUCTS.map(p => p.flavor).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  ALL_WEIGHTS = [...new Set(PRODUCTS.map(p => p.weight).filter(Boolean))]
    .sort((a, b) => {
      const ai = WEIGHT_ORDER.indexOf(a), bi = WEIGHT_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  state.flavors = new Set(ALL_FLAVORS);
  state.weights = new Set(ALL_WEIGHTS);

  function buildGroup(containerId, allCbId, cbClass, items) {
    const group = el(containerId);
    group.textContent = '';

    const allLabel = document.createElement('label');
    allLabel.className = 'filter-sheet-item select-all-item';
    const allCb = document.createElement('input');
    allCb.type = 'checkbox'; allCb.id = allCbId; allCb.checked = true;
    const allSpan = document.createElement('span');
    allSpan.textContent = '전체 선택';
    allLabel.append(allCb, allSpan);
    group.appendChild(allLabel);

    items.forEach(val => {
      const label = document.createElement('label');
      label.className = 'filter-sheet-item checked';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = cbClass; cb.value = val; cb.checked = true;
      const span = document.createElement('span');
      span.textContent = val;
      label.append(cb, span);
      group.appendChild(label);
    });
  }

  buildGroup('flavorFilterGroup', 'flavorSelectAll', 'flavor-cb', ALL_FLAVORS);
  buildGroup('weightFilterGroup', 'weightSelectAll', 'weight-cb', ALL_WEIGHTS);
}

function initListeners() {
  const searchInput  = el('searchInput');
  const sheetOverlay = el('sheetOverlay');
  const sortSheet    = el('sortSheet');
  const filterSheet  = el('filterSheet');
  const sortLabel    = el('sortLabel');

  /* 검색 (debounce 250ms) */
  const debouncedRender = debounce(() => { state.search = searchInput.value.trim(); render(); }, 250);
  searchInput.addEventListener('input', debouncedRender);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(); state.search = searchInput.value.trim(); render(); } });
  el('searchBtn').addEventListener('click', () => { state.search = searchInput.value.trim(); render(); });

  /* 상품 상세 시트 이벤트 위임 (detail-buy-btn, js-open-event) */
  el('detailSheetInner').addEventListener('click', e => {
    const buyBtn = e.target.closest('.detail-buy-btn');
    if (buyBtn) { handleBuyClick(buyBtn.dataset.link); return; }
    if (e.target.closest('.js-open-event')) { openEventSheet(); }
  });

  /* 카테고리 탭 — 이벤트 버튼은 시트 오픈, 나머지는 카테고리 필터 */
  el('categoryFilter').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    if (tab.id === 'eventBtn') { openEventSheet(); return; }
    document.querySelectorAll('#categoryFilter .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.category = tab.dataset.category;
    state.subCat   = null;
    renderSubcatChips();
    render();
  });

  /* 세부 카테고리 칩 */
  el('subcatChips').addEventListener('click', e => {
    const chip = e.target.closest('.subcat-chip');
    if (!chip) return;
    state.subCat = chip.dataset.val || null;
    renderSubcatChips();
    render();
  });

  /* 품절제외 */
  el('filterActive').addEventListener('change', e => { state.activeOnly = e.target.checked; render(); });

  /* 오버레이 → 열려 있는 시트 닫기 */
  sheetOverlay.addEventListener('click', () => {
    [sortSheet, filterSheet, el('cartSheet'), el('userSheet'), el('detailSheet'), el('eventSheet')]
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
      sortLabel.textContent = btn.textContent.replace('✓', '').trim();
      closeSheet(sortSheet, sheetOverlay);
      render();
    });
  });

  /* 필터 시트 — 브랜드 + 종류 + 맛 + 용량 */
  const brandCbs  = initCheckboxGroup('brandSelectAll',  'brand-cb');
  const typeCbs   = initCheckboxGroup('typeSelectAll',   'type-cb');
  const flavorCbs = initCheckboxGroup('flavorSelectAll', 'flavor-cb');
  const weightCbs = initCheckboxGroup('weightSelectAll', 'weight-cb');

  el('filterBtn').addEventListener('click', () => openSheet(filterSheet, sheetOverlay));
  el('filterSheetClose').addEventListener('click', () => closeSheet(filterSheet, sheetOverlay));

  el('filterReset').addEventListener('click', () => {
    [brandCbs, typeCbs, flavorCbs, weightCbs].forEach(cbs => cbs.forEach(cb => {
      cb.checked = true;
      cb.closest('.filter-sheet-item').classList.add('checked');
    }));
    ['brandSelectAll','typeSelectAll','flavorSelectAll','weightSelectAll'].forEach(id => {
      const cb = el(id);
      cb.checked = true;
      cb.closest('.filter-sheet-item').classList.add('checked');
    });
  });
  el('filterApply').addEventListener('click', () => {
    state.brands       = new Set([...brandCbs].filter(cb => cb.checked).map(cb => cb.value));
    state.productTypes = new Set([...typeCbs].filter(cb => cb.checked).map(cb => cb.value));
    state.flavors      = new Set([...flavorCbs].filter(cb => cb.checked).map(cb => cb.value));
    state.weights      = new Set([...weightCbs].filter(cb => cb.checked).map(cb => cb.value));
    updateFilterCount();
    closeSheet(filterSheet, sheetOverlay);
    render();
  });

  /* 빈 상태 초기화 */
  el('resetFilters').addEventListener('click', () => {
    state = { search:'', category:'all', subCat:null, activeOnly:false, sort:'price_asc', brands:new Set(ALL_BRANDS), productTypes:new Set(ALL_PRODUCT_TYPES), flavors:new Set(ALL_FLAVORS), weights:new Set(ALL_WEIGHTS), activeEventIds:new Set(EVENTS.map(e => e.id)) };
    searchInput.value = '';
    document.querySelectorAll('#categoryFilter .tab').forEach((t,i) => t.classList.toggle('active', i===0));
    el('filterActive').checked = false;
    sortLabel.textContent = '가격 낮은순';
    document.querySelectorAll('.sort-option').forEach((b,i) => b.classList.toggle('active', i===0));
    renderSubcatChips();
    updateFilterCount();
    render();
  });

  /* 이벤트 칩 토글 */
  el('eventChips').addEventListener('click', e => {
    const btn = e.target.closest('.event-chip');
    if (!btn) return;
    const id = parseInt(btn.dataset.eventId);
    if (state.activeEventIds.has(id)) {
      state.activeEventIds.delete(id);
      btn.classList.remove('active');
    } else {
      state.activeEventIds.add(id);
      btn.classList.add('active');
    }
    render(); // 카드 이벤트 가격 업데이트
  });
  el('eventSheetClose').addEventListener('click', closeEventSheet);

  /* 상품 페이지 뒤로가기 */
  el('productPageBack').addEventListener('click', closeProductPage);
  window.addEventListener('popstate', () => {
    const page = el('productPage');
    if (!page.classList.contains('hidden')) {
      page.classList.remove('page-open');
      page.addEventListener('transitionend', () => {
        page.classList.add('hidden');
        el('productPageBody').textContent = '';
      }, { once: true });
    }
  });

  /* 드래그 투 클로즈 — 모든 바텀시트 */
  setupDragToClose(sortSheet,       () => closeSheet(sortSheet, sheetOverlay));
  setupDragToClose(filterSheet,     () => closeSheet(filterSheet, sheetOverlay));
  setupDragToClose(el('eventSheet'), closeEventSheet);
  setupDragToClose(el('cartSheet'),  closeCartSheet);
  setupDragToClose(el('userSheet'),  closeUserSheet);
  setupDragToClose(el('loginSheet'), closeLoginSheet);

  /* 인증 버튼 */
  el('authBtn').addEventListener('click', openLoginSheet);
  el('cartBtn').addEventListener('click', openCartSheet);
  el('userBtn').addEventListener('click', openUserSheet);
  el('cartSheetClose').addEventListener('click', closeCartSheet);
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
      window.open(pendingProductLink, '_blank', 'noopener,noreferrer');
      pendingProductLink = null;
      closeLoginSheet();
    }
  });

  try {
    await loadProducts();
    buildDynamicFilters();
    renderTop10();
    initListeners();
    renderSubcatChips();
    render();
    showLoading(false);

    // 백그라운드에서 썸네일 크롤링 (비동기)
    loadThumbnailsInBackground().catch(() => {});
  } catch (err) {
    showDbError(err.message);
  }
});
