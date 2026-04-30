const SUPABASE_URL = 'https://myficrjdmqbtsgmdxtiu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15ZmljcmpkbXFidHNnbWR4dGl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5ODY4OTEsImV4cCI6MjA5MTU2Mjg5MX0.G2-_UEqO12SqxELdkZScvrdcYBNPW1gusEBA0ZW6smc';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const KOREA_REGIONS = {
  '서울':['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'],
  '부산':['강서구','금정구','기장군','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구','해운대구'],
  '대구':['달서구','달성군','동구','북구','서구','수성구','중구','남구'],
  '인천':['강화군','계양구','남동구','동구','미추홀구','부평구','서구','연수구','옹진군','중구'],
  '광주':['광산구','남구','동구','북구','서구'],
  '대전':['대덕구','동구','서구','유성구','중구'],
  '울산':['남구','동구','북구','울주군','중구'],
  '세종':['세종시'],
  '경기':['가평군','고양시','과천시','광명시','광주시','구리시','군포시','김포시','남양주시','동두천시','부천시','성남시','수원시','시흥시','안산시','안성시','안양시','양주시','양평군','여주시','연천군','오산시','용인시','의왕시','의정부시','이천시','파주시','평택시','포천시','하남시','화성시'],
  '강원':['강릉시','고성군','동해시','삼척시','속초시','양구군','양양군','영월군','원주시','인제군','정선군','철원군','춘천시','태백시','평창군','홍천군','화천군','횡성군'],
  '충북':['괴산군','단양군','보은군','영동군','옥천군','음성군','제천시','증평군','진천군','청주시','충주시'],
  '충남':['계룡시','공주시','금산군','논산시','당진시','보령시','부여군','서산시','서천군','아산시','예산군','천안시','청양군','태안군','홍성군'],
  '전북':['고창군','군산시','김제시','남원시','무주군','부안군','순창군','완주군','익산시','임실군','장수군','전주시','정읍시','진안군'],
  '전남':['강진군','고흥군','곡성군','광양시','구례군','나주시','담양군','목포시','무안군','보성군','순천시','신안군','여수시','영광군','영암군','완도군','장성군','장흥군','진도군','함평군','해남군','화순군'],
  '경북':['경산시','경주시','고령군','구미시','군위군','김천시','문경시','봉화군','상주시','성주군','안동시','영덕군','영양군','영주시','영천시','예천군','울릉군','울진군','의성군','청도군','청송군','칠곡군','포항시'],
  '경남':['거제시','거창군','고성군','김해시','남해군','밀양시','산청군','사천시','양산시','의령군','진주시','창녕군','창원시','통영시','하동군','함안군','함양군','합천군'],
  '제주':['서귀포시','제주시'],
};

const state = {
  user: null, profile: null,
  selectedDate: new Date(),
  routines: [], routineLogs: {},
  posts: [], postLikes: new Set(), scrappedPosts: new Set(),
  streak: 0, innerTab: 'exercise',
  periodMenuOpen: false, currentPeriod: '하루',
  selectedPhotos: [],
  categories: [], selectedCategoryId: null, composeCategoryId: null,
  editingRoutineId: null, editingPostId: null,
  pickerYear: new Date().getFullYear(), pickerMonth: new Date().getMonth(),
  notifications: [],
  currentPostId: null, currentComments: [],
  setupPhoto: null, setupProvince: null, setupDistrict: null,
  selectedRoutineIds: new Set(),
  pickerType: 'exercise',
  pickerSelectedDays: { exercise: new Set(), diet: new Set() },
  replyToCommentId: null, replyToUsername: null,
  profileTab: 'posts',
};

function setupPullToRefresh() {
  const scroll = document.getElementById('community-scroll');
  const indicator = document.getElementById('ptr-indicator');
  const label = document.getElementById('ptr-label');
  if (!scroll || !indicator) return;
  const THRESHOLD = 72;
  let startY = 0, pulling = false, refreshing = false;

  scroll.addEventListener('touchstart', e => {
    if (scroll.scrollTop === 0 && !refreshing) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  scroll.addEventListener('touchmove', e => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) return;
    const h = Math.min(dy * 0.45, 60);
    indicator.style.height = h + 'px';
    indicator.style.opacity = Math.min(dy / THRESHOLD, 1);
    label.textContent = dy >= THRESHOLD ? '놓으면 새로고침' : '당겨서 새로고침';
  }, { passive: true });

  scroll.addEventListener('touchend', async e => {
    if (!pulling) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy >= THRESHOLD && !refreshing) {
      refreshing = true;
      label.textContent = '새로고침 중...';
      indicator.classList.add('ptr-spinning');
      indicator.style.height = '56px';
      indicator.style.opacity = '1';
      await loadPosts();
      renderPosts();
      refreshing = false;
      indicator.classList.remove('ptr-spinning');
      indicator.style.height = '0';
      indicator.style.opacity = '0';
      label.textContent = '당겨서 새로고침';
    } else {
      indicator.style.height = '0';
      indicator.style.opacity = '0';
    }
  });
}

async function init() {
  setupPostDetailSwipe();
  setupPullToRefresh();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    state.user = session.user;
    cleanOAuthHash();
    await loadAll();
    hideLoading();
    showApp();
  } else {
    hideLoading();
    showAuth();
    const params = new URLSearchParams(window.location.search);
    if (params.get('post')) {
      document.getElementById('auth-error').textContent = '게시물을 보려면 먼저 로그인해주세요.';
    }
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session && !state.user) {
      state.user = session.user;
      cleanOAuthHash();
      document.getElementById('auth-screen').classList.add('hidden');
      showLoading();
      await loadAll();
      hideLoading();
      showApp();
    } else if (event === 'TOKEN_REFRESHED' && session) {
      state.user = session.user;
    } else if (event === 'SIGNED_OUT') {
      state.user = null; state.profile = null;
      showAuth();
    }
  });
}

function showLoading() { document.getElementById('loading-screen').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading-screen').classList.add('hidden'); }

function cleanOAuthHash() {
  if (window.location.hash && window.location.hash.includes('access_token')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function setupPostDetailSwipe() {
  const overlay = document.getElementById('modal-post-detail');
  if (!overlay) return;
  const page = overlay.querySelector('.post-detail-page');
  let startX = 0, startY = 0, tracking = false;

  overlay.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = startX < 44; // only track swipes starting from left edge
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
    const progress = Math.min(dx / window.innerWidth, 1);
    page.style.cssText = `transform:translateX(${dx}px);opacity:${1 - progress * 0.5};transition:none`;
  }, { passive: true });

  overlay.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    if (dx > 80) {
      page.style.cssText = 'transform:translateX(100%);opacity:0;transition:transform 0.22s ease,opacity 0.22s ease';
      setTimeout(() => {
        closeModal('modal-post-detail');
        page.style.cssText = '';
      }, 220);
    } else {
      page.style.cssText = 'transition:transform 0.2s ease,opacity 0.2s ease';
      setTimeout(() => { page.style.cssText = ''; }, 200);
    }
  });
}

function checkDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const postId = params.get('post');
  if (postId) {
    window.history.replaceState({}, '', window.location.pathname);
    openPostDetail(postId);
  }
}

function sharePost(postId) {
  const url = `${window.location.origin}${window.location.pathname}?post=${postId}`;
  if (navigator.share) {
    navigator.share({ title: 'Rebel-Up 게시물', url }).catch(() => copyToClipboard(url));
  } else {
    copyToClipboard(url);
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('링크가 복사되었어요!'));
  } else {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('링크가 복사되었어요!');
  }
}

function showToast(msg) {
  const existing = document.getElementById('toast-msg');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toast-msg';
  toast.className = 'toast-msg';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2200);
}

function openPhotoViewer(url) {
  const viewer = document.getElementById('photo-viewer');
  document.getElementById('photo-viewer-img').src = url;
  viewer.classList.remove('hidden');
}
function closePhotoViewer() {
  const viewer = document.getElementById('photo-viewer');
  viewer.classList.add('hidden');
  document.getElementById('photo-viewer-img').src = '';
}

async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) document.getElementById('auth-error').textContent = '로그인 실패: ' + error.message;
}

async function loadAll() {
  await Promise.all([
    loadProfile(), loadRoutines(), loadPosts(), loadCategories(),
    loadNotifications(), loadScraps(),
    loadRoutineLogsForDate(state.selectedDate), calcStreak(),
  ]);
}

async function loadScraps() {
  if (!state.user) return;
  const { data } = await sb.from('post_scraps').select('post_id').eq('user_id', state.user.id);
  state.scrappedPosts = new Set((data || []).map(s => s.post_id));
}

