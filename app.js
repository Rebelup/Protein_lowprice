// ── Supabase 설정 ──
const SUPABASE_URL = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 앱 상태 ──
const state = {
  user: null,
  profile: null,
  selectedDate: new Date(),
  routines: [],
  routineLogs: {},   // { routineId: boolean }
  posts: [],
  postLikes: new Set(),
  streak: 0,
  innerTab: 'routine',
  periodMenuOpen: false,
  itemCount: 0,
};

// ── 초기화 ──
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    state.user = session.user;
    await loadAll();
    showApp();
  } else {
    showAuth();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      state.user = session.user;
      await loadAll();
      showApp();
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      state.profile = null;
      showAuth();
    }
  });
}

// ── 인증 ──
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = '이메일과 비밀번호를 입력해주세요.';
    return;
  }

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = '로그인 실패. 이메일/비밀번호를 확인해주세요.';
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  errEl.style.color = '#ef4444';

  if (!username || !email || !password) {
    errEl.textContent = '모든 항목을 입력해주세요.';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = '비밀번호는 6자 이상이어야 합니다.';
    return;
  }

  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    errEl.textContent = '가입 실패: ' + error.message;
  } else {
    errEl.style.color = '#22c55e';
    errEl.textContent = '가입 완료! 이메일 인증 후 로그인해주세요.';
    setTimeout(showLogin, 2000);
  }
}

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
}

// ── 데이터 로딩 ──
async function loadAll() {
  await Promise.all([loadProfile(), loadRoutines(), loadPosts()]);
  await loadRoutineLogsForDate(state.selectedDate);
  await calcStreak();
}

async function loadProfile() {
  if (!state.user) return;
  const { data } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  if (data) state.profile = data;
}

async function loadRoutines() {
  if (!state.user) return;
  const { data } = await sb
    .from('routines')
    .select('*, routine_items(*)')
    .eq('user_id', state.user.id)
    .eq('is_active', true)
    .order('created_at');
  state.routines = data || [];
  state.routines.forEach(r => {
    if (r.routine_items) {
      r.routine_items.sort((a, b) => a.order_index - b.order_index);
    }
  });
}

async function loadRoutineLogsForDate(date) {
  if (!state.user) return;
  const { data } = await sb
    .from('routine_logs')
    .select('*')
    .eq('user_id', state.user.id)
    .eq('log_date', fmtDate(date));

  state.routineLogs = {};
  (data || []).forEach(log => {
    state.routineLogs[log.routine_id] = log.is_complete;
  });
}

