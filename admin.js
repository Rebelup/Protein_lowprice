const SUPABASE_URL = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const ADMIN_EMAIL = 'fightingman012@gmail.com';

let categories = [];

async function initAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const email = session.user.email;
    if (email !== ADMIN_EMAIL) {
      document.getElementById('error-msg').textContent = '접근 권한이 없습니다.';
      await sb.auth.signOut();
      return;
    }
    showAdminApp(email);
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      const email = session.user.email;
      if (email !== ADMIN_EMAIL) {
        document.getElementById('error-msg').textContent = '접근 권한이 없습니다. (' + email + ')';
        await sb.auth.signOut();
        return;
      }
      if (window.location.hash.includes('access_token')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      showAdminApp(email);
    } else if (event === 'SIGNED_OUT') {
      document.getElementById('admin-app').style.display = 'none';
      document.getElementById('auth-screen').style.display = 'flex';
    }
  });
}

function showAdminApp(email) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'block';
  document.getElementById('admin-email').textContent = email;
  loadCategories();
  loadAnalytics();
}

async function loadAnalytics() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // Today's date range (KST = UTC+9)
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const todayStr = kstNow.toISOString().slice(0, 10);
  const todayStart = todayStr + 'T00:00:00+09:00';
  const todayEnd = todayStr + 'T23:59:59+09:00';

  // All visits
  const { data: allVisits, error } = await sb.from('page_visits').select('ip, session_id, visited_at, left_at');
  if (error) { set('stat-today', '오류'); return; }

  const visits = allVisits || [];

  // Today's unique IPs
  const todayVisits = visits.filter(v => {
    const d = new Date(v.visited_at);
    const kd = new Date(d.getTime() + kstOffset);
    return kd.toISOString().slice(0, 10) === todayStr;
  });
  const todayIps = new Set(todayVisits.map(v => v.ip).filter(Boolean));
  set('stat-today', todayIps.size || todayVisits.length);
  set('stat-today-sub', `세션 ${todayVisits.length}건`);

  // Retention: IPs that visited before today AND also today
  const prevVisits = visits.filter(v => {
    const d = new Date(v.visited_at);
    const kd = new Date(d.getTime() + kstOffset);
    return kd.toISOString().slice(0, 10) < todayStr;
  });
  const prevIps = new Set(prevVisits.map(v => v.ip).filter(Boolean));
  const returningToday = [...todayIps].filter(ip => prevIps.has(ip)).length;
  const retentionPct = todayIps.size > 0 ? Math.round(returningToday / todayIps.size * 100) : 0;
  set('stat-retention', retentionPct + '%');
  set('stat-retention-sub', `재방문 ${returningToday}명`);

  // Average session duration (sessions with both visited_at and left_at)
  const withDuration = visits.filter(v => v.visited_at && v.left_at);
  if (withDuration.length > 0) {
    const totalMs = withDuration.reduce((sum, v) => {
      return sum + (new Date(v.left_at) - new Date(v.visited_at));
    }, 0);
    const avgSec = Math.round(totalMs / withDuration.length / 1000);
    const mins = Math.floor(avgSec / 60);
    const secs = avgSec % 60;
    set('stat-duration', mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`);
    set('stat-duration-sub', `${withDuration.length}건 기준`);
  } else {
    set('stat-duration', '—');
    set('stat-duration-sub', '데이터 없음');
  }

  // Total unique IPs
  const allIps = new Set(visits.map(v => v.ip).filter(Boolean));
  set('stat-total', allIps.size || visits.length);
  set('stat-total-sub', `세션 ${visits.length}건`);
}

async function adminLogin() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) document.getElementById('error-msg').textContent = error.message;
}

async function adminLogout() {
  await sb.auth.signOut();
}

async function loadCategories() {
  const list = document.getElementById('cat-list');
  const { data, error } = await sb.from('categories').select('*').order('order_index').order('name');
  if (error) { list.innerHTML = '<div class="empty">오류: ' + escHtml(error.message) + '</div>'; return; }
  categories = data || [];
  renderCategories();
}

function renderCategories() {
  const list = document.getElementById('cat-list');
  if (!categories.length) { list.innerHTML = '<div class="empty">카테고리가 없어요</div>'; return; }
  list.innerHTML = categories.map((c, i) => `
    <div class="cat-item" data-id="${c.id}">
      <div class="cat-row">
        <span class="cat-order-badge">${c.order_index ?? i}</span>
        <span class="cat-name">${escHtml(c.name)}</span>
        <div class="cat-actions">
          <button class="move-btn" onclick="moveCategory('${c.id}', -1)" title="위로"${i === 0 ? ' disabled' : ''}>↑</button>
          <button class="move-btn" onclick="moveCategory('${c.id}', 1)" title="아래로"${i === categories.length - 1 ? ' disabled' : ''}>↓</button>
          <button class="btn btn-sm btn-ghost" onclick="toggleEdit('${c.id}')">수정</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCategory('${c.id}')">삭제</button>
        </div>
      </div>
      <div class="edit-row" id="edit-${c.id}">
        <input type="number" id="edit-order-${c.id}" value="${c.order_index ?? i}" min="0" style="width:60px">
        <input type="text" id="edit-name-${c.id}" value="${escHtml(c.name)}">
        <button class="btn btn-sm btn-primary" onclick="saveEdit('${c.id}')">저장</button>
        <button class="btn btn-sm btn-outline" onclick="toggleEdit('${c.id}')">취소</button>
      </div>
    </div>`).join('');
}

function toggleEdit(id) {
  const row = document.getElementById('edit-' + id);
  if (!row) return;
  row.classList.toggle('open');
  if (row.classList.contains('open')) {
    const nameInput = document.getElementById('edit-name-' + id);
    if (nameInput) { nameInput.focus(); nameInput.select(); }
  }
}

async function saveEdit(id) {
  const nameEl = document.getElementById('edit-name-' + id);
  const orderEl = document.getElementById('edit-order-' + id);
  const name = nameEl.value.trim();
  const order = parseInt(orderEl.value);
  if (!name) { alert('이름을 입력해주세요'); return; }
  const { error } = await sb.from('categories').update({ name, order_index: isNaN(order) ? 0 : order }).eq('id', id);
  if (error) { alert('수정 실패: ' + error.message); return; }
  await loadCategories();
}

async function moveCategory(id, direction) {
  const idx = categories.findIndex(c => c.id === id);
  if (idx < 0) return;
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= categories.length) return;

  const a = categories[idx];
  const b = categories[swapIdx];

  const results = await Promise.all([
    sb.from('categories').update({ order_index: swapIdx }).eq('id', a.id),
    sb.from('categories').update({ order_index: idx }).eq('id', b.id),
  ]);
  const err = results.find(r => r.error)?.error;
  if (err) { alert('순서 변경 실패: ' + err.message); return; }
  await loadCategories();
}

async function addCategory() {
  const name = document.getElementById('cat-name').value.trim();
  const orderVal = document.getElementById('cat-order').value;
  if (!name) { alert('카테고리 이름을 입력해주세요'); return; }
  const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.order_index ?? 0)) + 1 : 0;
  const order = orderVal !== '' ? parseInt(orderVal) : maxOrder;
  const { error } = await sb.from('categories').insert({ name, order_index: isNaN(order) ? maxOrder : order });
  if (error) { alert('추가 실패: ' + error.message); return; }
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-order').value = '';
  await loadCategories();
}

async function deleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  const name = cat ? cat.name : '이 카테고리';
  if (!confirm('"' + name + '" 카테고리를 삭제할까요?\n해당 카테고리의 게시물은 카테고리가 해제됩니다.')) return;
  const { error } = await sb.from('categories').delete().eq('id', id);
  if (error) { alert('삭제 실패: ' + error.message); return; }
  await loadCategories();
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

initAdmin();