async function loadProfile() {
  if (!state.user) return;
  const username = state.user.user_metadata?.full_name || state.user.user_metadata?.name || state.user.email?.split('@')[0] || '사용자';
  const { data, error } = await sb.from('profiles').upsert({
    id: state.user.id, username, full_name: username, bio: '',
    avatar_url: state.user.user_metadata?.avatar_url || null,
  }, { onConflict: 'id', ignoreDuplicates: true }).select().maybeSingle();
  if (!error && data) { state.profile = data; return; }
  // If upsert returned nothing (existing row, ignoreDuplicates), fetch it
  const { data: existing } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  if (existing) state.profile = existing;
}

async function loadRoutines() {
  if (!state.user) return;
  const { data } = await sb.from('routines').select('*').eq('user_id', state.user.id).eq('is_active', true).order('order_index').order('created_at');
  state.routines = data || [];
}

async function loadRoutineLogsForDate(date) {
  if (!state.user) return;
  const { data } = await sb.from('routine_logs').select('*').eq('user_id', state.user.id).eq('log_date', fmtDate(date));
  state.routineLogs = {};
  (data || []).forEach(log => { state.routineLogs[log.routine_id] = log.is_complete; });
}

async function loadPosts() {
  const { data } = await sb.from('posts').select('*, profiles!posts_user_id_fkey(username, avatar_url), categories!posts_category_id_fkey(name)').order('created_at', { ascending: false }).limit(50);
  state.posts = data || [];
  if (state.user) {
    const { data: likes } = await sb.from('post_likes').select('post_id').eq('user_id', state.user.id);
    state.postLikes = new Set((likes || []).map(l => l.post_id));
  }
}

async function loadCategories() {
  const { data } = await sb.from('categories').select('*').order('order_index').order('name');
  state.categories = data || [];
}

async function toggleRoutineComplete(routineId) {
  const wasComplete = state.routineLogs[routineId] === true;
  const isComplete = !wasComplete;
  state.routineLogs[routineId] = isComplete;
  renderRoutineList();
  const { error } = await sb.from('routine_logs').upsert({
    user_id: state.user.id, routine_id: routineId,
    log_date: fmtDate(state.selectedDate), is_complete: isComplete,
    completed_at: isComplete ? new Date().toISOString() : null,
  }, { onConflict: 'user_id,routine_id,log_date' });
  if (error) { state.routineLogs[routineId] = wasComplete; renderRoutineList(); }
  else { await calcStreak(); document.getElementById('streak-count').textContent = state.streak; }
}

async function addRoutine(data) {
  const maxOrder = state.routines.filter(r => r.type === data.type).reduce((m, r) => Math.max(m, r.order_index || 0), -1);
  const { error } = await sb.from('routines').insert({
    user_id: state.user.id, name: data.name, type: data.type,
    days_of_week: data.days, meal_time: data.mealTime || null,
    time_of_day: data.timeOfDay || null, order_index: maxOrder + 1,
  });
  if (error) { alert('루틴 추가 실패: ' + error.message); return; }
  await loadRoutines();
  renderCalendar();
  renderRoutineList();
}

async function updateRoutine(routineId, data) {
  const { error } = await sb.from('routines').update({
    name: data.name, type: data.type, days_of_week: data.days,
    meal_time: data.mealTime || null, time_of_day: data.timeOfDay || null,
  }).eq('id', routineId);
  if (error) { alert('수정 실패: ' + error.message); return; }
  await loadRoutines();
  renderCalendar();
  renderRoutineList();
}

async function deleteRoutine(routineId) {
  if (!confirm('이 루틴을 삭제할까요?')) return;
  closeAllSwipes();
  await sb.from('routines').update({ is_active: false }).eq('id', routineId);
  state.routines = state.routines.filter(r => r.id !== routineId);
  delete state.routineLogs[routineId];
  renderCalendar();
  renderRoutineList();
}

async function uploadPhoto(file) {
  const ext = file.name.split('.').pop();
  const path = `${state.user.id}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('post-images').upload(path, file);
  if (error) return null;
  const { data } = sb.storage.from('post-images').getPublicUrl(path);
  return data.publicUrl;
}

function setUploadProgress(pct) {
  document.getElementById('upload-bar').style.width = pct + '%';
  document.getElementById('upload-pct').textContent = pct + '%';
}

async function savePost() {
  const content = document.getElementById('post-content').value.trim();
  if (!content && state.selectedPhotos.length === 0) return;
  if (!state.composeCategoryId) { alert('카테고리를 선택해주세요.'); return; }
  const btn = document.getElementById('compose-post-btn');
  btn.disabled = true;
  btn.textContent = state.editingPostId ? '수정 중...' : '게시 중...';

  const newFiles = state.selectedPhotos.filter(p => !p.isExisting).map(p => p.file);
  const hasWork = newFiles.length > 0;
  if (hasWork) {
    setUploadProgress(0);
    document.getElementById('upload-progress').classList.remove('hidden');
  }

  try {
    const existingUrls = state.selectedPhotos.filter(p => p.isExisting).map(p => p.previewUrl);
    const uploadedUrls = [];
    for (let i = 0; i < newFiles.length; i++) {
      const url = await uploadPhoto(newFiles[i]);
      uploadedUrls.push(url);
      setUploadProgress(Math.round((i + 1) / (newFiles.length + 1) * 90));
    }
    if (hasWork) setUploadProgress(95);
    const allUrls = [...existingUrls, ...uploadedUrls.filter(Boolean)];
    const imageUrl = allUrls[0] || null;
    const imageUrls = allUrls.length > 0 ? allUrls : null;

    if (state.editingPostId) {
      const editedRoutines = state.selectedRoutineIds.size > 0
        ? state.routines.filter(r => state.selectedRoutineIds.has(r.id))
            .map(r => ({ id: r.id, name: r.name, type: r.type, meal_time: r.meal_time || null, time_of_day: r.time_of_day || null, days_of_week: r.days_of_week || [] }))
        : null;
      const updates = { content: content || '', category_id: state.composeCategoryId, image_url: imageUrl, image_urls: imageUrls, shared_routines: editedRoutines };
      const { error } = await sb.from('posts').update(updates).eq('id', state.editingPostId).eq('user_id', state.user.id);
      if (error) throw error;
      const idx = state.posts.findIndex(p => p.id === state.editingPostId);
      if (idx >= 0) {
        state.posts[idx] = { ...state.posts[idx], ...updates };
        const cat = state.categories.find(c => c.id === updates.category_id);
        if (cat) state.posts[idx].categories = { name: cat.name };
      }
    } else {
      const sharedRoutines = state.selectedRoutineIds.size > 0
        ? state.routines.filter(r => state.selectedRoutineIds.has(r.id))
            .map(r => ({ id: r.id, name: r.name, type: r.type, meal_time: r.meal_time || null, time_of_day: r.time_of_day || null, days_of_week: r.days_of_week || [] }))
        : null;
      const { error } = await sb.from('posts').insert({
        user_id: state.user.id, content: content || '',
        image_url: imageUrl, image_urls: imageUrls,
        category_id: state.composeCategoryId, shared_routines: sharedRoutines,
      });
      if (error) throw error;
      await loadPosts();
    }
    if (hasWork) {
      setUploadProgress(100);
      await new Promise(r => setTimeout(r, 350));
      document.getElementById('upload-progress').classList.add('hidden');
    }
    closeCompose();
    state.selectedCategoryId = null;
    switchPage('community', document.querySelector('[data-page="community"]'));
    renderCategoryPills();
    renderPosts();
  } catch (err) {
    document.getElementById('upload-progress').classList.add('hidden');
    alert((state.editingPostId ? '수정' : '게시') + ' 실패: ' + err.message);
    btn.disabled = false;
    btn.textContent = state.editingPostId ? '수정' : '게시';
  }
}

async function toggleScrap(postId) {
  if (!state.user) return;
  const scrapped = state.scrappedPosts.has(postId);
  const post = state.posts.find(p => p.id === postId);
  if (scrapped) {
    state.scrappedPosts.delete(postId);
    if (post) post.scraps_count = Math.max(0, (post.scraps_count || 1) - 1);
    await sb.from('post_scraps').delete().match({ user_id: state.user.id, post_id: postId });
  } else {
    state.scrappedPosts.add(postId);
    if (post) post.scraps_count = (post.scraps_count || 0) + 1;
    await sb.from('post_scraps').insert({ user_id: state.user.id, post_id: postId });
  }
  if (post) await sb.from('posts').update({ scraps_count: post.scraps_count }).eq('id', postId);
  renderPosts();
  if (state.currentPostId === postId) {
    renderPostDetail(post, state.currentComments);
  }
}

async function toggleLike(postId) {
  if (!state.user) return;
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
  if (state.currentPostId === postId) renderPostDetail(post, state.currentComments);
}

async function deletePost(postId) {
  const post = state.posts.find(p => p.id === postId);
  if (post?.image_url) {
    const path = post.image_url.split('/post-images/')[1];
    if (path) await sb.storage.from('post-images').remove([path]);
  }
  await sb.from('posts').delete().eq('id', postId).eq('user_id', state.user.id);
  state.posts = state.posts.filter(p => p.id !== postId);
  renderPosts();
}

function openPostMenu(postId) {
  const post = state.posts.find(p => p.id === postId);
  const isOwn = state.user && post?.user_id === state.user.id;
  const list = document.getElementById('post-action-list');
  list.innerHTML = `
    ${isOwn ? `
    <div class="action-item" onclick="editPost('${postId}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      수정하기
    </div>
    <div class="action-item danger" onclick="confirmDeletePost('${postId}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
      삭제하기
    </div>` : ''}
    <div class="action-item danger" onclick="reportPost('${postId}')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      신고하기
    </div>
    <div class="action-item cancel" onclick="closeModal('modal-post-action')">취소</div>`;
  openModal('modal-post-action');
}

function openCurrentPostMenu() {
  if (state.currentPostId) openPostMenu(state.currentPostId);
}

async function confirmDeletePost(postId) {
  closeModal('modal-post-action');
  if (!confirm('게시물을 삭제할까요?')) return;
  await deletePost(postId);
  if (!document.getElementById('modal-post-detail').classList.contains('hidden')) {
    closeModal('modal-post-detail');
  }
}

function editPost(postId) {
  closeModal('modal-post-action');
  if (!document.getElementById('modal-post-detail').classList.contains('hidden')) {
    closeModal('modal-post-detail');
  }
  openCompose(postId);
}

function reportPost(postId) {
  closeModal('modal-post-action');
  alert('신고가 접수되었어요. 검토 후 처리하겠습니다.');
}

async function saveProfile() {
  const username = document.getElementById('edit-username').value.trim();
  const bio = document.getElementById('edit-bio').value.trim();
  if (!username) return;
  const { error } = await sb.from('profiles').update({ username, bio, updated_at: new Date().toISOString() }).eq('id', state.user.id);
  if (!error) { state.profile = { ...state.profile, username, bio }; renderProfile(); closeModal('modal-edit-profile'); }
}

async function calcStreak() {
  if (!state.user) return;
  const { data: logs } = await sb.from('routine_logs').select('log_date').eq('user_id', state.user.id).eq('is_complete', true).order('log_date', { ascending: false });
  if (!logs || !logs.length) { state.streak = 0; return; }
  const dates = new Set(logs.map(l => l.log_date));
  let streak = 0;
  const check = new Date(); check.setHours(0,0,0,0);
  while (dates.has(fmtDate(check))) { streak++; check.setDate(check.getDate() - 1); }
  state.streak = streak;
}

// ── 렌더링 ──
function renderAll() {
  updateHeaderMonth();
  renderCalendar();
  renderRoutineList();
  renderPosts();
  renderProfile();
  renderCategoryPills();
  updateNotifyBadge();
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
    col.className = ['day-col', isToday?'today':'', isSelected?'selected':'', hasRoutine?'has-routine':''].filter(Boolean).join(' ');
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
  if (state.innerTab === 'diet') { renderDietSections(); return; }
  const container = document.getElementById('routine-list');
  if (!container) return;
  closeAllSwipes();
  const dow = state.selectedDate.getDay();
  let dayRoutines = state.routines.filter(r => r.days_of_week?.includes(dow) && r.type === 'exercise');
  dayRoutines.sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));
  if (dayRoutines.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💪</div><p>오늘 운동 루틴이 없어요<br>+ 버튼으로 추가해보세요!</p></div>`;
    return;
  }
  const allDone = dayRoutines.every(r => state.routineLogs[r.id] === true);
  const clearBanner = allDone ? `<div class="clear-banner"><div class="clear-banner-icon">😊</div><div class="clear-banner-text"><h4>클리어🎉</h4><p>내일도 화이팅이에요!</p></div></div>` : '';
  container.innerHTML = clearBanner + dayRoutines.map(r => buildRoutineCard(r)).join('');
  setupSwipeAndDrag();
}