async function toggleRoutineComplete(routineId) {
  const wasComplete = state.routineLogs[routineId] === true;
  const isComplete = !wasComplete;

  state.routineLogs[routineId] = isComplete;
  renderRoutineList();

  const { error } = await sb.from('routine_logs').upsert(
    {
      user_id: state.user.id,
      routine_id: routineId,
      log_date: fmtDate(state.selectedDate),
      is_complete: isComplete,
      completed_at: isComplete ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,routine_id,log_date' }
  );

  if (error) {
    state.routineLogs[routineId] = wasComplete;
    renderRoutineList();
  } else {
    await calcStreak();
    document.getElementById('streak-count').textContent = state.streak;
  }
}

async function addRoutine(routineData, items) {
  const { data: routine, error } = await sb
    .from('routines')
    .insert({
      user_id: state.user.id,
      name: routineData.name,
      type: routineData.type,
      days_of_week: routineData.days,
    })
    .select()
    .single();

  if (error || !routine) return;

  if (items.length > 0) {
    await sb.from('routine_items').insert(
      items.map((item, i) => ({
        routine_id: routine.id,
        name: item.name,
        sets: item.sets ? parseInt(item.sets) : null,
        reps: item.reps ? parseInt(item.reps) : null,
        weight: item.weight ? parseFloat(item.weight) : null,
        calories: item.calories ? parseInt(item.calories) : null,
        protein: item.protein ? parseInt(item.protein) : null,
        order_index: i,
      }))
    );
  }

  await loadRoutines();
  renderCalendar();
  renderRoutineList();
}

async function deleteRoutine(routineId) {
  if (!confirm('이 루틴을 삭제할까요?')) return;
  await sb.from('routines').update({ is_active: false }).eq('id', routineId);
  state.routines = state.routines.filter(r => r.id !== routineId);
  delete state.routineLogs[routineId];
  renderCalendar();
  renderRoutineList();
}

async function loadPosts() {
  const { data } = await sb
    .from('posts')
    .select('*, profiles(username)')
    .order('created_at', { ascending: false })
    .limit(50);
  state.posts = data || [];

  if (state.user) {
    const { data: likes } = await sb
      .from('post_likes')
      .select('post_id')
      .eq('user_id', state.user.id);
    state.postLikes = new Set((likes || []).map(l => l.post_id));
  }
}

async function addPost(content) {
  if (!content.trim()) return;
  const { error } = await sb.from('posts').insert({
    user_id: state.user.id,
    content: content.trim(),
  });
  if (!error) {
    await loadPosts();
    renderPosts();
    closeModal('modal-add-post');
  }
}

async function toggleLike(postId) {
  const liked = state.postLikes.has(postId);
  const post = state.posts.find(p => p.id === postId);
  if (!post) return;

  if (liked) {
    state.postLikes.delete(postId);
    post.likes_count = Math.max(0, (post.likes_count || 1) - 1);
    await sb.from('post_likes').delete().match({ post_id: postId, user_id: state.user.id });
  } else {
    state.postLikes.add(postId);
    post.likes_count = (post.likes_count || 0) + 1;
    await sb.from('post_likes').insert({ post_id: postId, user_id: state.user.id });
  }

  await sb.from('posts').update({ likes_count: post.likes_count }).eq('id', postId);
  renderPosts();
}

async function saveProfile() {
  const username = document.getElementById('edit-username').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  if (!username) return;

  const { error } = await sb
    .from('profiles')
    .update({ username, bio, updated_at: new Date().toISOString() })
    .eq('id', state.user.id);

  if (!error) {
    state.profile = { ...state.profile, username, bio };
    renderProfile();
    closeModal('modal-edit-profile');
  }
}

async function calcStreak() {
  if (!state.user) return;
  const { data: logs } = await sb
    .from('routine_logs')
    .select('log_date')
    .eq('user_id', state.user.id)
    .eq('is_complete', true)
    .order('log_date', { ascending: false });

  if (!logs || logs.length === 0) {
    state.streak = 0;
    return;
  }

  const dates = new Set(logs.map(l => l.log_date));
  let streak = 0;
  const check = new Date();
  check.setHours(0, 0, 0, 0);

  while (dates.has(fmtDate(check))) {
    streak++;
    check.setDate(check.getDate() - 1);
  }

  state.streak = streak;
}

// ── 렌더링 ──
function renderAll() {
  updateHeaderMonth();
  renderCalendar();
  renderRoutineList();
  renderPosts();
  renderProfile();
  document.getElementById('streak-count').textContent = state.streak;
}

function updateHeaderMonth() {
  const d = state.selectedDate;
  const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('header-month').textContent =
    `${d.getFullYear()}년 ${months[d.getMonth()]}`;
}

function renderCalendar() {
  const container = document.getElementById('week-days');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = new Date(state.selectedDate);
  sel.setHours(0, 0, 0, 0);

  // 선택된 날짜 기준 주의 월요일 계산
  const dow = sel.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(sel);
  monday.setDate(sel.getDate() + diff);

  const dayNames = ['월','화','수','목','금','토','일'];
  container.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    d.setHours(0, 0, 0, 0);

    const isToday = d.getTime() === today.getTime();
    const isSelected = d.getTime() === sel.getTime();
    const dayNum = d.getDay(); // 0=일
    const hasRoutine = state.routines.some(
      r => r.days_of_week && r.days_of_week.includes(dayNum)
    );

    const col = document.createElement('div');
    col.className = [
      'day-col',
      isToday ? 'today' : '',
      isSelected ? 'selected' : '',
      hasRoutine ? 'has-routine' : '',
    ].filter(Boolean).join(' ');

    col.innerHTML = `
      <span class="day-name">${dayNames[i]}</span>
      <div class="day-num">${d.getDate()}</div>
      <div class="day-dot"></div>
    `;
    col.addEventListener('click', () => selectDate(new Date(d)));
    container.appendChild(col);
  }
}

