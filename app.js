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
  routineLogs: {},
  posts: [],
  postLikes: new Set(),
  streak: 0,
  innerTab: 'exercise',
  periodMenuOpen: false,
  selectedPhoto: null,
};

// ── 초기화 ──
async function init() {
  // OAuth 리다이렉트 처리
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    state.user = session.user;
    await loadAll();
    showApp();
  } else {
    showAuth();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
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

// ── Google 로그인 ──
async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  if (error) {
    document.getElementById('auth-error').textContent = '로그인 실패: ' + error.message;
  }
}

// ── 데이터 로딩 ──
async function loadAll() {
  await Promise.all([loadProfile(), loadRoutines(), loadPosts()]);
  await loadRoutineLogsForDate(state.selectedDate);
  await calcStreak();
}

async function loadProfile() {
  if (!state.user) return;
  let { data } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  if (!data) {
    const username =
      state.user.user_metadata?.full_name ||
      state.user.user_metadata?.name ||
      state.user.email?.split('@')[0] ||
      '사용자';
    const avatar_url = state.user.user_metadata?.avatar_url || null;
    const { data: created } = await sb.from('profiles').upsert({
      id: state.user.id,
      username,
      full_name: username,
      bio: '',
      avatar_url,
    }).select().single();
    data = created;
  }
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
}