function renderDietSections() {
  const container = document.getElementById('routine-list');
  if (!container) return;
  closeAllSwipes();
  const dow = state.selectedDate.getDay();
  const dietRoutines = state.routines
    .filter(r => r.days_of_week?.includes(dow) && r.type === 'diet')
    .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));
  if (!dietRoutines.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🥗</div><p>오늘 식단 루틴이 없어요<br>+ 버튼으로 추가해보세요!</p></div>`;
    return;
  }
  const mealOrder = ['아침', '점심', '저녁', '간식'];
  const groups = {};
  mealOrder.forEach(m => { groups[m] = []; });
  const etc = [];
  dietRoutines.forEach(r => {
    if (r.meal_time && groups[r.meal_time]) groups[r.meal_time].push(r);
    else etc.push(r);
  });
  let html = '';
  const allDone = dietRoutines.every(r => state.routineLogs[r.id] === true);
  if (allDone) html += `<div class="clear-banner"><div class="clear-banner-icon">😊</div><div class="clear-banner-text"><h4>클리어🎉</h4><p>내일도 화이팅이에요!</p></div></div>`;
  mealOrder.forEach(meal => {
    if (!groups[meal].length) return;
    html += `<div class="diet-section-header">${meal}</div>`;
    html += groups[meal].map(r => buildRoutineCard(r)).join('');
  });
  if (etc.length) {
    html += `<div class="diet-section-header">기타</div>`;
    html += etc.map(r => buildRoutineCard(r)).join('');
  }
  container.innerHTML = html;
  setupSwipeAndDrag();
}

function buildRoutineCard(routine) {
  const isDone = state.routineLogs[routine.id] === true;
  const typeLabel = routine.type === 'exercise' ? '운동' : '식단';
  const typeClass = routine.type === 'exercise' ? 'exercise' : 'diet';
  const mealBadge = routine.meal_time ? `<span class="meal-badge">${routine.meal_time}</span>` : '';
  const todBadge = routine.time_of_day ? `<span class="routine-card-meta">${routine.time_of_day}</span>` : '';

  return `
    <div class="routine-item-wrap" data-id="${routine.id}">
      <div class="routine-card-actions">
        <button class="card-action-btn edit" onclick="openEditRoutineModal('${routine.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          수정
        </button>
        <button class="card-action-btn delete" onclick="deleteRoutine('${routine.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          삭제
        </button>
      </div>
      <div class="routine-card" data-id="${routine.id}">
        <div class="drag-handle" data-id="${routine.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></svg>
        </div>
        <div class="routine-card-inner">
          <button class="routine-check${isDone?' checked':''}" onclick="toggleRoutineComplete('${routine.id}')">
            ${isDone?'✓':''}
          </button>
          <div class="routine-card-info">
            <div class="routine-card-name${isDone?' done':''}">${escHtml(routine.name)}</div>
            ${todBadge}
          </div>
          <span class="type-badge ${typeClass}">${typeLabel}${mealBadge}</span>
        </div>
      </div>
    </div>`;
}

function renderCategoryPills() {
  const bar = document.getElementById('category-filter-bar');
  if (!bar) return;
  const active = state.selectedCategoryId;
  bar.innerHTML = `<button class="cat-pill${!active?' active':''}" data-cat-id="" onclick="filterByCategory(this)">전체</button>`;
  state.categories.forEach(c => {
    bar.innerHTML += `<button class="cat-pill${active===c.id?' active':''}" data-cat-id="${c.id}" onclick="filterByCategory(this)">${escHtml(c.name)}</button>`;
  });
}

function filterByCategory(btn) {
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.selectedCategoryId = btn.dataset.catId || null;
  renderPosts();
}

function renderComposeCategoryPills() {
  const container = document.getElementById('compose-cat-pills');
  if (!container) return;
  container.innerHTML = state.categories.map(c => `
    <button class="compose-cat-pill${state.composeCategoryId===c.id?' active':''}"
      onclick="selectComposeCategory('${c.id}', this)">${escHtml(c.name)}</button>`).join('');
}

function selectComposeCategory(id, btn) {
  if (state.composeCategoryId === id) {
    state.composeCategoryId = null;
    document.querySelectorAll('.compose-cat-pill').forEach(b => b.classList.remove('active'));
  } else {
    state.composeCategoryId = id;
    document.querySelectorAll('.compose-cat-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
}

// ── 루틴 카드 (게시물 상세) ──
function buildRoutineCards(routines) {
  if (!routines?.length) return '';
  const exRoutines = routines.filter(r => r.type === 'exercise');
  const dietRoutines = routines.filter(r => r.type === 'diet');
  const cards = [
    exRoutines.length ? buildRoutineTypeCard('exercise', exRoutines) : '',
    dietRoutines.length ? buildRoutineTypeCard('diet', dietRoutines) : '',
  ].filter(Boolean).join('');
  return cards ? `<div class="pd-routine-cards">${cards}</div>` : '';
}

function buildRoutineTypeCard(type, routines) {
  const label = type === 'exercise' ? '💪 운동 루틴' : '🥗 식단 루틴';
  const allDays = new Set(routines.flatMap(r => r.days_of_week || []));
  const avail = DAY_ORDER.filter(d => allDays.has(d));
  const defaultDay = avail[0] ?? null;
  const dayBtns = avail.length > 1
    ? avail.map(d => `<button class="rc-day-btn${d === defaultDay ? ' active' : ''}" data-day="${d}" onclick="selectRoutineCardDay(this,'${type}')">${DAY_LABELS[d]}</button>`).join('')
    : '';
  const shown = defaultDay !== null
    ? routines.filter(r => r.days_of_week?.includes(defaultDay))
    : routines;
  const items = shown.map(r => {
    const meta = r.meal_time || r.time_of_day || '';
    return `<div class="rc-item"><span class="rc-item-name">${escHtml(r.name)}</span>${meta ? `<span class="rc-item-meta">${meta}</span>` : ''}</div>`;
  }).join('');
  return `<div class="rc-card" data-type="${type}">
    <div class="rc-header"><span>${label}</span></div>
    ${dayBtns ? `<div class="rc-day-row">${dayBtns}</div>` : ''}
    <div class="rc-list" id="rc-list-${type}">${items}</div>
  </div>`;
}

function selectRoutineCardDay(btn, type) {
  const card = btn.closest('.rc-card');
  card.querySelectorAll('.rc-day-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const day = parseInt(btn.dataset.day);
  const post = state.posts.find(p => p.id === state.currentPostId);
  if (!post?.shared_routines) return;
  const routines = post.shared_routines.filter(r => r.type === type && r.days_of_week?.includes(day));
  card.querySelector('.rc-list').innerHTML = routines.map(r => {
    const meta = r.meal_time || r.time_of_day || '';
    return `<div class="rc-item"><span class="rc-item-name">${escHtml(r.name)}</span>${meta ? `<span class="rc-item-meta">${meta}</span>` : ''}</div>`;
  }).join('') || `<div class="rc-empty">루틴이 없어요</div>`;
}

// ── 이미지 슬라이드쇼 ──
function buildImageSlideshow(urls, postId, inDetail = false) {
  if (!urls || urls.length === 0) return '';
  if (urls.length === 1) {
    if (inDetail) return `<img src="${urls[0]}" class="pd-image" alt="" onclick="openPhotoViewer('${urls[0]}')" style="cursor:pointer">`;
    return `<img src="${urls[0]}" class="post-image" alt="">`;
  }
  const slides = urls.map((url, i) => {
    const tapAction = inDetail ? `onclick="openPhotoViewer('${url}')" style="cursor:pointer"` : '';
    return `<div class="slide${i === 0 ? ' active' : ''}"><img src="${url}" alt="사진 ${i + 1}" ${tapAction}></div>`;
  }).join('');
  const dots = urls.map((_, i) =>
    `<button class="slide-dot${i === 0 ? ' active' : ''}" onclick="event.stopPropagation();goToSlide(this,${i})"></button>`
  ).join('');
  const cls = inDetail ? 'post-slideshow detail-slideshow' : 'post-slideshow';
  const tapAction = inDetail ? '' : `onclick="event.stopPropagation();openPostDetail('${postId}')"`;
  return `
    <div class="${cls}" data-current="0" ${tapAction}>
      <div class="slides-track">${slides}</div>
      <button class="slide-btn prev" onclick="event.stopPropagation();slidePrev(this.parentElement)">&#8249;</button>
      <button class="slide-btn next" onclick="event.stopPropagation();slideNext(this.parentElement)">&#8250;</button>
      <div class="slide-dots">${dots}</div>
      <span class="slide-counter">1 / ${urls.length}</span>
    </div>`;
}
function slideNext(c) {
  const slides = c.querySelectorAll('.slide');
  let cur = +c.dataset.current;
  slides[cur].classList.remove('active');
  cur = (cur + 1) % slides.length;
  slides[cur].classList.add('active');
  c.dataset.current = cur;
  c.querySelectorAll('.slide-dot').forEach((d, i) => d.classList.toggle('active', i === cur));
  c.querySelector('.slide-counter').textContent = `${cur + 1} / ${slides.length}`;
}
function slidePrev(c) {
  const slides = c.querySelectorAll('.slide');
  let cur = +c.dataset.current;
  slides[cur].classList.remove('active');
  cur = (cur - 1 + slides.length) % slides.length;
  slides[cur].classList.add('active');
  c.dataset.current = cur;
  c.querySelectorAll('.slide-dot').forEach((d, i) => d.classList.toggle('active', i === cur));
  c.querySelector('.slide-counter').textContent = `${cur + 1} / ${slides.length}`;
}
function goToSlide(dot, idx) {
  const c = dot.closest('.post-slideshow');
  const slides = c.querySelectorAll('.slide');
  slides[+c.dataset.current].classList.remove('active');
  slides[idx].classList.add('active');
  c.dataset.current = idx;
  c.querySelectorAll('.slide-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  c.querySelector('.slide-counter').textContent = `${idx + 1} / ${slides.length}`;
}

function renderPosts() {
  const container = document.getElementById('posts-list');
  if (!container) return;
  let posts = state.posts;
  if (state.selectedCategoryId) {
    posts = posts.filter(p => p.category_id === state.selectedCategoryId);
  }
  if (posts.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><p>아직 게시물이 없어요<br>첫 게시물을 작성해보세요!</p></div>`;
    return;
  }
  container.innerHTML = posts.map(post => {
    const username = post.profiles?.username || '익명';
    const initial = username.charAt(0).toUpperCase();
    const avatarUrl = post.profiles?.avatar_url;
    const liked = state.postLikes.has(post.id);
    const scrapped = state.scrappedPosts.has(post.id);
    const timeAgo = getTimeAgo(new Date(post.created_at));
    const avatarHtml = makeAvatarHtml(avatarUrl, username);
    const imageUrls = post.image_urls?.length > 0 ? post.image_urls : (post.image_url ? [post.image_url] : []);
    const imageHtml = buildImageSlideshow(imageUrls, post.id);
    const contentHtml = post.content ? `<p class="post-content">${escHtml(post.content)}</p>` : '';
    const catHtml = post.categories?.name ? `<span class="post-cat-badge">${escHtml(post.categories.name)}</span>` : '';
    return `
      <div class="post-card" onclick="openPostDetail('${post.id}')">
        <div class="post-header">
          ${avatarHtml}
          <div class="post-user-info">
            <div class="post-username">${escHtml(username)}</div>
            <div class="post-time">${timeAgo}</div>
          </div>
          <button class="post-menu-btn" onclick="event.stopPropagation();openPostMenu('${post.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
        </div>
        ${catHtml}${imageHtml}${contentHtml}
        <div class="post-actions">
          <button class="post-action-btn${liked?' liked':''}" onclick="event.stopPropagation();toggleLike('${post.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            ${post.likes_count||0}
          </button>
          <button class="post-action-btn" onclick="event.stopPropagation();openPostDetail('${post.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            ${post.comments_count||0}
          </button>
          <button class="post-action-btn${scrapped?' scrapped':''}" onclick="event.stopPropagation();toggleScrap('${post.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${scrapped?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            ${post.scraps_count||0}
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
    <div class="profile-activity-tabs">
      <button class="profile-tab-btn${state.profileTab==='posts'?' active':''}" data-tab="posts" onclick="switchProfileTab('posts')">내가 쓴 글</button>
      <button class="profile-tab-btn${state.profileTab==='comments'?' active':''}" data-tab="comments" onclick="switchProfileTab('comments')">내 댓글</button>
      <button class="profile-tab-btn${state.profileTab==='scraps'?' active':''}" data-tab="scraps" onclick="switchProfileTab('scraps')">스크랩</button>
    </div>
    <div id="profile-tab-content" class="profile-tab-content"></div>
    <div class="menu-list" style="margin-top:14px">
      <div class="menu-item danger" onclick="handleSignOut()">
        <div class="menu-item-icon">🚪</div><span class="menu-item-label">로그아웃</span>
      </div>
    </div>`;
  switchProfileTab(state.profileTab);
}

async function switchProfileTab(tab) {
  state.profileTab = tab;
  document.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const content = document.getElementById('profile-tab-content');
  if (!content) return;
  content.innerHTML = '<div style="padding:40px 0;display:flex;justify-content:center"><div class="loading-spinner"></div></div>';
  if (tab === 'posts') await renderMyPosts(content);
  else if (tab === 'comments') await renderMyComments(content);
  else if (tab === 'scraps') await renderMyScraps(content);
}

async function renderMyPosts(container) {
  const { data } = await sb.from('posts')
    .select('*, profiles!posts_user_id_fkey(username,avatar_url), categories!posts_category_id_fkey(name)')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });
  if (!data?.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><p>작성한 게시물이 없어요</p></div>';
    return;
  }
  container.innerHTML = data.map(post => buildProfilePostCard(post)).join('');
}