async function selectDate(date) {
  state.selectedDate = new Date(date);
  updateHeaderMonth();
  renderCalendar();
  await loadRoutineLogsForDate(date);
  renderRoutineList();
}

function renderRoutineList() {
  const container = document.getElementById('routine-list');
  if (!container) return;

  if (state.innerTab === 'todo') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>투두 기능은 곧 추가될 예정이에요!</p>
      </div>`;
    return;
  }

  const dow = state.selectedDate.getDay();
  const dayRoutines = state.routines.filter(
    r => r.days_of_week && r.days_of_week.includes(dow)
  );

  if (dayRoutines.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>오늘 루틴이 없어요<br>+ 버튼으로 루틴을 추가해보세요!</p>
      </div>`;
    return;
  }

  const allDone = dayRoutines.every(r => state.routineLogs[r.id] === true);
  if (allDone) {
    container.innerHTML = `
      <div class="clear-state">
        <div class="clear-icon">😊</div>
        <h3>클리어🎉</h3>
        <p>내일도 화이팅이에요!</p>
      </div>`;
    return;
  }

  container.innerHTML = dayRoutines.map(r => buildRoutineCard(r)).join('');
}

function buildRoutineCard(routine) {
  const isDone = state.routineLogs[routine.id] === true;
  const items = routine.routine_items || [];
  const typeLabel = routine.type === 'exercise' ? '운동' : '식단';
  const typeClass = routine.type === 'exercise' ? 'exercise' : 'diet';

  const itemsHtml = items.length > 0 ? `
    <div class="routine-items-section">
      ${items.map(item => {
        const detail = routine.type === 'exercise'
          ? [
              item.sets ? `${item.sets}세트` : '',
              item.reps ? `${item.reps}회` : '',
              item.weight ? `${item.weight}kg` : '',
            ].filter(Boolean).join(' · ')
          : [
              item.calories ? `${item.calories}kcal` : '',
              item.protein ? `단백질 ${item.protein}g` : '',
            ].filter(Boolean).join(' · ');
        return `
          <div class="routine-item-row">
            <span class="item-name-text${isDone ? ' done' : ''}">${escHtml(item.name)}</span>
            ${detail ? `<span class="item-detail">${detail}</span>` : ''}
          </div>`;
      }).join('')}
    </div>` : '';

  return `
    <div class="routine-card">
      <div class="routine-card-header">
        <button class="routine-check${isDone ? ' checked' : ''}"
                onclick="toggleRoutineComplete('${routine.id}')">
          ${isDone ? '✓' : ''}
        </button>
        <div class="routine-card-info">
          <div class="routine-card-name${isDone ? ' done' : ''}">${escHtml(routine.name)}</div>
          ${items.length > 0 ? `<div class="routine-card-meta">${items.length}개 항목</div>` : ''}
        </div>
        <span class="type-badge ${typeClass}">${typeLabel}</span>
        <button class="delete-btn" onclick="deleteRoutine('${routine.id}')"
                title="루틴 삭제">−</button>
      </div>
      ${itemsHtml}
    </div>`;
}

