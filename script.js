'use strict';

/* ============================================================
   DATA — 닭가슴살 할인 상품 목록 (mock)
   ============================================================ */
const PRODUCTS = [
  {
    id: 1,
    name: '하림 IFF 닭가슴살 훈제 슬라이스',
    brand: '하림',
    store: '쿠팡',
    category: '훈제',
    flavor: '오리지널',
    weight: '200g×5팩',
    grams: 1000,
    emoji: '🍗',
    originalPrice: 18900,
    salePrice: 12900,
    expiryDate: '2026-04-20',
    link: '#',
  },
  {
    id: 2,
    name: '동원 닭가슴살 통조림 135g',
    brand: '동원',
    store: '이마트',
    category: '통조림',
    flavor: '무염',
    weight: '135g×6캔',
    grams: 810,
    emoji: '🥫',
    originalPrice: 14400,
    salePrice: 8990,
    expiryDate: '2026-04-30',
    link: '#',
  },
  {
    id: 3,
    name: '랭킹닭컴 오리지널 훈제 닭가슴살',
    brand: '랭킹닭컴',
    store: '마켓컬리',
    category: '훈제',
    flavor: '오리지널',
    weight: '100g×10개',
    grams: 1000,
    emoji: '🍗',
    originalPrice: 22000,
    salePrice: 15400,
    expiryDate: '2026-04-15',
    link: '#',
  },
  {
    id: 4,
    name: '맘스터치 닭가슴살 스테이크 오리지널',
    brand: '맘스터치',
    store: '홈플러스',
    category: '냉장',
    flavor: '오리지널',
    weight: '150g×3팩',
    grams: 450,
    emoji: '🥩',
    originalPrice: 12000,
    salePrice: 7990,
    expiryDate: '2026-04-18',
    link: '#',
  },
  {
    id: 5,
    name: '바디닭 저염 닭가슴살 큐브',
    brand: '바디닭',
    store: '쿠팡',
    category: '냉동',
    flavor: '무염',
    weight: '1kg',
    grams: 1000,
    emoji: '❄️',
    originalPrice: 19900,
    salePrice: 13900,
    expiryDate: '2026-05-10',
    link: '#',
  },
  {
    id: 6,
    name: 'GS25 닭가슴살 샐러드 도시락',
    brand: 'GS25',
    store: 'GS25',
    category: '냉장',
    flavor: '오리지널',
    weight: '250g',
    grams: 250,
    emoji: '🥗',
    originalPrice: 5500,
    salePrice: 3990,
    expiryDate: '2026-04-13',
    link: '#',
  },
  {
    id: 7,
    name: '오뚜기 진짜닭가슴살 볼 스파이시',
    brand: '오뚜기',
    store: '이마트',
    category: '가공',
    flavor: '매운맛',
    weight: '200g',
    grams: 200,
    emoji: '🌶️',
    originalPrice: 6900,
    salePrice: 4490,
    expiryDate: '2026-05-01',
    link: '#',
  },
  {
    id: 8,
    name: '닭신 냉동 닭가슴살 무염',
    brand: '닭신',
    store: '오늘의식탁',
    category: '냉동',
    flavor: '무염',
    weight: '500g×2팩',
    grams: 1000,
    emoji: '❄️',
    originalPrice: 17500,
    salePrice: 11900,
    expiryDate: '2026-06-30',
    link: '#',
  },
  {
    id: 9,
    name: '풀무원 닭가슴살 소시지',
    brand: '풀무원',
    store: '마켓컬리',
    category: '가공',
    flavor: '오리지널',
    weight: '300g',
    grams: 300,
    emoji: '🌭',
    originalPrice: 7800,
    salePrice: 5200,
    expiryDate: '2026-04-25',
    link: '#',
  },
  {
    id: 10,
    name: '프레시지 닭가슴살 샐러드 키트',
    brand: '프레시지',
    store: '쿠팡',
    category: '냉장',
    flavor: '오리지널',
    weight: '350g',
    grams: 350,
    emoji: '🥗',
    originalPrice: 9900,
    salePrice: 6390,
    expiryDate: '2026-04-16',
    link: '#',
  },
  {
    id: 11,
    name: '하림 닭가슴살 훈제 통구이',
    brand: '하림',
    store: '홈플러스',
    category: '훈제',
    flavor: '오리지널',
    weight: '250g',
    grams: 250,
    emoji: '🍗',
    originalPrice: 8200,
    salePrice: 5590,
    expiryDate: '2026-04-28',
    link: '#',
  },
  {
    id: 12,
    name: '사조 닭가슴살 캔 (물담금)',
    brand: '사조',
    store: '이마트',
    category: '통조림',
    flavor: '무염',
    weight: '200g×3캔',
    grams: 600,
    emoji: '🥫',
    originalPrice: 9600,
    salePrice: 5990,
    expiryDate: '2026-07-01',
    link: '#',
  },
  {
    id: 13,
    name: '바디닭 스파이시 훈제 닭가슴살',
    brand: '바디닭',
    store: '올리브영',
    category: '훈제',
    flavor: '매운맛',
    weight: '100g×5개',
    grams: 500,
    emoji: '🌶️',
    originalPrice: 13500,
    salePrice: 9990,
    expiryDate: '2026-04-22',
    link: '#',
  },
  {
    id: 14,
    name: '랭킹닭컴 닭가슴살 스테이크 갈릭',
    brand: '랭킹닭컴',
    store: '쿠팡',
    category: '냉장',
    flavor: '갈릭',
    weight: '130g×5팩',
    grams: 650,
    emoji: '🧄',
    originalPrice: 16500,
    salePrice: 10900,
    expiryDate: '2026-04-17',
    link: '#',
  },
  {
    id: 15,
    name: 'CJ 더건강한 닭가슴살 한입볼',
    brand: 'CJ',
    store: '마켓컬리',
    category: '가공',
    flavor: '오리지널',
    weight: '450g',
    grams: 450,
    emoji: '🍢',
    originalPrice: 11900,
    salePrice: 8490,
    expiryDate: '2026-05-05',
    link: '#',
  },
  {
    id: 16,
    name: '닭신 양념 닭가슴살 간장구이',
    brand: '닭신',
    store: '오늘의식탁',
    category: '냉장',
    flavor: '간장',
    weight: '200g×4팩',
    grams: 800,
    emoji: '🍗',
    originalPrice: 19800,
    salePrice: 13500,
    expiryDate: '2026-04-24',
    link: '#',
  },
];