async function loadRoutineLogsForDate(date) {
  if (!state.user) return;
  const { data } = await sb
    .from('routine_logs')
    .select('*')
    .eq('user_id', state.user.id)
    .eq('log_date', fmtDate(date));
  state.routineLogs = {};
  (data || []).forEach(log => { state.routineLogs[log.routine_id] = log.is_complete; });
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

async function addRoutine(routineData) {
  const { data: routine, error } = await sb
    .from('routines')
    .insert({
      user_id: state.user.id,
      name: routineData.name,
      type: routineData.type,
      days_of_week: routineData.days,
      meal_time: routineData.mealTime || null,
    })
    .select()
    .single();

  if (error) {
    console.error('루틴 추가 실패:', error);
    alert('루틴 추가 실패: ' + error.message);
    return;
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
    .select('*, profiles(username, avatar_url)')
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

async function uploadPhoto(file) {
  const ext = file.name.split('.').pop();
  const path = `${state.user.id}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('post-images').upload(path, file);
  if (error) { console.error('이미지 업로드 실패:', error); return null; }
  const { data } = sb.storage.from('post-images').getPublicUrl(path);
  return data.publicUrl;
}

async function savePost() {
  const content = document.getElementById('post-content').value.trim();
  if (!content && !state.selectedPhoto) return;

  document.getElementById('compose-post-btn').disabled = true;
  document.getElementById('compose-post-btn').textContent = '게시 중...';

  let imageUrl = null;
  if (state.selectedPhoto) {
    imageUrl = await uploadPhoto(state.selectedPhoto);
  }

  const { error } = await sb.from('posts').insert({
    user_id: state.user.id,
    content: content || '',
    image_url: imageUrl,
  });

  if (error) {
    console.error('게시 실패:', error);
    alert('게시 실패: ' + error.message);
    document.getElementById('compose-post-btn').disabled = false;
    document.getElementById('compose-post-btn').textContent = '게시';
    return;
  }

  await loadPosts();
  renderPosts();
  closeCompose();
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

async function deletePost(postId) {
  if (!confirm('게시물을 삭제할까요?')) return;
  const post = state.posts.find(p => p.id === postId);
  if (post?.image_url) {
    const path = post.image_url.split('/post-images/')[1];
    if (path) await sb.storage.from('post-images').remove([path]);
  }
  await sb.from('posts').delete().eq('id', postId).eq('user_id', state.user.id);
  state.posts = state.posts.filter(p => p.id !== postId);
  renderPosts();
}

async function saveProfile() {
  const username = document.getElementById('edit-username').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  if (!username) return;
  const { error } = await sb.from('profiles')
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
  if (!logs || logs.length === 0) { state.streak = 0; return; }
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
  document.getElementById('header-month').textContent = `${d.getFullYear()}년 ${months[d.getMonth()]}`;
}

function renderCalendar() {
  const container = document.getElementById('week-days');
  const today = new Date(); today.setHours(0,0,0,0);
  const sel = new Date(state.selectedDate); sel.setHours(0,0,0,0);
  const dow = sel.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(sel); monday.setDate(sel.getDate() + diff);
  const dayNames = ['월','화','수','목','금','토','일'];
  container.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i); d.setHours(0,0,0,0);
    const isToday = d.getTime() === today.getTime();
    const isSelected = d.getTime() === sel.getTime();
    const dayNum = d.getDay();
    const hasRoutine = state.routines.some(r => r.days_of_week?.includes(dayNum));
    const col = document.createElement('div');
    col.className = ['day-col', isToday ? 'today' : '', isSelected ? 'selected' : '', hasRoutine ? 'has-routine' : ''].filter(Boolean).join(' ');
    col.innerHTML = `<span class="day-name">${dayNames[i]}</span><div class="day-num">${d.getDate()}</div><div class="day-dot"></div>`;
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
  const dow = state.selectedDate.getDay();
  const typeFilter = state.innerTab === 'diet' ? 'diet' : 'exercise';
  const dayRoutines = state.routines.filter(
    r => r.days_of_week?.includes(dow) && r.type === typeFilter
  );

  if (dayRoutines.length === 0) {
    const label = typeFilter === 'exercise' ? '운동' : '식단';
    const icon = typeFilter === 'exercise' ? '💪' : '🥗';
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">${icon}</div><p>오늘 ${label} 루틴이 없어요<br>+ 버튼으로 추가해보세요!</p></div>`;
    return;
  }

  const allDone = dayRoutines.every(r => state.routineLogs[r.id] === true);
  const clearBanner = allDone
    ? `<div class="clear-banner"><div class="clear-banner-icon">😊</div><div class="clear-banner-text"><h4>클리어🎉</h4><p>내일도 화이팅이에요!</p></div></div>`
    : '';

  container.innerHTML = clearBanner + dayRoutines.map(r => buildRoutineCard(r)).join('');
}

function buildRoutineCard(routine) {
  const isDone = state.routineLogs[routine.id] === true;
  const typeLabel = routine.type === 'exercise' ? '운동' : '식단';
  const typeClass = routine.type === 'exercise' ? 'exercise' : 'diet';
  const mealBadge = routine.meal_time ? `<span class="meal-badge">${routine.meal_time}</span>` : '';

  return `
    <div class="routine-card">
      <div class="routine-card-header">
        <button class="routine-check${isDone ? ' checked' : ''}" onclick="toggleRoutineComplete('${routine.id}')">
          ${isDone ? '✓' : ''}
        </button>
        <div class="routine-card-info">
          <div class="routine-card-name${isDone ? ' done' : ''}">${escHtml(routine.name)}</div>
        </div>
        <span class="type-badge ${typeClass}">${typeLabel}${mealBadge}</span>
        <button class="delete-btn" onclick="deleteRoutine('${routine.id}')">−</button>
      </div>
    </div>`;
}

function renderPosts() {
  const container = document.getElementById('posts-list');
  if (!container) return;
  if (state.posts.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><p>아직 게시물이 없어요<br>첫 게시물을 작성해보세요!</p></div>`;
    return;
  }
  container.innerHTML = state.posts.map(post => {
    const username = post.profiles?.username || '익명';
    const initial = username.charAt(0).toUpperCase();
    const avatarUrl = post.profiles?.avatar_url;
    const liked = state.postLikes.has(post.id);
    const timeAgo = getTimeAgo(new Date(post.created_at));
    const isOwn = state.user && post.user_id === state.user.id;
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" class="avatar" style="object-fit:cover" alt="">`
      : `<div class="avatar">${initial}</div>`;
    const imageHtml = post.image_url
      ? `<img src="${post.image_url}" class="post-image" alt="게시물 이미지">`
      : '';
    const contentHtml = post.content
      ? `<p class="post-content">${escHtml(post.content)}</p>`
      : '';
    return `
      <div class="post-card">
        <div class="post-header">
          ${avatarHtml}
          <div class="post-user-info">
            <div class="post-username">${escHtml(username)}</div>
            <div class="post-time">${timeAgo}</div>
          </div>
          ${isOwn ? `<button class="icon-btn small" onclick="deletePost('${post.id}')" style="color:#9ca3af"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>` : ''}
        </div>
        ${imageHtml}
        ${contentHtml}
        <div class="post-actions">
          <button class="post-action-btn${liked ? ' liked' : ''}" onclick="toggleLike('${post.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            ${post.likes_count || 0}
          </button>
          <button class="post-action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            ${post.comments_count || 0}
          </button>
        </div>
      </div>`;
  }).join('');
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
  const avatarHtml = p.avatar_url
    ? `<img src="${p.avatar_url}" class="profile-img" alt="">`
    : `<div class="profile-avatar">${initial}</div>`;

  container.innerHTML = `
    <div class="profile-card">
      ${avatarHtml}
      <div class="profile-username">${escHtml(username)}</div>
      <p class="profile-bio">${escHtml(bio)}</p>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">🔥 ${state.streak}</div><div class="stat-label">연속 달성</div></div>
      <div class="stat-card"><div class="stat-value">${totalRoutines}</div><div class="stat-label">총 루틴</div></div>
      <div class="stat-card"><div class="stat-value">${completedToday}</div><div class="stat-label">오늘 완료</div></div>
    </div>
    <div class="menu-list">
      <div class="menu-item" onclick="openEditProfileModal()">
        <div class="menu-item-icon">✏️</div><span class="menu-item-label">프로필 수정</span><span class="menu-item-arrow">›</span>
      </div>
      <div class="menu-item danger" onclick="handleSignOut()">
        <div class="menu-item-icon">🚪</div><span class="menu-item-label">로그아웃</span>
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
  document.querySelectorAll('.page:not(.compose-page)').forEach(p => p.classList.remove('active'));
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

// ── 글쓰기 페이지 ──
function openCompose() {
  state.selectedPhoto = null;
  document.getElementById('post-content').value = '';
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('photo-preview').innerHTML = '';
  document.getElementById('compose-post-btn').disabled = true;
  document.getElementById('compose-post-btn').textContent = '게시';

  const name = state.profile?.username || '사용자';
  document.getElementById('compose-username').textContent = name;

  const avatarEl = document.getElementById('compose-avatar');
  if (state.profile?.avatar_url) {
    avatarEl.style.backgroundImage = `url(${state.profile.avatar_url})`;
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.textContent = '';
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  const composePage = document.getElementById('page-compose');
  composePage.classList.remove('hidden-page');
  composePage.classList.add('active');
  document.querySelector('.bottom-nav').style.display = 'none';
  document.getElementById('post-content').focus();
}

function closeCompose() {
  const composePage = document.getElementById('page-compose');
  composePage.classList.remove('active');
  composePage.classList.add('hidden-page');
  document.querySelector('.bottom-nav').style.display = '';
  state.selectedPhoto = null;
}

function onComposeInput(textarea) {
  const btn = document.getElementById('compose-post-btn');
  btn.disabled = !textarea.value.trim() && !state.selectedPhoto;
  // 자동 높이 조절
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function handlePhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  state.selectedPhoto = file;

  const preview = document.getElementById('photo-preview');
  const reader = new FileReader();
  reader.onload = e => {
    preview.classList.remove('hidden');
    preview.innerHTML = `
      <img src="${e.target.result}" alt="미리보기">
      <button class="photo-remove" onclick="removePhoto()">✕</button>`;
    document.getElementById('compose-post-btn').disabled = false;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function removePhoto() {
  state.selectedPhoto = null;
  const preview = document.getElementById('photo-preview');
  preview.classList.add('hidden');
  preview.innerHTML = '';
  const content = document.getElementById('post-content').value.trim();
  document.getElementById('compose-post-btn').disabled = !content;
}

// ── 모달 ──
function togglePeriodMenu() {
  state.periodMenuOpen = !state.periodMenuOpen;
  document.getElementById('period-menu').classList.toggle('hidden', !state.periodMenuOpen);
}

function setPeriod(label) {
  document.getElementById('period-label').textContent = label;
  document.getElementById('period-menu').classList.add('hidden');
  state.periodMenuOpen = false;
}

document.addEventListener('click', e => {
  if (state.periodMenuOpen && !e.target.closest('.routine-toolbar')) {
    document.getElementById('period-menu').classList.add('hidden');
    state.periodMenuOpen = false;
  }
});

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function handleOverlayClick(e, id) { if (e.target === e.currentTarget) closeModal(id); }

function openAddRoutineModal() {
  document.getElementById('routine-name').value = '';
  const defaultType = state.innerTab === 'diet' ? 'diet' : 'exercise';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.type-btn[data-type="${defaultType}"]`).classList.add('active');
  document.querySelectorAll('.day-btn').forEach(b => {
    const d = parseInt(b.dataset.day);
    b.classList.toggle('active', d >= 1 && d <= 5);
  });
  // 식사시간 그룹 표시 여부
  document.getElementById('meal-time-group').style.display =
    defaultType === 'diet' ? '' : 'none';
  // 식사시간 초기화
  document.querySelectorAll('.meal-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  openModal('modal-add-routine');
}

function selectType(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const isDiet = btn.dataset.type === 'diet';
  document.getElementById('meal-time-group').style.display = isDiet ? '' : 'none';
}

function toggleDay(btn) {
  btn.classList.toggle('active');
}

function toggleMeal(btn) {
  document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function openEditProfileModal() {
  document.getElementById('edit-username').value = state.profile?.username || '';
  document.getElementById('edit-bio').value = state.profile?.bio || '';
  openModal('modal-edit-profile');
}

async function saveRoutine() {
  const name = document.getElementById('routine-name').value.trim();
  if (!name) { alert('루틴 이름을 입력해주세요.'); return; }
  const type = document.querySelector('.type-btn.active')?.dataset.type || 'exercise';
  const days = Array.from(document.querySelectorAll('.day-btn.active'))
    .map(b => parseInt(b.dataset.day));
  if (days.length === 0) { alert('요일을 하나 이상 선택해주세요.'); return; }
  const mealTime = type === 'diet'
    ? (document.querySelector('.meal-btn.active')?.dataset.meal || null)
    : null;
  closeModal('modal-add-routine');
  await addRoutine({ name, type, days, mealTime });
}

// ── 유틸 ──
function fmtDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

// meal-btn 클릭 이벤트 위임
document.addEventListener('click', e => {
  const btn = e.target.closest('.meal-btn');
  if (btn) toggleMeal(btn);
});

init();