function renderPosts() {
  const container = document.getElementById('posts-list');
  if (!container) return;

  if (state.posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>아직 게시물이 없어요<br>첫 게시물을 작성해보세요!</p>
      </div>`;
    return;
  }

  container.innerHTML = state.posts.map(post => {
    const username = post.profiles?.username || '익명';
    const initial = username.charAt(0).toUpperCase();
    const liked = state.postLikes.has(post.id);
    const timeAgo = getTimeAgo(new Date(post.created_at));
    const isOwn = state.user && post.user_id === state.user.id;

    return `
      <div class="post-card">
        <div class="post-header">
          <div class="avatar">${initial}</div>
          <div class="post-user-info">
            <div class="post-username">${escHtml(username)}</div>
            <div class="post-time">${timeAgo}</div>
          </div>
          ${isOwn ? `
            <button class="icon-btn small" onclick="deletePost('${post.id}')" style="color:#9ca3af">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>` : ''}
        </div>
        <p class="post-content">${escHtml(post.content)}</p>
        <div class="post-actions">
          <button class="post-action-btn${liked ? ' liked' : ''}" onclick="toggleLike('${post.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
            ${post.likes_count || 0}
          </button>
          <button class="post-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            ${post.comments_count || 0}
          </button>
        </div>
      </div>`;
  }).join('');
}

async function deletePost(postId) {
  if (!confirm('게시물을 삭제할까요?')) return;
  await sb.from('posts').delete().eq('id', postId).eq('user_id', state.user.id);
  state.posts = state.posts.filter(p => p.id !== postId);
  renderPosts();
}

function renderProfile() {
  const container = document.getElementById('profile-content');
  if (!container || !state.profile) return;

  const p = state.profile;
  const username = p.username || '사용자';
  const initial = username.charAt(0).toUpperCase();
  const bio = p.bio || '한 줄 소개를 작성해주세요';
  const totalRoutines = state.routines.length;
  const completedToday = Object.values(state.routineLogs).filter(Boolean).length;

  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar">${initial}</div>
      <div class="profile-username">${escHtml(username)}</div>
      <p class="profile-bio">${escHtml(bio)}</p>
    </div>
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">🔥 ${state.streak}</div>
        <div class="stat-label">연속 달성</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalRoutines}</div>
        <div class="stat-label">총 루틴</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${completedToday}</div>
        <div class="stat-label">오늘 완료</div>
      </div>
    </div>
    <div class="menu-list">
      <div class="menu-item" onclick="openEditProfileModal()">
        <div class="menu-item-icon">✏️</div>
        <span class="menu-item-label">프로필 수정</span>
        <span class="menu-item-arrow">›</span>
      </div>
      <div class="menu-item" onclick="switchPage('routine', document.querySelector('[data-page=routine]'))">
        <div class="menu-item-icon">💪</div>
        <span class="menu-item-label">내 루틴 보기</span>
        <span class="menu-item-arrow">›</span>
      </div>
      <div class="menu-item danger" onclick="handleSignOut()">
        <div class="menu-item-icon">🚪</div>
        <span class="menu-item-label">로그아웃</span>
      </div>
    </div>`;
}

async function handleSignOut() {
  if (!confirm('로그아웃 하시겠습니까?')) return;
  await sb.auth.signOut();
}

// ── UI 전환 ──
function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderAll();
}

function showAuth() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