async function renderMyComments(container) {
  const { data } = await sb.from('post_comments')
    .select('*, posts!post_comments_post_id_fkey(id, content)')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });
  if (!data?.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>작성한 댓글이 없어요</p></div>';
    return;
  }
  container.innerHTML = data.map(c => `
    <div class="activity-comment-item" onclick="openPostDetail('${c.post_id}')">
      <div class="activity-comment-text">${escHtml(c.content)}</div>
      ${c.posts?.content ? `<div class="activity-comment-post">└ ${escHtml(c.posts.content.slice(0, 50))}${c.posts.content.length > 50 ? '...' : ''}</div>` : ''}
      <div class="activity-comment-time">${getTimeAgo(new Date(c.created_at))}</div>
    </div>`).join('');
}

async function renderMyScraps(container) {
  const { data } = await sb.from('post_scraps')
    .select('post_id, posts!post_scraps_post_id_fkey(*, profiles!posts_user_id_fkey(username,avatar_url), categories!posts_category_id_fkey(name))')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });
  const posts = (data || []).map(s => s.posts).filter(Boolean);
  if (!posts.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔖</div><p>스크랩한 게시물이 없어요</p></div>';
    return;
  }
  container.innerHTML = posts.map(post => buildProfilePostCard(post)).join('');
}

