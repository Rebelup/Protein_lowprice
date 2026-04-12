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
let PRODUCTS = [];

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

/** 판매처 → 배송 배지 */
function deliveryInfo(store) {
  if (store === '쿠팡')     return { label: '🚀 로켓배송',  cls: 'rocket' };
  if (store === '마켓컬리') return { label: '🌿 새벽배송',  cls: 'fresh'  };
  return                           { label: `📦 ${store}`,   cls: 'normal' };
}

/** 상품 ID 기반 의사-랜덤 "N명 추가" */
function viewerCount(id) {
  return ((id * 7 + 3) % 19) + 3;
}

/* ============================================================
   STATE
   ============================================================ */
const ALL_STORES = ['쿠팡', '마켓컬리', '이마트', '홈플러스', 'GS25', '올리브영', '오늘의식탁'];

let state = {
  search:      '',
  category:    'all',
  rocketOnly:  false,
  activeOnly:  false,
  sort:        'discount',
  stores:      new Set(ALL_STORES),
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
   Supabase 로드
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
    thumbnail:     p.thumbnail || null,
    originalPrice: p.original_price,
    salePrice:     p.sale_price,
    expiryDate:    p.expiry_date,
    link:          p.link || '#',
  }));
}

/* ============================================================
   필터 + 정렬
   ============================================================ */
function getFiltered() {
  return PRODUCTS
    .filter(p => {
      if (state.search) {
        const q = state.search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      }
      if (state.category !== 'all' && p.category !== state.category) return false;
      if (!state.stores.has(p.store)) return false;
      if (state.rocketOnly && p.store !== '쿠팡') return false;
      if (state.activeOnly && daysUntil(p.expiryDate) <= 0) return false;
      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'discount')    return discountPct(b.originalPrice, b.salePrice) - discountPct(a.originalPrice, a.salePrice);
      if (state.sort === 'price_asc')   return a.salePrice - b.salePrice;
      if (state.sort === 'price_desc')  return b.salePrice - a.salePrice;
      if (state.sort === 'name')        return a.name.localeCompare(b.name, 'ko');
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

    return `
      <div class="top10-card" onclick="window.open('${p.link}', '_blank')">
        <div class="top10-img-wrap">
          ${pct >= 25 ? '<span class="badge-yeokdaegup">역대급</span>' : ''}
          ${p.thumbnail
            ? `<img src="${p.thumbnail}" alt="${p.name}" loading="lazy"
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
  const showBadge = pct >= 30;

  return `
    <article class="product-card" onclick="window.open('${p.link}', '_blank')">
      <div class="card-img-wrap">
        ${showBadge ? '<div class="badge-lowprice">역대급최저가<br>구매타이밍</div>' : ''}
        ${p.thumbnail
          ? `<img src="${p.thumbnail}" alt="${p.name}" loading="lazy"
               onerror="this.style.display='none';this.nextSibling.style.display='flex'" />
             <span class="card-img-fallback" style="display:none">${p.emoji}</span>`
          : `<span class="card-img-fallback">${p.emoji}</span>`
        }
        <button class="add-btn"
          onclick="event.stopPropagation(); window.open('${p.link}', '_blank')"
          aria-label="장바구니 담기">+</button>
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
   필터 배지 카운트 업데이트
   ============================================================ */
function updateFilterCount() {
  const deselected = ALL_STORES.length - state.stores.size;
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
   이벤트 리스너
   ============================================================ */
function initListeners() {
  const searchInput  = el('searchInput');
  const sheetOverlay = el('sheetOverlay');
  const sortSheet    = el('sortSheet');
  const filterSheet  = el('filterSheet');
  const sortLabel    = el('sortLabel');

  /* ---------- 검색 ---------- */
  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim();
    render();
  });
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') render(); });
  el('searchBtn').addEventListener('click', () => render());

  /* ---------- 카테고리 탭 ---------- */
  el('categoryFilter').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('#categoryFilter .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.category = tab.dataset.category;
    render();
  });

  /* ---------- 로켓배송 / 품절제외 ---------- */
  el('filterRocket').addEventListener('change', e => { state.rocketOnly = e.target.checked; render(); });
  el('filterActive').addEventListener('change', e => { state.activeOnly = e.target.checked; render(); });

  /* ---------- 오버레이 ---------- */
  sheetOverlay.addEventListener('click', () => {
    sortSheet.classList.add('hidden');
    filterSheet.classList.add('hidden');
    sheetOverlay.classList.add('hidden');
  });

  /* ---------- 정렬 바텀시트 ---------- */
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

  /* ---------- 필터 바텀시트 ---------- */
  const selectAllCb    = el('storeSelectAll');
  const selectAllLabel = selectAllCb.closest('.filter-sheet-item');
  const storeCbs       = document.querySelectorAll('.store-cb');

  // 초기 시각 상태 설정
  selectAllLabel.classList.add('checked');
  storeCbs.forEach(cb => cb.closest('.filter-sheet-item').classList.add('checked'));

  // 전체 선택 토글
  selectAllLabel.addEventListener('click', () => {
    const willCheck = !selectAllCb.checked;
    selectAllCb.checked = willCheck;
    selectAllLabel.classList.toggle('checked', willCheck);
    storeCbs.forEach(cb => {
      cb.checked = willCheck;
      cb.closest('.filter-sheet-item').classList.toggle('checked', willCheck);
    });
  });

  // 개별 스토어 토글
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

  // 필터 초기화 (시트 내)
  el('filterReset').addEventListener('click', () => {
    selectAllCb.checked = true;
    selectAllLabel.classList.add('checked');
    storeCbs.forEach(cb => {
      cb.checked = true;
      cb.closest('.filter-sheet-item').classList.add('checked');
    });
  });

  // 적용하기
  el('filterApply').addEventListener('click', () => {
    state.stores = new Set([...storeCbs].filter(cb => cb.checked).map(cb => cb.value));
    updateFilterCount();
    filterSheet.classList.add('hidden');
    sheetOverlay.classList.add('hidden');
    render();
  });

  /* ---------- 빈 상태 필터 초기화 ---------- */
  el('resetFilters').addEventListener('click', () => {
    state.search     = '';
    state.category   = 'all';
    state.rocketOnly = false;
    state.activeOnly = false;
    state.sort       = 'discount';
    state.stores     = new Set(ALL_STORES);

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
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  showLoading(true);
  try {
    await loadProducts();
    renderTop10();
    initListeners();
    render();
    showLoading(false);
  } catch (err) {
    showDbError(err.message);
  }
});