function switchPage(pageName, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');

  const navBtn = btn || document.querySelector(`[data-page="${pageName}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (pageName === 'community') renderPosts();
  if (pageName === 'my') renderProfile();
}

function switchInnerTab(tab, btn) {
  state.innerTab = tab;
  document.querySelectorAll('.inner-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRoutineList();
}

function togglePeriodMenu() {
  state.periodMenuOpen = !state.periodMenuOpen;
  document.getElementById('period-menu').classList.toggle('hidden', !state.periodMenuOpen);
}

function setPeriod(label) {
  document.getElementById('period-label').textContent = label;
  document.getElementById('period-menu').classList.add('hidden');
  state.periodMenuOpen = false;
}

// 외부 클릭 시 period 메뉴 닫기
document.addEventListener('click', e => {
  if (state.periodMenuOpen && !e.target.closest('.toolbar-left')) {
    document.getElementById('period-menu').classList.add('hidden');
    state.periodMenuOpen = false;
  }
});

// ── 모달 ──
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function handleOverlayClick(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}

function openAddRoutineModal() {
  document.getElementById('routine-name').value = '';
  document.getElementById('routine-items-list').innerHTML = '';
  state.itemCount = 0;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="exercise"]').classList.add('active');
  document.querySelectorAll('.day-btn').forEach(b => {
    const d = parseInt(b.dataset.day);
    b.classList.toggle('active', d >= 1 && d <= 5);
  });
  openModal('modal-add-routine');
}

function openAddPostModal() {
  document.getElementById('post-content').value = '';
  const name = state.profile?.username || '사용자';
  document.getElementById('post-author-name').textContent = name;
  document.getElementById('post-author-avatar').textContent = name.charAt(0).toUpperCase();
  openModal('modal-add-post');
}

function openEditProfileModal() {
  document.getElementById('edit-username').value = state.profile?.username || '';
  document.getElementById('edit-bio').value = state.profile?.bio || '';
  openModal('modal-edit-profile');
}

function selectType(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // 항목 입력 폼 다시 그리기 (타입 변경 시 필드 바뀜)
  document.getElementById('routine-items-list').innerHTML = '';
  state.itemCount = 0;
}

function addRoutineItemRow() {
  const id = `item-${++state.itemCount}`;
  const type = document.querySelector('.type-btn.active')?.dataset.type || 'exercise';
  const isExercise = type === 'exercise';

  const div = document.createElement('div');
  div.className = 'routine-item-form';
  div.id = id;
  div.innerHTML = `
    <div class="item-inputs">
      <input type="text" placeholder="${isExercise ? '운동 이름 (예: 스쿼트)' : '음식 이름 (예: 닭가슴살)'}"
             class="item-name-input">
      ${isExercise ? `
        <div class="item-row-extra">
          <input type="number" placeholder="세트 수" class="item-sets" min="1">
          <input type="number" placeholder="횟수" class="item-reps" min="1">
        </div>
        <input type="number" placeholder="무게 kg (선택)" class="item-weight" min="0" step="0.5">
      ` : `
        <div class="item-row-extra">
          <input type="number" placeholder="칼로리 kcal" class="item-calories" min="0">
          <input type="number" placeholder="단백질 g" class="item-protein" min="0">
        </div>
      `}
    </div>
    <button class="remove-item-btn" onclick="document.getElementById('${id}').remove()">−</button>`;
  document.getElementById('routine-items-list').appendChild(div);
}

async function saveRoutine() {
  const name = document.getElementById('routine-name').value.trim();
  if (!name) {
    alert('루틴 이름을 입력해주세요.');
    return;
  }

  const type = document.querySelector('.type-btn.active')?.dataset.type || 'exercise';
  const days = Array.from(document.querySelectorAll('.day-btn.active'))
    .map(b => parseInt(b.dataset.day));

  if (days.length === 0) {
    alert('요일을 하나 이상 선택해주세요.');
    return;
  }

  const items = Array.from(document.querySelectorAll('.routine-item-form'))
    .map(form => {
      const nameInput = form.querySelector('.item-name-input');
      if (!nameInput?.value.trim()) return null;
      return {
        name: nameInput.value.trim(),
        sets: form.querySelector('.item-sets')?.value || null,
        reps: form.querySelector('.item-reps')?.value || null,
        weight: form.querySelector('.item-weight')?.value || null,
        calories: form.querySelector('.item-calories')?.value || null,
        protein: form.querySelector('.item-protein')?.value || null,
      };
    })
    .filter(Boolean);

  closeModal('modal-add-routine');
  await addRoutine({ name, type, days }, items);
}

async function savePost() {
  const content = document.getElementById('post-content').value;
  await addPost(content);
}

// ── 유틸 ──
function fmtDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTimeAgo(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString('ko-KR');
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ── 앱 시작 ──
init();