function buildProfilePostCard(post) {
  const catHtml = post.categories?.name ? `<span class="post-cat-badge">${escHtml(post.categories.name)}</span>` : '';
  const contentPreview = post.content ? escHtml(post.content.slice(0, 80)) + (post.content.length > 80 ? '...' : '') : '';
  const thumbHtml = post.image_url ? `<div class="profile-post-thumb"><img src="${post.image_url}" alt=""></div>` : '';
  return `
    <div class="profile-post-item" onclick="openPostDetail('${post.id}')">
      <div class="profile-post-main">
        ${catHtml}
        <p class="profile-post-content">${contentPreview || '(이미지 게시물)'}</p>
        <div class="profile-post-meta">
          <span>${getTimeAgo(new Date(post.created_at))}</span>
          <span>❤️ ${post.likes_count||0}</span>
          <span>💬 ${post.comments_count||0}</span>
        </div>
      </div>
      ${thumbHtml}
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
  initCalendarSwipe();
  checkDeepLink();
  if (state.profile && !state.profile.setup_complete) {
    showProfileSetup();
  }
}

function showProfileSetup() {
  state.setupPhoto = null;
  state.setupProvince = null;
  state.setupDistrict = null;
  const usernameEl = document.getElementById('setup-username');
  if (usernameEl) usernameEl.value = state.profile?.username || '';
  const avatar = document.getElementById('setup-avatar');
  if (avatar) {
    if (state.profile?.avatar_url) {
      avatar.innerHTML = `<img src="${state.profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      avatar.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  }
  renderProvincePills();
  document.getElementById('setup-district-pills').style.display = 'none';
  document.getElementById('setup-location-display').classList.add('hidden');
  document.getElementById('profile-setup-overlay').classList.remove('hidden');
}

function renderProvincePills() {
  const container = document.getElementById('setup-province-pills');
  if (!container) return;
  container.innerHTML = Object.keys(KOREA_REGIONS).map(p =>
    `<button class="location-pill${state.setupProvince===p?' active':''}" onclick="selectProvince('${p}')">${p}</button>`
  ).join('');
}

function selectProvince(province) {
  state.setupProvince = province;
  state.setupDistrict = null;
  renderProvincePills();
  const districts = KOREA_REGIONS[province] || [];
  const dc = document.getElementById('setup-district-pills');
  dc.style.display = '';
  dc.innerHTML = districts.map(d =>
    `<button class="location-pill" onclick="selectDistrict('${d}')">${d}</button>`
  ).join('');
  document.getElementById('setup-location-display').classList.add('hidden');
}

function selectDistrict(district) {
  state.setupDistrict = district;
  document.querySelectorAll('#setup-district-pills .location-pill').forEach(b =>
    b.classList.toggle('active', b.textContent === district)
  );
  const display = document.getElementById('setup-location-display');
  display.textContent = `📍 ${state.setupProvince} ${district}`;
  display.classList.remove('hidden');
}

function handleSetupPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  state.setupPhoto = file;
  const reader = new FileReader();
  reader.onload = e => {
    const avatar = document.getElementById('setup-avatar');
    if (avatar) avatar.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function saveProfileSetup() {
  const username = document.getElementById('setup-username').value.trim();
  if (!username) { alert('닉네임을 입력해주세요.'); return; }
  const btn = document.querySelector('#profile-setup-overlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
  try {
    let avatarUrl = state.profile?.avatar_url || null;
    if (state.setupPhoto) {
      const ext = state.setupPhoto.name.split('.').pop();
      const path = `avatars/${state.user.id}.${ext}`;
      await sb.storage.from('post-images').upload(path, state.setupPhoto, { upsert: true });
      const { data } = sb.storage.from('post-images').getPublicUrl(path);
      avatarUrl = data.publicUrl;
    }
    const location = state.setupProvince && state.setupDistrict
      ? `${state.setupProvince} ${state.setupDistrict}`
      : (state.setupProvince || null);
    const { error } = await sb.from('profiles').update({
      username, avatar_url: avatarUrl, location, setup_complete: true,
      updated_at: new Date().toISOString(),
    }).eq('id', state.user.id);
    if (error) throw error;
    state.profile = { ...state.profile, username, avatar_url: avatarUrl, location, setup_complete: true };
    document.getElementById('profile-setup-overlay').classList.add('hidden');
    renderAll();
  } catch (err) {
    alert('저장 실패: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = '시작하기'; }
  }
}

async function skipProfileSetup() {
  await sb.from('profiles').update({ setup_complete: true }).eq('id', state.user.id);
  state.profile = { ...state.profile, setup_complete: true };
  document.getElementById('profile-setup-overlay').classList.add('hidden');
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
  if (pageName === 'notify') renderNotifications();
}

function switchInnerTab(tab, btn) {
  state.innerTab = tab;
  document.querySelectorAll('.inner-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderRoutineList();
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월화수목금토일

function openRoutinePicker() {
  state.pickerType = 'exercise';
  state.pickerSelectedDays = { exercise: new Set(), diet: new Set() };
  renderPickerTypeTabs();
  renderPickerDays();
  renderPickerRoutineList();
  openModal('modal-routine-picker');
}

function switchPickerTab(type) {
  state.pickerType = type;
  renderPickerTypeTabs();
  renderPickerDays();
  renderPickerRoutineList();
}

function renderPickerTypeTabs() {
  document.querySelectorAll('.picker-type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === state.pickerType);
  });
}

function renderPickerDays() {
  const row = document.getElementById('picker-day-row');
  if (!row) return;
  const availDays = new Set(
    state.routines.filter(r => r.type === state.pickerType).flatMap(r => r.days_of_week || [])
  );
  const selectedDays = state.pickerSelectedDays[state.pickerType];
  row.innerHTML = DAY_ORDER.map(d => {
    const has = availDays.has(d);
    const sel = selectedDays.has(d);
    return `<button class="picker-day-btn${sel ? ' active' : ''}${!has ? ' disabled' : ''}"
      onclick="togglePickerDay(${d})" ${!has ? 'disabled' : ''}>${DAY_LABELS[d]}</button>`;
  }).join('');
}

function togglePickerDay(day) {
  const days = state.pickerSelectedDays[state.pickerType];
  days.has(day) ? days.delete(day) : days.add(day);
  renderPickerDays();
  renderPickerRoutineList();
}

function renderPickerRoutineList() {
  const list = document.getElementById('routine-picker-list');
  if (!list) return;
  const days = state.pickerSelectedDays[state.pickerType];
  let routines = state.routines.filter(r => r.type === state.pickerType);
  if (days.size > 0) {
    routines = routines.filter(r => r.days_of_week?.some(d => days.has(d)));
  }
  if (!routines.length) {
    const msg = days.size > 0 ? '선택한 요일에 루틴이 없어요' : '루틴이 없어요. 먼저 루틴을 추가해주세요.';
    list.innerHTML = `<div style="padding:20px 0;text-align:center;color:var(--text-muted);font-size:13px">${msg}</div>`;
    return;
  }
  list.innerHTML = routines.map(r => {
    const meta = r.meal_time || r.time_of_day || '';
    const dayStr = (r.days_of_week || []).map(d => DAY_LABELS[d]).join('');
    return `<div class="picker-routine-row">
      <span class="picker-routine-name">${escHtml(r.name)}</span>
      <span class="picker-routine-meta">${dayStr}${meta ? ' · ' + meta : ''}</span>
    </div>`;
  }).join('');
}

function confirmRoutinePick() {
  const exDays = state.pickerSelectedDays.exercise;
  const dietDays = state.pickerSelectedDays.diet;
  if (exDays.size === 0 && dietDays.size === 0) {
    showToast('요일을 선택해주세요');
    return;
  }
  const selected = state.routines.filter(r => {
    const days = r.type === 'exercise' ? exDays : dietDays;
    return days.size > 0 && r.days_of_week?.some(d => days.has(d));
  });
  state.selectedRoutineIds = new Set(selected.map(r => r.id));
  closeModal('modal-routine-picker');
  renderSharedRoutinesPreview();
}

function renderSharedRoutinesPreview() {
  const preview = document.getElementById('shared-routines-preview');
  if (!preview) return;
  if (!state.selectedRoutineIds.size) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  const selected = state.routines.filter(r => state.selectedRoutineIds.has(r.id));
  const exCount = selected.filter(r => r.type === 'exercise').length;
  const dietCount = selected.filter(r => r.type === 'diet').length;
  const allDays = new Set(selected.flatMap(r => r.days_of_week || []));
  const dayStr = DAY_ORDER.filter(d => allDays.has(d)).map(d => DAY_LABELS[d]).join('');
  preview.classList.remove('hidden');
  preview.innerHTML = `
    <div class="shared-routines-label">공유할 루틴 · ${dayStr} · 총 ${selected.length}개</div>
    ${exCount ? `<div class="shared-routine-chip">💪 운동루틴 ${exCount}개</div>` : ''}
    ${dietCount ? `<div class="shared-routine-chip">🥗 식단루틴 ${dietCount}개</div>` : ''}
    <button class="shared-routines-clear" onclick="clearSharedRoutines()">루틴 제거</button>`;
}

function clearSharedRoutines() {
  state.selectedRoutineIds = new Set();
  state.pickerSelectedDays = { exercise: new Set(), diet: new Set() };
  renderSharedRoutinesPreview();
}

// ── 글쓰기 ──
function openCompose(postId = null) {
  state.selectedPhotos = [];
  state.editingPostId = postId;
  const post = postId ? state.posts.find(p => p.id === postId) : null;
  state.composeCategoryId = post?.category_id || null;
  // Pre-populate from existing post's shared_routines in edit mode
  const existingRoutineIds = post?.shared_routines?.map(r => r.id) || [];
  state.selectedRoutineIds = new Set(existingRoutineIds);
  state.pickerSelectedDays = { exercise: new Set(), diet: new Set() };

  const textarea = document.getElementById('post-content');
  textarea.value = post?.content || '';
  textarea.style.height = 'auto';

  if (post?.image_urls?.length > 0) {
    state.selectedPhotos = post.image_urls.map(url => ({ file: null, previewUrl: url, isExisting: true }));
  } else if (post?.image_url) {
    state.selectedPhotos = [{ file: null, previewUrl: post.image_url, isExisting: true }];
  }
  renderPhotoPreview();
  renderSharedRoutinesPreview();

  const btn = document.getElementById('compose-post-btn');
  btn.disabled = !post?.content && state.selectedPhotos.length === 0;
  btn.textContent = postId ? '수정' : '게시';
  document.getElementById('compose-title').textContent = postId ? '게시물 수정' : '새 게시물';

  const name = state.profile?.username || '사용자';
  document.getElementById('compose-username').textContent = name;
  const avatarEl = document.getElementById('compose-avatar');
  if (state.profile?.avatar_url) {
    avatarEl.style.backgroundImage = `url(${state.profile.avatar_url})`;
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }
  renderComposeCategoryPills();
  const composePage = document.getElementById('page-compose');
  composePage.classList.remove('hidden-page');
  composePage.classList.add('active');
  document.querySelector('.bottom-nav').style.display = 'none';
  if (!postId) textarea.focus();
}

function closeCompose() {
  const composePage = document.getElementById('page-compose');
  composePage.classList.remove('active');
  composePage.classList.add('hidden-page');
  document.querySelector('.bottom-nav').style.display = '';
  state.selectedPhotos = [];
  state.composeCategoryId = null;
}

function onComposeInput(textarea) {
  const btn = document.getElementById('compose-post-btn');
  btn.disabled = !textarea.value.trim() && state.selectedPhotos.length === 0;
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function handlePhotoSelect(event) {
  const files = Array.from(event.target.files);
  event.target.value = '';
  if (!files.length) return;
  const remaining = 5 - state.selectedPhotos.length;
  if (remaining <= 0) { showToast('사진은 최대 5장까지 첨부할 수 있어요'); return; }
  const toAdd = files.slice(0, remaining);
  if (files.length > remaining) showToast(`사진은 최대 5장까지만 가능해요 (${files.length - remaining}장 제외)`);
  toAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      state.selectedPhotos.push({ file, previewUrl: e.target.result, isExisting: false });
      renderPhotoPreview();
      document.getElementById('compose-post-btn').disabled = false;
    };
    reader.readAsDataURL(file);
  });
}

function removePhoto(index) {
  state.selectedPhotos.splice(index, 1);
  renderPhotoPreview();
  const btn = document.getElementById('compose-post-btn');
  btn.disabled = !document.getElementById('post-content').value.trim() && state.selectedPhotos.length === 0;
}

function renderPhotoPreview() {
  const preview = document.getElementById('photo-preview');
  if (state.selectedPhotos.length === 0) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  preview.classList.remove('hidden');
  const items = state.selectedPhotos.map((p, i) => `
    <div class="photo-preview-item">
      <img src="${p.previewUrl}" alt="사진 ${i + 1}">
      <button class="photo-remove" onclick="removePhoto(${i})">✕</button>
      ${i === 0 ? '<span class="photo-main-badge">대표</span>' : ''}
    </div>`).join('');
  const addBtn = state.selectedPhotos.length < 5 ? `
    <button class="photo-add-more" onclick="document.getElementById('photo-input').click()">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>${state.selectedPhotos.length}/5</span>
    </button>` : '';
  preview.innerHTML = items + addBtn;
}

// ── 모달 ──
document.addEventListener('click', e => {
  if (!e.target.closest('.routine-item-wrap')) closeAllSwipes();
});

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function handleOverlayClick(e, id) { if (e.target === e.currentTarget) closeModal(id); }

function openAddRoutineModal() {
  state.editingRoutineId = null;
  document.getElementById('routine-modal-title').textContent = '루틴 추가';
  document.getElementById('routine-name').value = '';
  const defaultType = state.innerTab === 'diet' ? 'diet' : 'exercise';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === defaultType));
  document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.day) >= 1 && parseInt(b.dataset.day) <= 5));
  document.querySelectorAll('.tod-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('meal-time-group').style.display = defaultType === 'diet' ? '' : 'none';
  document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
  openModal('modal-add-routine');
}

function openEditRoutineModal(routineId) {
  const r = state.routines.find(x => x.id === routineId);
  if (!r) return;
  closeAllSwipes();
  state.editingRoutineId = routineId;
  document.getElementById('routine-modal-title').textContent = '루틴 수정';
  document.getElementById('routine-name').value = r.name;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === r.type));
  document.getElementById('meal-time-group').style.display = r.type === 'diet' ? '' : 'none';
  document.querySelectorAll('.meal-btn').forEach(b => b.classList.toggle('active', b.dataset.meal === r.meal_time));
  document.querySelectorAll('.tod-btn').forEach(b => b.classList.toggle('active', b.dataset.tod === (r.time_of_day || '')));
  document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('active', r.days_of_week?.includes(parseInt(b.dataset.day))));
  openModal('modal-add-routine');
}

function selectType(btn) {
  toggleButtonGroup(btn, '.type-btn');
  document.getElementById('meal-time-group').style.display = btn.dataset.type === 'diet' ? '' : 'none';
}

function toggleDay(btn) { btn.classList.toggle('active'); }
function toggleMeal(btn) { toggleButtonGroup(btn, '.meal-btn'); }
function toggleTod(btn) { toggleButtonGroup(btn, '.tod-btn'); }

function openEditProfileModal() {
  document.getElementById('edit-username').value = state.profile?.username || '';
  document.getElementById('edit-bio').value = state.profile?.bio || '';
  openModal('modal-edit-profile');
}

async function saveRoutine() {
  const name = document.getElementById('routine-name').value.trim();
  if (!name) { alert('루틴 이름을 입력해주세요.'); return; }
  const type = document.querySelector('.type-btn.active')?.dataset.type || 'exercise';
  const days = Array.from(document.querySelectorAll('.day-btn.active')).map(b => parseInt(b.dataset.day));
  if (days.length === 0) { alert('요일을 하나 이상 선택해주세요.'); return; }
  const mealTime = type === 'diet' ? (document.querySelector('.meal-btn.active')?.dataset.meal || null) : null;
  if (type === 'diet' && !mealTime) { alert('식사 종류를 선택해주세요.'); return; }
  const timeOfDay = document.querySelector('.tod-btn.active')?.dataset.tod || '';
  closeModal('modal-add-routine');
  if (state.editingRoutineId) {
    await updateRoutine(state.editingRoutineId, { name, type, days, mealTime, timeOfDay: timeOfDay || null });
  } else {
    await addRoutine({ name, type, days, mealTime, timeOfDay: timeOfDay || null });
  }
}