const ALL_BRANDS = [...new Set(PRODUCTS.map(p => p.brand))];

/* ============================================================
   HELPERS
   ============================================================ */
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
  const today = new Date('2026-04-12');
  const target = new Date(dateStr);
  return Math.ceil((target - today) / 86400000);
}

const FLAVOR_LABELS = {
  무염: '🧂 무염',
  오리지널: '🍗 오리지널',
  매운맛: '🌶️ 매운맛',
  갈릭: '🧄 갈릭',
  간장: '🍯 간장',
};
function flavorLabel(f) {
  return FLAVOR_LABELS[f] || f;
}

/* ============================================================
   STATE
   ============================================================ */
let state = {
  search: '',
  category: 'all',
  stores: new Set(['쿠팡', '마켓컬리', '이마트', '홈플러스', 'GS25', '올리브영', '오늘의식탁']),
  brands: new Set(ALL_BRANDS),
  flavor: 'all',
  minDiscount: 0,
  priceMin: null,
  priceMax: null,
  sort: 'discount',
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
      if (state.sort === 'discount') return discountPct(b.originalPrice, b.salePrice) - discountPct(a.originalPrice, a.salePrice);
      if (state.sort === 'price_asc') return a.salePrice - b.salePrice;
      if (state.sort === 'price_desc') return b.salePrice - a.salePrice;
      if (state.sort === 'name') return a.name.localeCompare(b.name, 'ko');
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
  const pct = discountPct(p.originalPrice, p.salePrice);
  const days = daysUntil(p.expiryDate);
  const expiryClass = days <= 3 ? 'expiry-soon' : '';
  const expiryText = days <= 0 ? '오늘 종료' : days === 1 ? '내일 종료' : `${days}일 남음`;

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
  const items = getFiltered();
  const grid = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');
  const countEl = document.getElementById('resultCount');

  countEl.textContent = items.length;
  grid.innerHTML = items.map(renderCard).join('');

  if (items.length === 0) {
    empty.style.display = 'flex';
    empty.style.flexDirection = 'column';
    empty.style.alignItems = 'center';
    empty.style.justifyContent = 'center';
    grid.style.display = 'none';
  } else {
    empty.style.display = 'none';
    grid.style.display = 'grid';
  }
}

