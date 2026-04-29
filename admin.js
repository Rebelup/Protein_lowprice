const SUPABASE_URL = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const ADMIN_EMAIL = 'fightingman012@gmail.com';

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
  const { data, error } = await sb.from('categories').select('*').order('order_index').order('name');
  const list = document.getElementById('cat-list');
  if (error) { list.innerHTML = '<div class="loading">오류: ' + error.message + '</div>'; return; }
  if (!data || !data.length) { list.innerHTML = '<div class="loading">카테고리가 없어요</div>'; return; }
  list.innerHTML = data.map(c => `
    <div class="cat-item" id="cat-${c.id}">
      <span class="cat-item-order">${c.order_index ?? '-'}</span>
      <span class="cat-item-name">${escHtml(c.name)}</span>
      <button class="btn btn-danger" style="padding:6px 14px;font-size:13px" onclick="deleteCategory('${c.id}', '${escHtml(c.name)}')">삭제</button>
    </div>`).join('');
}

async function addCategory() {
  const name = document.getElementById('cat-name').value.trim();
  const order = parseInt(document.getElementById('cat-order').value) || 0;
  if (!name) { alert('카테고리 이름을 입력해주세요'); return; }
  const { error } = await sb.from('categories').insert({ name, order_index: order });
  if (error) { alert('추가 실패: ' + error.message); return; }
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-order').value = '';
  await loadCategories();
}

async function deleteCategory(id, name) {
  if (!confirm(`"${name}" 카테고리를 삭제할까요?\n해당 카테고리의 게시물은 카테고리가 해제됩니다.`)) return;
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