// ── 월/년 피커 ──
function openMonthPicker() {
  state.pickerYear = state.selectedDate.getFullYear();
  state.pickerMonth = state.selectedDate.getMonth();
  document.getElementById('picker-year-display').textContent = state.pickerYear;
  renderPickerMonths();
  openModal('modal-month-picker');
}

function changePickerYear(delta) {
  state.pickerYear += delta;
  document.getElementById('picker-year-display').textContent = state.pickerYear;
  renderPickerMonths();
}

function renderPickerMonths() {
  const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  document.getElementById('picker-months').innerHTML = months.map((m, i) =>
    `<button class="picker-month-btn${i===state.pickerMonth?' active':''}" onclick="selectPickerMonth(${i})">${m}</button>`
  ).join('');
}

function selectPickerMonth(month) {
  state.pickerMonth = month;
  renderPickerMonths();
}

async function confirmMonthPicker() {
  closeModal('modal-month-picker');
  const newDate = new Date(state.selectedDate);
  newDate.setFullYear(state.pickerYear);
  newDate.setMonth(state.pickerMonth);
  const daysInMonth = new Date(state.pickerYear, state.pickerMonth + 1, 0).getDate();
  if (newDate.getDate() > daysInMonth) newDate.setDate(daysInMonth);
  await selectDate(newDate);
}

// ── 캘린더 스와이프 ──
function initCalendarSwipe() {
  const cal = document.getElementById('week-calendar');
  if (!cal) return;
  let startX = 0, startY = 0, moved = false;
  cal.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = false;
  }, { passive: true });
  cal.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) moved = true;
  }, { passive: true });
  cal.addEventListener('touchend', e => {
    if (!moved) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 40) return;
    const newDate = new Date(state.selectedDate);
    newDate.setDate(newDate.getDate() + (dx < 0 ? 7 : -7));
    selectDate(newDate);
  }, { passive: true });
}

// ── 스와이프로 수정/삭제 ──
let activeSwipeEl = null;

function closeAllSwipes() {
  document.querySelectorAll('.routine-card.swiped').forEach(c => {
    c.classList.remove('swiped');
    c.style.transform = '';
  });
  activeSwipeEl = null;
}

function setupSwipeAndDrag() {
  document.querySelectorAll('.routine-item-wrap').forEach(wrap => {
    const card = wrap.querySelector('.routine-card');
    const handle = wrap.querySelector('.drag-handle');
    if (!card || !handle) return;
    attachSwipe(card);
    attachDrag(handle, wrap);
  });
}

function attachSwipe(card) {
  let startX = 0, startY = 0, dragging = false, isDrag = false;
  const REVEAL = 160;

  card.addEventListener('touchstart', e => {
    if (e.target.closest('.drag-handle') || e.target.closest('.routine-check')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = false; isDrag = false;
    card.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!dragging && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    if (!dragging) {
      dragging = true;
      isDrag = Math.abs(dx) > Math.abs(dy);
    }
    if (!isDrag) return;

    if (dx > 0 && !card.classList.contains('swiped')) return;
    let cur = card.classList.contains('swiped') ? -REVEAL : 0;
    cur += dx;
    cur = Math.max(-REVEAL, Math.min(0, cur));
    card.style.transform = `translateX(${cur}px)`;
  }, { passive: true });

  card.addEventListener('touchend', e => {
    if (!isDrag) return;
    const dx = e.changedTouches[0].clientX - startX;
    card.style.transition = 'transform 0.22s ease';
    const wasOpen = card.classList.contains('swiped');
    if (!wasOpen && dx < -50) {
      closeAllSwipes();
      card.classList.add('swiped');
      card.style.transform = `translateX(-${REVEAL}px)`;
      activeSwipeEl = card;
    } else if (wasOpen && dx > 50) {
      card.classList.remove('swiped');
      card.style.transform = '';
      activeSwipeEl = null;
    } else if (!wasOpen) {
      card.style.transform = '';
    } else {
      card.style.transform = `translateX(-${REVEAL}px)`;
    }
  }, { passive: true });
}

// ── 드래그로 순서 변경 ──
let drag = null;

function attachDrag(handle, wrap) {
  handle.addEventListener('touchstart', e => {
    e.stopPropagation();
    const rect = wrap.getBoundingClientRect();
    const touchY = e.touches[0].clientY;
    const clone = wrap.cloneNode(true);
    Object.assign(clone.style, {
      position:'fixed', left:rect.left+'px', top:rect.top+'px',
      width:rect.width+'px', zIndex:'1000', pointerEvents:'none',
      opacity:'0.9', boxShadow:'0 10px 30px rgba(0,0,0,0.2)',
      transform:'scale(1.02)', transition:'none',
    });
    document.body.appendChild(clone);
    wrap.style.opacity = '0.4';
    drag = { wrap, clone, startY: touchY, originTop: rect.top, routineId: wrap.dataset.id, targetIndex: -1 };
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
  }, { passive: true });
}

function onDragMove(e) {
  if (!drag) return;
  e.preventDefault();
  const dy = e.touches[0].clientY - drag.startY;
  drag.clone.style.top = (drag.originTop + dy) + 'px';
  const items = Array.from(document.querySelectorAll('.routine-item-wrap')).filter(el => el !== drag.wrap);
  const centerY = drag.originTop + dy + drag.clone.offsetHeight / 2;
  let targetIndex = items.length;
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (centerY < r.top + r.height / 2) { targetIndex = i; break; }
  }
  drag.targetIndex = targetIndex;
  document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
  const indicator = document.createElement('div');
  indicator.className = 'drag-placeholder';
  const list = document.getElementById('routine-list');
  const ref = items[targetIndex];
  if (ref) list.insertBefore(indicator, ref.closest ? ref : ref);
  else list.appendChild(indicator);
}

async function onDragEnd() {
  if (!drag) return;
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);
  document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
  drag.clone.remove();
  drag.wrap.style.opacity = '';

  const typeFilter = state.innerTab === 'diet' ? 'diet' : 'exercise';
  const dow = state.selectedDate.getDay();
  let dayRoutines = state.routines
    .filter(r => r.days_of_week?.includes(dow) && r.type === typeFilter)
    .sort((a,b) => (a.order_index??999)-(b.order_index??999));

  const fromIndex = dayRoutines.findIndex(r => r.id === drag.routineId);
  let toIndex = drag.targetIndex;
  if (fromIndex === -1 || fromIndex === toIndex) { drag = null; renderRoutineList(); return; }

  dayRoutines.splice(fromIndex, 1);
  if (toIndex > fromIndex) toIndex--;
  toIndex = Math.max(0, Math.min(toIndex, dayRoutines.length));
  dayRoutines.splice(toIndex, 0, state.routines.find(r => r.id === drag.routineId));

  dayRoutines.forEach((r, i) => {
    const sr = state.routines.find(x => x.id === r.id);
    if (sr) sr.order_index = i;
  });

  drag = null;
  renderRoutineList();

  for (const r of dayRoutines) {
    await sb.from('routines').update({ order_index: r.order_index }).eq('id', r.id);
  }
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

function makeAvatarHtml(avatarUrl, username, cls = 'avatar') {
  const initial = (username || '?').charAt(0).toUpperCase();
  return avatarUrl
    ? `<div class="${cls}"><img src="${avatarUrl}" alt=""></div>`
    : `<div class="${cls}">${initial}</div>`;
}