function updateHeroStats() {
  const pcts = PRODUCTS.map(p => discountPct(p.originalPrice, p.salePrice));
  document.getElementById('totalProducts').textContent = PRODUCTS.length;
  document.getElementById('avgDiscount').textContent = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  document.getElementById('maxDiscount').textContent = Math.max(...pcts);
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function initListeners() {
  // Search
  const searchInput = document.getElementById('searchInput');
  const searchBtn   = document.getElementById('searchBtn');
  function doSearch() {
    state.search = searchInput.value.trim();
    render();
  }
  searchInput.addEventListener('input', doSearch);
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // Category chips
  document.getElementById('categoryFilter').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#categoryFilter .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.category = chip.dataset.category;
    render();
  });

  // Store checkboxes
  document.getElementById('storeFilter').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) state.stores.add(e.target.value);
    else state.stores.delete(e.target.value);
    render();
  });

  // Brand checkboxes
  document.getElementById('brandFilter').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    if (e.target.checked) state.brands.add(e.target.value);
    else state.brands.delete(e.target.value);
    render();
  });

  // Flavor chips
  document.getElementById('flavorFilter').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('#flavorFilter .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.flavor = chip.dataset.flavor;
    render();
  });

  // Discount range
  const rangeInput = document.getElementById('discountRange');
  const rangeLabel = document.getElementById('discountRangeLabel');
  rangeInput.addEventListener('input', () => {
    state.minDiscount = parseInt(rangeInput.value, 10);
    rangeLabel.textContent = `${state.minDiscount}% 이상`;
    render();
  });

  // Price inputs
  document.getElementById('priceMin').addEventListener('input', e => {
    state.priceMin = e.target.value ? parseInt(e.target.value, 10) : null;
    render();
  });
  document.getElementById('priceMax').addEventListener('input', e => {
    state.priceMax = e.target.value ? parseInt(e.target.value, 10) : null;
    render();
  });

  // Sort
  document.getElementById('sortSelect').addEventListener('change', e => {
    state.sort = e.target.value;
    render();
  });

  // Reset
  document.getElementById('resetFilters').addEventListener('click', () => {
    state = {
      search: '',
      category: 'all',
      stores: new Set(['쿠팡', '마켓컬리', '이마트', '홈플러스', 'GS25', '올리브영', '오늘의식탁']),
      brands: new Set(ALL_BRANDS),
      flavor: 'all',
      minDiscount: 0,
      priceMin: null,
      priceMax: null,
      sort: state.sort,
    };
    // Reset UI
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('#categoryFilter .chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    document.querySelectorAll('#storeFilter input[type="checkbox"]').forEach(cb => (cb.checked = true));
    document.querySelectorAll('#brandFilter input[type="checkbox"]').forEach(cb => (cb.checked = true));
    document.querySelectorAll('#flavorFilter .chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    document.getElementById('discountRange').value = 0;
    document.getElementById('discountRangeLabel').textContent = '0% 이상';
    document.getElementById('priceMin').value = '';
    document.getElementById('priceMax').value = '';
    render();
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  updateHeroStats();
  initListeners();
  render();
});
