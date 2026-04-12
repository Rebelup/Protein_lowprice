'use strict';

/* ============================================================
   SUPABASE 설정
   ============================================================ */
const SUPABASE_URL     = 'https://rtminyxkhiwzicwylalp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bWlueXhraGl3emljd3lsYWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODQ4NzYsImV4cCI6MjA5MTU2MDg3Nn0.9j1_o4l41OHjucWctzIulwoWDMRjAJe0yeRqg0piv6I';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
   데이터 (Supabase에서 로드)
   ============================================================ */
let PRODUCTS   = [];
let ALL_BRANDS = [];

const ALL_STORES = ['쿠팡', '마켓컬리', '이마트', '홈플러스', 'GS25', '올리브영', '오늘의식탁'];

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

function unitPrice(price, grams) {
  return Math.round(price / grams) + '원/g';
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.ceil((target - today) / 86400000);
}

const FLAVOR_LABELS = {
  무염:     '🧂 무염',
  오리지널: '🍗 오리지널',
  매운맛:   '🌶️ 매운맛',
  갈릭:     '🧄 갈릭',
  간장:     '🍯 간장',
};
function flavorLabel(f) { return FLAVOR_LABELS[f] || f; }

/* ============================================================
   로딩 / 에러 상태
   ============================================================ */
function showLoading(visible) {
  const overlay = el('loadingOverlay');
  if (overlay) overlay.classList.toggle('hidden', !visible);
}

function showDbError(msg) {
  const grid = el('productGrid');
  if (grid) {
    grid.style.display = 'block';
    grid.innerHTML = `
      <div class="db-error">
        <span>⚠️</span>
        <p>데이터를 불러오지 못했습니다</p>
        <small>Supabase SQL Editor에서 setup.sql을 먼저 실행해주세요.<br/>${msg}</small>
      </div>`;
  }
  showLoading(false);
}

/* ============================================================
   Supabase에서 상품 불러오기
   ============================================================ */
async function loadProducts() {
  const { data, error } = await db
    .from('products')
    .select('*')
    .order('id');

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
    originalPrice: p.original_price,
    salePrice:     p.sale_price,
    expiryDate:    p.expiry_date,
    link:          p.link || '#',
  }));

  ALL_BRANDS       = [...new Set(PRODUCTS.map(p => p.brand))];
  state.brands     = new Set(ALL_BRANDS);
}

/* ============================================================
   STATE
   ============================================================ */
let state = {
  search:      '',
  category:    'all',
  stores:      new Set(ALL_STORES),
  brands:      new Set(),
  flavor:      'all',
  minDiscount: 0,
  priceMin:    null,
  priceMax:    null,
  sort:        'discount',
};

/* ============================================================
   FILTER + SORT
   ============================================================ */
function getFiltered() {
  return PRODUCTS
    .filter(p => {
      const pct = discountPct(p.originalPrice, p.salePrice);
      if (state.search) {
        const q = state.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      }
      if (state.category !== 'all' && p.category !== state.category) return false;
      if (!state.stores.has(p.store)) return false;
      if (!state.brands.has(p.brand)) return false;
      if (state.flavor !== 'all' && p.flavor !== state.flavor) return false;
      if (pct < state.minDiscount) return false;
      if (state.priceMin !== null && p.salePrice < state.priceMin) return false;
      if (state.priceMax !== null && p.salePrice > state.priceMax) return false;
      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'discount')    return discountPct(b.originalPrice, b.salePrice) - discountPct(a.originalPrice, a.salePrice);
      if (state.sort === 'price_asc')  return a.salePrice - b.salePrice;
      if (state.sort === 'price_desc') return b.salePrice - a.salePrice;
      if (state.sort === 'name')       return a.name.localeCompare(b.name, 'ko');
      return 0;
    });
}

/* ============================================================
   RENDER
   ============================================================ */
function badgeLevel(pct) {
  if (pct >= 40) return 'high';
  if (pct >= 25) return 'medium';
  return 'low';
}