function toggleButtonGroup(btn, selector) {
  document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── 알림 ──
async function loadNotifications() {
  if (!state.user) return;
  const { data } = await sb.from('notifications')
    .select('*, profiles!notifications_from_user_id_fkey(username, avatar_url), posts!notifications_post_id_fkey(content)')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  state.notifications = data || [];
}

function updateNotifyBadge() {
  const badge = document.getElementById('notify-badge');
  if (!badge) return;
  const unread = state.notifications.filter(n => !n.is_read).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifications() {
  const list = document.getElementById('notify-list');
  if (!list) return;
  if (!state.notifications.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><p>아직 알림이 없어요</p></div>';
    return;
  }
  list.innerHTML = state.notifications.map(n => {
    const from = n.profiles?.username || '누군가';
    const postText = n.posts?.content ? `"${escHtml(n.posts.content.slice(0, 30))}${n.posts.content.length > 30 ? '...' : ''}"` : '';
    const typeText = n.type === 'comment' ? '게시물에 댓글을 달았어요' : '댓글에 대댓글을 달았어요';
    const timeAgo = getTimeAgo(new Date(n.created_at));
    const initial = from.charAt(0).toUpperCase();
    const avatarHtml = n.profiles?.avatar_url
      ? `<div class="notify-avatar"><img src="${n.profiles.avatar_url}" alt=""></div>`
      : `<div class="notify-avatar">${initial}</div>`;
    return `
      <div class="notify-item${n.is_read ? '' : ' unread'}" onclick="onNotifyClick('${n.id}','${n.post_id}')">
        ${avatarHtml}
        <div class="notify-item-content">
          <div class="notify-item-text"><strong>${escHtml(from)}</strong>님이 ${typeText}</div>
          ${postText ? `<div class="notify-item-post">${postText}</div>` : ''}
          <div class="notify-item-time">${timeAgo}</div>
        </div>
        ${!n.is_read ? '<div class="notify-dot"></div>' : ''}
      </div>`;
  }).join('');
}

async function onNotifyClick(notifId, postId) {
  const notif = state.notifications.find(n => n.id === notifId);
  if (notif && !notif.is_read) {
    notif.is_read = true;
    await sb.from('notifications').update({ is_read: true }).eq('id', notifId);
    updateNotifyBadge();
    renderNotifications();
  }
  if (postId) openPostDetail(postId);
}

async function markAllRead() {
  const unreadIds = state.notifications.filter(n => !n.is_read).map(n => n.id);
  if (!unreadIds.length) return;
  state.notifications.forEach(n => { n.is_read = true; });
  await sb.from('notifications').update({ is_read: true }).eq('user_id', state.user.id);
  updateNotifyBadge();
  renderNotifications();
}

// ── 게시물 상세 / 댓글 ──
async function openPostDetail(postId) {
  state.currentPostId = postId;
  state.replyToCommentId = null;
  state.replyToUsername = null;
  const post = state.posts.find(p => p.id === postId);
  const body = document.getElementById('post-detail-body');
  body.innerHTML = '<div style="padding:60px 0;display:flex;justify-content:center"><div class="loading-spinner"></div></div>';
  document.getElementById('comment-text').value = '';
  cancelReply();
  openModal('modal-post-detail');
  const comments = await loadComments(postId);
  state.currentComments = comments;
  renderPostDetail(post, comments);
}

async function loadComments(postId) {
  const { data } = await sb.from('post_comments')
    .select('*, profiles!post_comments_user_id_fkey(username, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  return data || [];
}

function renderPostDetail(post, comments) {
  const body = document.getElementById('post-detail-body');
  if (!post) { body.innerHTML = '<div class="no-comments">게시물을 불러올 수 없어요</div>'; return; }

  const username = post.profiles?.username || '익명';
  const avatarUrl = post.profiles?.avatar_url;
  const avatarHtml = makeAvatarHtml(avatarUrl, username);
  const catHtml = post.categories?.name ? `<span class="post-cat-badge">${escHtml(post.categories.name)}</span>` : '';
  const timeAgo = getTimeAgo(new Date(post.created_at));
  const liked = state.postLikes.has(post.id);
  const scrapped = state.scrappedPosts.has(post.id);

  const topComments = comments.filter(c => !c.parent_id);
  const repliesMap = {};
  comments.filter(c => c.parent_id).forEach(c => {
    if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = [];
    repliesMap[c.parent_id].push(c);
  });
  const commentHtml = topComments.length === 0
    ? '<div class="no-comments">첫 댓글을 남겨보세요!</div>'
    : topComments.map(c => buildCommentHtml(c, repliesMap[c.id] || [])).join('');

  body.innerHTML = `
    <div class="pd-author-row">
      ${avatarHtml}
      <div class="pd-user-info">
        <div class="pd-username">${escHtml(username)}</div>
        <div class="pd-time">${timeAgo}</div>
      </div>
    </div>
    ${catHtml ? `<div class="pd-tags">${catHtml}</div>` : ''}
    ${post.content ? `<p class="pd-content">${escHtml(post.content)}</p>` : ''}
    ${(() => { const u = post.image_urls?.length > 0 ? post.image_urls : (post.image_url ? [post.image_url] : []); return buildImageSlideshow(u, post.id, true); })()}
    ${buildRoutineCards(post.shared_routines)}
    <div class="pd-actions">
      <button class="pd-action-btn${liked?' liked':''}" onclick="toggleLike('${post.id}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        ${post.likes_count||0}
      </button>
      <span class="pd-action-stat">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        ${comments.length}
      </span>
      <div class="pd-actions-spacer"></div>
      <button class="pd-action-btn${scrapped?' scrapped':''}" onclick="toggleScrap('${post.id}')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${scrapped?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        스크랩
      </button>
    </div>
    <div class="comment-section-label">댓글 ${comments.length}개</div>
    <div class="comment-list">${commentHtml}</div>`;
}

function buildCommentHtml(comment, replies) {
  const u = comment.profiles?.username || '익명';
  const avatarHtml = makeAvatarHtml(comment.profiles?.avatar_url, u, 'comment-avatar');
  const timeAgo = getTimeAgo(new Date(comment.created_at));
  const repliesHtml = replies.map(r => buildCommentHtml(r, [])).join('');
  const isReply = !!comment.parent_id;
  return `
    <div class="comment-item${isReply ? ' reply' : ''}">
      ${avatarHtml}
      <div class="comment-body">
        <div class="comment-header">
          <span class="comment-username">${escHtml(u)}</span>
          <span class="comment-dot">·</span>
          <span class="comment-time">${timeAgo}</span>
          <button class="comment-more-btn" onclick="void(0)">···</button>
        </div>
        <div class="comment-content">${escHtml(comment.content)}</div>
        <div class="comment-actions">
          <button class="comment-like-action"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> 좋아요</button>
          ${!isReply ? `<button class="comment-reply-btn" onclick="setReplyTo('${comment.id}','${escHtml(u)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> 답글쓰기</button>` : ''}
        </div>
      </div>
    </div>
    ${repliesHtml}`;
}

function setReplyTo(commentId, username) {
  state.replyToCommentId = commentId;
  state.replyToUsername = username;
  const hint = document.getElementById('reply-hint');
  document.getElementById('reply-hint-name').textContent = username;
  hint.classList.remove('hidden');
  document.getElementById('comment-text').focus();
}

function cancelReply() {
  state.replyToCommentId = null;
  state.replyToUsername = null;
  const hint = document.getElementById('reply-hint');
  if (hint) hint.classList.add('hidden');
}

function autoResizeComment(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
}

async function submitComment() {
  const text = document.getElementById('comment-text').value.trim();
  if (!text || !state.currentPostId) return;
  const btn = document.querySelector('.comment-submit-btn');
  btn.disabled = true;
  await addComment(state.currentPostId, text, state.replyToCommentId);
  document.getElementById('comment-text').value = '';
  document.getElementById('comment-text').style.height = 'auto';
  cancelReply();
  btn.disabled = false;
}

async function addComment(postId, content, parentId = null) {
  const { data: comment, error } = await sb.from('post_comments').insert({
    post_id: postId, user_id: state.user.id, content, parent_id: parentId,
  }).select().single();
  if (error) { alert('댓글 실패: ' + error.message); return; }

  const post = state.posts.find(p => p.id === postId);
  if (post) {
    post.comments_count = (post.comments_count || 0) + 1;
    await sb.from('posts').update({ comments_count: post.comments_count }).eq('id', postId);
  }

  if (parentId) {
    await sendReplyNotifications(postId, parentId, comment.id);
  } else {
    await sendCommentNotifications(postId, comment.id);
  }

  const comments = await loadComments(postId);
  state.currentComments = comments;
  renderPostDetail(post, comments);
  renderPosts();
}

async function sendCommentNotifications(postId, commentId) {
  const post = state.posts.find(p => p.id === postId);
  const { data: existingComments } = await sb.from('post_comments')
    .select('user_id').eq('post_id', postId).is('parent_id', null);

  const recipients = new Set();
  if (post?.user_id && post.user_id !== state.user.id) recipients.add(post.user_id);
  (existingComments || []).forEach(c => { if (c.user_id !== state.user.id) recipients.add(c.user_id); });

  if (!recipients.size) return;
  await sb.from('notifications').insert(
    Array.from(recipients).map(userId => ({
      user_id: userId, type: 'comment',
      post_id: postId, comment_id: commentId, from_user_id: state.user.id,
    }))
  );
}

async function sendReplyNotifications(postId, parentId, commentId) {
  const { data: related } = await sb.from('post_comments')
    .select('user_id')
    .or(`id.eq.${parentId},parent_id.eq.${parentId}`);

  const recipients = new Set();
  (related || []).forEach(c => { if (c.user_id !== state.user.id) recipients.add(c.user_id); });

  if (!recipients.size) return;
  await sb.from('notifications').insert(
    Array.from(recipients).map(userId => ({
      user_id: userId, type: 'reply',
      post_id: postId, comment_id: commentId, from_user_id: state.user.id,
    }))
  );
}

init();