function renderCard(p) {
  const pct         = discountPct(p.originalPrice, p.salePrice);
  const days        = daysUntil(p.expiryDate);
  const expiryClass = days <= 3 ? 'expiry-soon' : '';
  const expiryText  = days <= 0 ? '오늘 종료' : days === 1 ? '내일 종료' : `${days}일 남음`;

  return `
    <article class="product-card" data-id="${p.id}">
      <div class="card-badge ${badgeLevel(pct)}">${pct}% 할인</div>
      <div class="card-img-wrap">
        <span>${p.emoji}</span>
        <span class="card-store-badge">${p.store}</span>
      </div>
      <div class="card-body">
        <span class="card-category">${p.category}</span>
        <h2 class="card-name">${p.name}</h2>
        <div class="card-meta-row">
          <p class="card-weight">${p.weight}</p>
          <span class="card-flavor flavor-${p.flavor}">${flavorLabel(p.flavor)}</span>
        </div>
        <div class="card-pricing">
          <p class="card-original-price">${formatKRW(p.originalPrice)}</p>
          <div class="card-price-row">
            <span class="card-sale-price">${formatKRW(p.salePrice)}</span>
            <span class="card-discount-pct">-${pct}%</span>
          </div>
          <p class="card-unit-price">${unitPrice(p.salePrice, p.grams)}</p>
          <p class="card-expiry ${expiryClass}">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            할인 ${expiryText}
          </p>
        </div>
      </div>
      <button class="card-cta" onclick="window.open('${p.link}','_blank')">구매하러 가기</button>
    </article>
  `;
}

function render() {
  const items   = getFiltered();
  const grid    = el('productGrid');
  const empty   = el('emptyState');
  const countEl = el('resultCount');

  countEl.textContent = items.length;
  grid.innerHTML = items.map(renderCard).join('');

  if (items.length === 0) {
    empty.style.display        = 'flex';
    empty.style.flexDirection  = 'column';
    empty.style.alignItems     = 'center';
    empty.style.justifyContent = 'center';
    grid.style.display = 'none';
  } else {
    empty.style.display = 'none';
    grid.style.display  = 'grid';
  }
}

function updateHeroStats() {
  const pcts = PRODUCTS.map(p => discountPct(p.originalPrice, p.salePrice));
  el('totalProducts').textContent = PRODUCTS.length;
  el('avgDiscount').textContent   = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  el('maxDiscount').textContent   = pcts.length ? Math.max(...pcts) : 0;
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function initListeners() {
  // 검색
  const searchInput = el('searchInput');
  const searchBtn   = el('searchBtn');
  function doSearch() {
    state.search = searchInput.value.trim();
    render();
  }
  searchInput.addEventListener('input', doSearch);
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // 카테고리
  el('categoryFilter').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#categoryFilter .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.category = chip.dataset.category;
    render();
  });

  // 판매처
  el('storeFilter').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) state.stores.add(e.target.value);
    else state.stores.delete(e.target.value);
    render();
  });

  // 브랜드
  el('brandFilter') && el('brandFilter').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) state.brands.add(e.target.value);
    else state.brands.delete(e.target.value);
    render();
  });

  // 양념 스타일
  el('flavorFilter') && el('flavorFilter').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#flavorFilter .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.flavor = chip.dataset.flavor;
    render();
  });

  // 최소 할인율
  const rangeInput = el('discountRange');
  const rangeLabel = el('discountRangeLabel');
  rangeInput.addEventListener('input', () => {
    state.minDiscount = parseInt(rangeInput.value, 10);
    rangeLabel.textContent = `${state.minDiscount}% 이상`;
    render();
  });

  // 가격대
  el('priceMin').addEventListener('input', e => {
    state.priceMin = e.target.value ? parseInt(e.target.value, 10) : null;
    render();
  });
  el('priceMax').addEventListener('input', e => {
    state.priceMax = e.target.value ? parseInt(e.target.value, 10) : null;
    render();
  });

  // 정렬
  el('sortSelect').addEventListener('change', e => {
    state.sort = e.target.value;
    render();
  });

  // 필터 초기화
  el('resetFilters').addEventListener('click', () => {
    state = {
      search:      '',
      category:    'all',
      stores:      new Set(ALL_STORES),
      brands:      new Set(ALL_BRANDS),
      flavor:      'all',
      minDiscount: 0,
      priceMin:    null,
      priceMax:    null,
      sort:        state.sort,
    };
    el('searchInput').value = '';
    document.querySelectorAll('#categoryFilter .chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    document.querySelectorAll('#storeFilter input[type="checkbox"]').forEach(cb => (cb.checked = true));
    document.querySelectorAll('#brandFilter input[type="checkbox"]').forEach(cb => (cb.checked = true));
    document.querySelectorAll('#flavorFilter .chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    el('discountRange').value = 0;
    el('discountRangeLabel').textContent = '0% 이상';
    el('priceMin').value = '';
    el('priceMax').value = '';
    render();
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);
  try {
    await loadProducts();
    updateHeroStats();
    initListeners();
    render();
    showLoading(false);
  } catch (err) {
    showDbError(err.message);
  }
});
