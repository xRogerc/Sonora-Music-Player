const isDevFrontend = ['8001', '8080', '5679'].includes(location.port);
let API = isDevFrontend ? 'http://localhost:8000/api' : '/api';
if (window.SonoraBridge) {
  try {
    const bridgeApi = window.SonoraBridge.getApiBase();
    if (bridgeApi) API = bridgeApi + '/api';
  } catch (e) {}
}

const state = {
  token: localStorage.getItem('mp_token'),
  username: localStorage.getItem('mp_username') || '',
  view: 'home',
  query: '',
  results: [],
  favorites: [],
  playlists: [],
  playlistDetail: null,
  history: [],
  userPaused: false,
  favStatus: new Map(),
  current: null,
  currentIndex: -1,
  queue: [],
  queueMode: 'list',
  related: [],
  relatedFor: null,
  shuffle: false,
  repeat: false,
  authed: false,
};

const PLAYER = document.getElementById('player');
const app = document.getElementById('app');

const trackColors = ['var(--lime)', 'var(--orange)', '#f4f5f1'];

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Token ${state.token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 401) {
    logout(false);
    throw new Error('Sessão expirada');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && data.detail) || 'Erro');
  return data;
}

function songFields(song) {
  return {
    video_id: song.video_id,
    title: song.title,
    artists: song.artists,
    album: song.album,
    duration: song.duration,
    thumbnails: song.thumbnails,
  };
}

function findSong(videoId) {
  for (const source of [
    state.results,
    state.favorites.map((f) => f.song),
    state.history.map((h) => h.song),
    (state.playlistDetail || { songs: [] }).songs.map((r) => r.song),
  ]) {
    const found = source.find((s) => s.video_id === videoId);
    if (found) return found;
  }
  return null;
}

/* ================= AUTH ================= */

function renderAuth() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-brand">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <h1>SONORA</h1>
        <p>Seu player, busque no YouTube Music</p>
      </div>
      <div class="auth-card">
        <div id="auth-form"></div>
        <div class="auth-error" id="auth-error"></div>
      </div>
    </div>`;
  showAuthForm('login');
}

function showAuthForm(mode) {
  const wrap = document.getElementById('auth-form');
  if (mode === 'register') {
    wrap.innerHTML = `
      <form id="auth-form-el" novalidate>
        <div class="field"><label>Usuário</label><input name="username" required autocomplete="username" /></div>
        <div class="field"><label>Senha</label><input name="password" type="password" required minlength="4" autocomplete="new-password" /></div>
        <button class="btn" type="submit">Criar conta</button>
        <button type="button" class="link-btn" onclick="showAuthForm('login')">Já tenho conta — entrar</button>
      </form>`;
  } else {
    wrap.innerHTML = `
      <form id="auth-form-el" novalidate>
        <div class="field"><label>Usuário</label><input name="username" required autocomplete="username" /></div>
        <div class="field"><label>Senha</label><input name="password" type="password" required autocomplete="current-password" /></div>
        <button class="btn" type="submit">Entrar</button>
        <button type="button" class="link-btn" onclick="showAuthForm('register')">Criar conta nova</button>
      </form>`;
  }
  document.getElementById('auth-form-el').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    setAuthError('');
    if (mode === 'register') {
      api('/auth/register/', {
        method: 'POST',
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
      })
        .then(() => doLoginFor(data.get('username'), data.get('password')))
        .catch((err) => setAuthError(err.message));
    } else {
      doLoginFor(data.get('username'), data.get('password'));
    }
  });
}

function setAuthError(message) {
  const el = document.getElementById('auth-error');
  if (el) el.textContent = message || '';
}

async function doLoginFor(username, password) {
  try {
    const data = await api('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.token = data.token;
    state.username = data.username;
    localStorage.setItem('mp_token', data.token);
    localStorage.setItem('mp_username', data.username);
    state.authed = true;
    initApp();
  } catch (err) {
    setAuthError(err.message);
  }
}

async function logout(rerender = true) {
  if (state.token) {
    try {
      await api('/auth/logout/', { method: 'POST' });
    } catch (_) {}
  }
  state.token = null;
  state.username = '';
  localStorage.removeItem('mp_token');
  localStorage.removeItem('mp_username');
  PLAYER.pause();
  PLAYER.removeAttribute('src');
  state.authed = false;
  state.related = [];
  state.relatedFor = null;
  renderRelatedRail();
  if (rerender) renderAuth();
}

/* ================= APP ================= */

function renderApp() {
  app.innerHTML = `
  <div class="frame">
    <nav class="sidebar">
      <div class="sidebar-top">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/></svg>
        </div>
        <div class="side-icons">
          <div class="icon-btn active" data-view="search" title="Buscar">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <div class="icon-btn" data-view="favorites" title="Favoritos">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-6.7-4.35-9.3-8.2C1.1 10.5 1.7 7 4.8 5.7 7 4.8 9.3 5.6 12 8.2c2.7-2.6 5-3.4 7.2-2.5 3.1 1.3 3.7 4.8 2.1 7.1C18.7 16.65 12 21 12 21z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          </div>
          <div class="icon-btn" data-view="playlists" title="Playlists">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <div class="icon-btn" data-view="history" title="Histórico">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
        </div>
      </div>
      <button class="add-btn" id="addBtn" title="Nova playlist">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </nav>

    <main>
      <div class="topbar">
        <div class="brand">
          <h1>SONORA</h1>
          <p>Seu player, busque no YouTube Music</p>
        </div>
        <div class="top-actions">
          <div class="pill search-wrap">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <input id="searchInput" type="search" placeholder="Buscar música, artista, álbum..." value="${esc(state.query)}">
          </div>
          <div class="pill" id="logoutBtn">
            <svg viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Sair
          </div>
          <div class="avatar" id="avatar">${esc((state.username[0] || '?').toUpperCase())}</div>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-head">
            <h2>Tocando agora</h2>
            <span class="dots" style="display:flex;gap:6px;">
              <button class="mini-btn" id="lyricsBtn" title="Ver letra">
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/><path d="M9 8l12-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
              <button class="mini-btn fav" id="npFav" title="Favoritar">♡</button>
              <button class="mini-btn" id="npAdd" title="Adicionar à playlist">＋</button>
            </span>
          </div>
          <div class="cover" id="cover">
            <div class="bars" id="visualizer"></div>
          </div>
          <h3 class="track-title" id="nowTitle">Nenhuma música na fila</h3>
          <p class="track-artist" id="nowArtist">Faça uma busca para começar</p>

          <div class="progress-row">
            <span class="time" id="curTime">0:00</span>
            <div class="progress" id="progressBar">
              <div class="fill" id="progressFill"></div>
              <div class="knob" id="progressKnob"></div>
            </div>
            <span class="time end" id="durTime">0:00</span>
          </div>

          <div class="controls">
            <div class="ctrl-btn toggle" id="shuffleBtn" title="Aleatório">
              <svg viewBox="0 0 24 24" fill="none"><path d="M17 3h4v4M21 3l-7 7M3 21l6-6M3 8h3l10 13h5M3 3h3l4 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="ctrl-btn" id="prevBtn" title="Anterior">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM19 5v14l-11-7z"/></svg>
            </div>
            <div class="ctrl-btn play" id="playBtn" title="Tocar / Pausar">
              <svg id="playIcon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div class="ctrl-btn" id="nextBtn" title="Próxima">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 5v14l11-7z"/></svg>
            </div>
            <div class="ctrl-btn toggle" id="repeatBtn" title="Repetir">
              <svg viewBox="0 0 24 24" fill="none"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>

          <div class="volume-row">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 5V4L8 9H4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
            <div class="volume" id="volumeBar"><div class="fill" id="volumeFill"></div></div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:18px;">
          <div class="card">
            <div class="card-head">
              <h2>Biblioteca</h2>
              <span class="dots">⋯</span>
            </div>
            <div class="stats-row" id="statsRow">
              <div class="stat">
                <div class="trend">▲</div>
                <div class="num" id="statCount">0</div>
                <div class="label">Na fila</div>
              </div>
              <div class="stat">
                <div class="trend">▲</div>
                <div class="num" id="statDuration">0:00</div>
                <div class="label">Duração total</div>
              </div>
              <div class="stat">
                <div class="trend down">▼</div>
                <div class="num" id="statPlayed">0</div>
                <div class="label">Reproduzidas</div>
              </div>
            </div>
          </div>

          <div class="card" style="flex:1;">
            <div class="card-head">
              <h2 id="queueTitle">Fila de reprodução</h2>
              <div class="head-side">
                <div class="head-tabs" id="headTabs"></div>
                <span id="headActions"></span>
              </div>
            </div>
            <div class="queue-list" id="queueList"><div class="empty-queue" id="emptyQueue">Carregando...</div></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Histórico de reprodução</h2>
          <span class="dots">⋯</span>
        </div>
        <div class="timeline" id="timelineList">
          <div class="empty-queue" style="padding:20px 10px;">
            <span>As músicas que você tocar vão aparecer aqui.</span>
          </div>
        </div>
        <div class="timeline-legend">
          <div class="legend-item"><span class="legend-dot" style="background:var(--lime)"></span>Faixa curta</div>
          <div class="legend-item"><span class="legend-dot" style="background:var(--orange)"></span>Faixa média</div>
          <div class="legend-item"><span class="legend-dot" style="background:#f4f5f1"></span>Faixa longa</div>
        </div>
      </div>
    </main>
  </div>`;

  const visualizer = document.getElementById('visualizer');
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('span');
    s.style.animationDelay = i * 0.06 + 's';
    visualizer.appendChild(s);
  }

  document.getElementById('avatar').textContent = (state.username[0] || '?').toUpperCase();
  document.getElementById('logoutBtn').addEventListener('click', () => logout());

  document.querySelectorAll('.side-icons .icon-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('focus', () => {
    if (state.view !== 'search') setView('search');
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = searchInput.value.trim();
      if (value) {
        state.query = value;
        state.view = 'search';
        search(value);
      }
    }
  });

  document.getElementById('addBtn').addEventListener('click', createPlaylistPrompt);

  bindNowPlaying();
  setView(state.view);
  loadHistory();
  renderRelatedRail();
}

/* ================= VIEWS ================= */

function setView(view) {
  state.view = view;
  state.queueMode = 'list';
  document.querySelectorAll('.side-icons .icon-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  const queueTitle = document.getElementById('queueTitle');
  const headActions = document.getElementById('headActions');

  if (view === 'home') {
    queueTitle.textContent = 'Início';
    headActions.innerHTML = '<button class="head-btn" onclick="loadHome()">↻ Atualizar</button>';
    renderHome();
  } else if (view === 'favorites') {
    queueTitle.textContent = 'Favoritos';
    headActions.innerHTML = '';
    loadFavorites();
  } else if (view === 'playlists') {
    loadPlaylists().then(renderPlaylists);
  } else if (view === 'history') {
    queueTitle.textContent = 'Histórico recente';
    headActions.innerHTML = '';
    loadHistory().then(renderQueue);
  } else {
    queueTitle.textContent = state.query ? `Resultados · ${esc(state.query)}` : 'Fila de reprodução';
    headActions.innerHTML = '';
    renderQueue();
  }
  updateStats();
}

function homeSongRow(s, badge, icon) {
  return `
    <div class="track-row" onclick="playHomeCard('${esc(s.video_id)}')" style="cursor:pointer">
      <div class="track-pos" style="flex:0 0 34px;text-align:center;">${badge}</div>
      ${s.thumbnail_url ? `<img class="track-thumb" src="${esc(s.thumbnail_url)}" alt="" loading="lazy">` : ''}
      <div class="track-meta">
        <div class="track-title">${esc(s.title)}</div>
        <div class="track-sub">${s.artists ? esc(s.artists) : 'Artista'}</div>
      </div>
      <button class="mini-btn" onclick="event.stopPropagation(); dbl(${''})" style="display:none">☰</button>
      <div class="track-sub" style="flex:0 0 auto;margin-left:8px;">${icon || ''}</div>
    </div>`;
}

function sectionBlock(title, emoji, rows, emptyMsg) {
  return `
    <div class="home-section">
      <h3 class="home-title">${title} ${emoji}</h3>
      ${rows.length ? `<div class="track-list">${rows}</div>` : `<p class="empty-queue">${emptyMsg}</p>`}
    </div>`;
}

async function loadHome() {
  const list = document.getElementById('queueList');
  if (!list) return;
  list.innerHTML = '<div class="empty-queue">Carregando... </div>';
  try {
    const data = await api('/home/');
    state.home = data;
    renderHome();
  } catch (err) {
    console.error('Home:', err);
    list.innerHTML = '<div class="empty-queue">Não deu pra carregar. Verifique o backend.</div>';
  }
}

function renderHome() {
  const list = document.getElementById('queueList');
  if (!list) return;
  const h = state.home || { em_alta: [], mais_ouvidas: [], playlists: [] };
  const trending = (h.em_alta || []).map((s, i) => homeSongRow(s, i + 1, '🔥')).join('');
  const frequent = (h.mais_ouvidas || []).map((s, i) => homeSongRow(s, i + 1, '🎧')).join('');
  const playlists = (h.playlists || []).map(
    (p, i) => `
      <div class="track-row" onclick="openPlaylist(${p.id})" style="cursor:pointer">
        <div class="track-pos" style="flex:0 0 34px;text-align:center;">${i + 1}</div>
        <div class="track-meta">
          <div class="track-title">${esc(p.name)}</div>
          <div class="track-sub">${(p.songs_count || 0)} músicas</div>
        </div>
        <button class="mini-btn" style="pointer-events:none;opacity:0">☰</button>
        <div class="track-sub" style="flex:0 0 auto;">📚</div>
      </div>`
  ).join('');
  list.innerHTML =
    sectionBlock('Em alta', '🔥', trending, 'Ouça algo agora!') +
    sectionBlock('Mais ouvidas', '🎧', frequent, 'Nada ainda.') +
    sectionBlock('Playlists populares', '📚', playlists, 'Crie uma playlist!');
}

function playHomeCard(videoId) {
  const all = [
    ...(state.home && state.home.em_alta || []),
    ...(state.home && state.home.mais_ouvidas || []),
  ];
  const s = all.find((x) => x.video_id === videoId);
  if (s) loadTrack(s);
}

async function search(query) {
  const queueTitle = document.getElementById('queueTitle');
  queueTitle.textContent = `Buscando "${esc(query)}"...`;
  try {
    const data = await api(`/search/?q=${encodeURIComponent(query)}`);
    state.results = data.results || [];
    state.favorites = await api('/favorites/');
    state.favStatus.clear();
    state.favorites.forEach((f) => state.favStatus.set(f.song.video_id, true));
    queueTitle.textContent = `Resultados · ${esc(query)}`;
    if (state.view !== 'search') setView('search');
    renderQueue();
  } catch (err) {
    const queueList = document.getElementById('queueList');
    queueList.innerHTML = `<div class="empty-queue" style="display:flex;">${esc(err.message)}</div>`;
  }
}

async function loadFavorites() {
  state.favorites = await api('/favorites/');
  state.favStatus.clear();
  state.favorites.forEach((f) => state.favStatus.set(f.song.video_id, true));
  updateNpFav();
  renderQueue();
}

async function loadPlaylists() {
  state.playlists = await api('/playlists/');
}

async function loadHistory() {
  state.history = await api('/history/');
  renderTimeline();
  renderQueue();
  updateStats();
}

function renderPlaylists() {
  const queueTitle = document.getElementById('queueTitle');
  const headActions = document.getElementById('headActions');

  if (state.playlistDetail) {
    queueTitle.textContent = `Playlist · ${state.playlistDetail.name}`;
    headActions.innerHTML = `
      <button class="head-btn" onclick="openPlaylistsList()">← Todas as playlists</button>
      <button class="head-btn" onclick="createPlaylistPrompt()">＋ Nova playlist</button>`;
    renderQueue();
  } else {
    queueTitle.textContent = 'Suas playlists';
    headActions.innerHTML = `
      <button class="head-btn" onclick="createPlaylistPrompt()">＋ Nova playlist</button>`;
    const list = document.getElementById('queueList');
    if (!state.playlists.length) {
      list.innerHTML = `<div class="empty-queue" style="display:flex;">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span>Nenhuma playlist ainda. Crie uma para juntar suas músicas.</span>
      </div>`;
      return;
    }
    list.innerHTML = state.playlists.map((p) => `
      <div class="track-row" onclick="openPlaylist(${p.id})">
        <span class="track-num">♪</span>
        <span class="track-icon">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h10" stroke="#0c0d0c" stroke-width="2" stroke-linecap="round"/></svg>
        </span>
        <span class="track-info">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${esc(p.description || 'Sem descrição')}</div>
        </span>
        <span class="track-dur">${p.song_count} ♪</span>
        <span class="row-acts" onclick="event.stopPropagation()">
          <button class="mini-btn" title="Excluir" onclick="deletePlaylist(${p.id})">🗑</button>
        </span>
      </div>`).join('');
  }
}

function openPlaylistsList() {
  state.playlistDetail = null;
  renderPlaylists();
}

async function openPlaylist(id) {
  state.playlistDetail = await api(`/playlists/${id}/`);
  renderPlaylists();
}

async function createPlaylistPrompt() {
  const name = prompt('Nome da nova playlist:');
  if (!name) return;
  const created = await api('/playlists/', {
    method: 'POST',
    body: JSON.stringify({ name, description: '' }),
  });
  state.playlists.unshift(created);
  openPlaylist(created.id);
}

async function deletePlaylist(id) {
  if (!confirm('Excluir esta playlist?')) return;
  await api(`/playlists/${id}/`, { method: 'DELETE' });
  if (state.playlistDetail && state.playlistDetail.id === id) state.playlistDetail = null;
  await loadPlaylists();
  renderPlaylists();
}

async function removeFromPlaylist(playlistId, rowId) {
  await api(`/playlists/${playlistId}/songs/${rowId}/`, { method: 'DELETE' });
  openPlaylist(playlistId);
}

/* ================= QUEUE ================= */

function activeQueue() {
  if (state.view === 'favorites') return state.favorites.map((f) => ({ song: f.song }));
  if (state.view === 'history') return state.history.map((h) => ({ song: h.song }));
  if (state.view === 'playlists') {
    if (state.playlistDetail) {
      return state.playlistDetail.songs.map((r) => ({ song: r.song, rowId: r.id }));
    }
    return [];
  }
  return state.results.map((s) => ({ song: s }));
}

function renderQueue() {
  const queueList = document.getElementById('queueList');

  if (state.view === 'playlists' && !state.playlistDetail) {
    renderQueueTabs();
    return renderPlaylists();
  }

  const queueMode = state.queueMode === 'queue' && state.queue.length > 0;
  renderQueueTabs(queueMode);

  if (queueMode) {
    if (!state.queue.length) {
      queueList.innerHTML = `
        <div class="empty-queue" style="display:flex;">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/></svg>
          <span>A fila de reprodução está vazia.</span>
        </div>`;
      updateStats();
      return;
    }
    queueList.innerHTML = state.queue.map((song, i) => queueRow(song, i)).join('');
    updateStats();
    return;
  }

  const items = activeQueue();

  if (!items.length) {
    const emptyText =
      state.view === 'favorites' ? 'Nenhum favorito ainda. Toque no ♡ de uma música.'
      : state.view === 'history' ? 'Nada tocado ainda.'
      : state.view === 'search' ? 'Faça uma busca para montar sua fila.'
      : 'Nada por aqui ainda.';
    queueList.innerHTML = `
      <div class="empty-queue" style="display:flex;">
        <svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/></svg>
        <span>${esc(emptyText)}</span>
      </div>`;
    return;
  }

  const currentId = state.current && state.current.video_id;
  queueList.innerHTML = items.map((row, i) => {
    const song = row.song;
    const favorite = state.favStatus.get(song.video_id);
    const inPlaylistDetail = state.view === 'playlists' && state.playlistDetail;
    return `
    <div class="track-row${song.video_id === currentId ? ' active' : ''}" onclick="playIndex(${i})">
      <span class="track-num">${song.video_id === currentId ? '♪' : i + 1}</span>
      <span class="track-icon">
        ${song.thumbnail_url
          ? `<img src="${esc(song.thumbnail_url)}" alt="" loading="lazy" />`
          : `<svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#0c0d0c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="#0c0d0c" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="#0c0d0c" stroke-width="2"/></svg>`}
      </span>
      <span class="track-info">
        <div class="name">${esc(song.title)}</div>
        <div class="sub">${esc(song.artists)}${song.album ? ' · ' + esc(song.album) : ''}</div>
      </span>
      <span class="track-dur">${fmtTime(song.duration)}</span>
      ${inPlaylistDetail
        ? `<span class="row-acts" onclick="event.stopPropagation()">
            <button class="mini-btn" title="Tocar a seguir" onclick="playNext('${esc(song.video_id)}')">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12z"/><path d="M16 6v12h2V6h-2z"/></svg>
            </button>
            <button class="mini-btn remove" title="Remover da playlist" onclick="removeFromPlaylist(${state.playlistDetail.id}, ${row.rowId})">✕</button>
          </span>`
        : `<span class="row-acts" onclick="event.stopPropagation()">
            <button class="mini-btn" title="Tocar a seguir" onclick="playNext('${esc(song.video_id)}')">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12z"/><path d="M16 6v12h2V6h-2z"/></svg>
            </button>
            <button class="mini-btn" title="Adicionar à playlist" onclick="openAddToPlaylist('${esc(song.video_id)}')">＋</button>
            ${typeof favorite === 'undefined' ? '' : `
            <button class="mini-btn fav${favorite ? ' active' : ''}" title="Favoritar" onclick="toggleFavorite('${esc(song.video_id)}')">${favorite ? '♥' : '♡'}</button>`}
          </span>`}
    </div>`;
  }).join('');

  const currentBtn = document.getElementById('npFav');
  if (currentBtn && state.current) updateNpFav();
  updateStats();
}

function queueRow(song, i) {
  const activeRow = i === state.currentIndex && state.current;
  return `
    <div class="track-row${activeRow ? ' active' : ''}" onclick="playFromQueue(${i})">
      <span class="track-num">${activeRow ? '♪' : i + 1}</span>
      <span class="track-icon">
        ${song.thumbnail_url
          ? `<img src="${esc(song.thumbnail_url)}" alt="" loading="lazy" />`
          : `<svg viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#0c0d0c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="#0c0d0c" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="#0c0d0c" stroke-width="2"/></svg>`}
      </span>
      <span class="track-info">
        <div class="name">${esc(song.title)}</div>
        <div class="sub">${esc(song.artists)}${song.album ? ' · ' + esc(song.album) : ''}</div>
      </span>
      <span class="track-dur">${fmtTime(song.duration)}</span>
      <span class="row-acts" onclick="event.stopPropagation()">
        <button class="mini-btn remove" title="Remover da fila" onclick="removeFromQueue(${i})">✕</button>
      </span>
    </div>`;
}

function renderQueueTabs(queueMode) {
  const headTabs = document.getElementById('headTabs');
  if (!headTabs) return;
  const relevant = state.view !== 'playlists' || !!state.playlistDetail;
  const show = relevant && (state.queue.length > 0 || state.queueMode === 'queue');
  if (!show) {
    headTabs.innerHTML = '';
    return;
  }
  headTabs.innerHTML =
    `<button class="qtab${queueMode ? '' : ' active'}" onclick="state.queueMode='list'; renderQueue();">Lista</button>` +
    `<button class="qtab${queueMode ? ' active' : ''}" onclick="state.queueMode='queue'; renderQueue();">Fila</button>`;
}

function removeFromQueue(i) {
  if (i < 0 || i >= state.queue.length) return;
  const removedCurrent = i === state.currentIndex;
  state.queue.splice(i, 1);
  if (removedCurrent) {
    if (state.queue.length) {
      state.currentIndex = Math.min(i, state.queue.length - 1);
      playFromQueue(state.currentIndex);
    } else {
      state.currentIndex = -1;
      state.current = null;
      PLAYER.pause();
      PLAYER.removeAttribute('src');
      bindNowPlaying();
      loadRelated(null);
    }
  } else if (i < state.currentIndex) {
    state.currentIndex--;
  }
  renderQueue();
}

function playIndex(index) {
  const items = activeQueue();
  if (!items || !items[index]) return;
  state.queue = items.map((row) => row.song);
  playFromQueue(index);
  renderQueue();
}

function playFromQueue(index) {
  if (!state.queue.length) return;
  if (index < 0) index = 0;
  if (index >= state.queue.length) index = state.queue.length - 1;
  state.currentIndex = index;
  loadTrack(state.queue[index]);
}

/* ================= TOCAR A SEGUIR ================= */

function playNext(videoId) {
  const song = findSong(videoId);
  if (song) playNextSong(song);
}

function playNextFromRelated(index) {
  if (state.related && state.related[index]) playNextSong(state.related[index]);
}

function playNextSong(song) {
  if (!song) return;
  if (!state.queue.length) {
    const items = activeQueue();
    state.queue = items.length ? items.map((row) => row.song) : [];
  }
  const insertAt = state.currentIndex + 1;
  state.queue.splice(insertAt, 0, song);
  if (state.current && state.currentIndex >= 0) {
    state.queueMode = 'queue';
    renderQueue();
    toast('"' + song.title + '" tocará a seguir');
  } else {
    playFromQueue(insertAt < 0 ? 0 : insertAt);
  }
}

let toastTimer = null;
function toast(message) {
  let el = document.getElementById('rv-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rv-toast';
    el.className = 'rv-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ================= FAVORITES ================= */

async function toggleFavorite(videoId) {
  const song = findSong(videoId);
  if (!song) return;
  const favorite = state.favStatus.get(videoId);
  try {
    if (favorite) {
      const entry = state.favorites.find((f) => f.song.video_id === videoId);
      if (entry) await api(`/favorites/${entry.id}/`, { method: 'DELETE' });
      state.favStatus.set(videoId, false);
      const idx = state.favorites.findIndex((f) => f.song.video_id === videoId);
      if (idx >= 0) state.favorites.splice(idx, 1);
    } else {
      const created = await api('/favorites/create/', {
        method: 'POST',
        body: JSON.stringify(songFields(song)),
      });
      state.favorites.unshift(created);
      state.favStatus.set(videoId, true);
    }
  } catch (err) {
    console.error(err);
  }
  updateNpFav();
  renderQueue();
}

function updateNpFav() {
  const btn = document.getElementById('npFav');
  if (!btn || !state.current) return;
  const fav = state.favStatus.get(state.current.video_id);
  btn.textContent = fav ? '♥' : '♡';
  btn.classList.toggle('active', !!fav);
}

/* ================= ADD TO PLAYLIST ================= */

async function openAddToPlaylist(videoId) {
  const song = findSong(videoId);
  if (!song) return;
  state.playlists = await api('/playlists/');
  openModal(song);
}

function openModal(song) {
  const list = state.playlists.length
    ? state.playlists.map((p) => `
        <div class="pl-item" onclick="addToPlaylist(${p.id}, '${esc(song.video_id)}')">
          <span>♪</span><span style="flex:1">${esc(p.name)}</span><span style="color:var(--text-faint);font-size:11px">${p.song_count}</span>
        </div>`).join('')
    : '<div class="empty-queue" style="color:var(--text-faint)">Nenhuma playlist ainda.</div>';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Adicionar "${esc(song.title)}" à playlist</h3>
      <div class="list">${list}</div>
      <div class="footer">
        <button class="btn" id="modalNewPl">＋ Nova playlist</button>
        <button class="btn ghost" id="modalClose">Fechar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('modalClose').addEventListener('click', () => overlay.remove());
  document.getElementById('modalNewPl').addEventListener('click', async () => {
    const name = prompt('Nome da nova playlist:');
    if (!name) return;
    const created = await api('/playlists/', { method: 'POST', body: JSON.stringify({ name, description: '' }) });
    state.playlists.unshift(created);
    await addToPlaylist(created.id, song.video_id);
    overlay.remove();
  });
}

async function addToPlaylist(playlistId, videoId) {
  const song = findSong(videoId);
  if (!song) return;
  await api(`/playlists/${playlistId}/songs/`, {
    method: 'POST',
    body: JSON.stringify(songFields(song)),
  });
  closeModal();
  loadPlaylists();
}

function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach((el) => el.remove());
}

/* ================= LETRA ================= */

function openLyrics() {
  const song = state.current;
  if (!song) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal lyrics-modal">
      <div class="lyrics-head">
        <div>
          <h3>Letra</h3>
          <div class="lyrics-song">${esc(song.title)}${song.artists ? ' · ' + esc(song.artists) : ''}</div>
        </div>
        <button class="btn ghost" id="lyricsClose">Fechar</button>
      </div>
      <div class="lyrics-body" id="lyricsBody"><span class="lyrics-loading">Carregando letra...</span></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('lyricsClose').addEventListener('click', () => overlay.remove());
  api(`/songs/${encodeURIComponent(song.video_id)}/lyrics/`)
    .then((data) => {
      const body = document.getElementById('lyricsBody');
      if (!body) return;
      if (data && data.lyrics) {
        body.innerHTML = data.lyrics
          .split('\n')
          .map((line) => `<p>${esc(line) || '&nbsp;'}</p>`)
          .join('');
      } else {
        body.innerHTML = '<p class="lyrics-empty">Letra não encontrada para esta música.</p>';
      }
    })
    .catch(() => {
      const body = document.getElementById('lyricsBody');
      if (body) body.innerHTML = '<p class="lyrics-empty">Não foi possível carregar a letra.</p>';
    });
}

/* ================= HISTORY ================= */

async function recordHistory(song) {
  try {
    await api('/history/create/', {
      method: 'POST',
      body: JSON.stringify(songFields(song)),
    });
    loadHistory();
  } catch (_) {}
}

function renderTimeline() {
  const timelineList = document.getElementById('timelineList');
  if (!timelineList) return;
  if (!state.history.length) {
    timelineList.innerHTML = `
      <div class="empty-queue" style="padding:20px 10px;">
        <span>As músicas que você tocar vão aparecer aqui.</span>
      </div>`;
    return;
  }
  const rows = state.history.slice(0, 6);
  const maxDur = Math.max.apply(null, rows.map((h) => h.song.duration || 30).concat([30]));
  timelineList.innerHTML = rows.map((h) => {
    const d = h.song.duration || 30;
    const colorIdx = d < 150 ? 0 : d < 280 ? 1 : 2;
    const widthPct = Math.max(22, Math.min(100, (d / maxDur) * 100));
    const played = new Date(h.played_at);
    const hh = played.getHours().toString().padStart(2, '0');
    const mm = played.getMinutes().toString().padStart(2, '0');
    return `
      <div class="timeline-row">
        <span class="timeline-time">${hh}:${mm}</span>
        <div class="timeline-track">
          <div class="timeline-bar" style="width:${widthPct}%; background:${trackColors[colorIdx]}">
            ${esc(h.song.title)}
          </div>
        </div>
      </div>`;
  }).join('');
}

function updateStats() {
  const normQueued = (g) => {
    const statCount = document.getElementById('statCount');
    if (statCount) statCount.textContent = String(g);
  };
  const items = activeQueue();
  normQueued(items.length);
  const total = items.reduce((a, row) => a + (row.song.duration || 0), 0);
  const statDuration = document.getElementById('statDuration');
  if (statDuration) statDuration.textContent = fmtTime(total);
  const statPlayed = document.getElementById('statPlayed');
  if (statPlayed) statPlayed.textContent = String(state.history.length);
}

/* ================= PLAYER ================= */

function loadTrack(song) {
  state.current = song;
  PLAYER.src = `${API}/songs/${encodeURIComponent(song.video_id)}/stream/?token=${encodeURIComponent(state.token)}`;
  PLAYER.play().catch((err) => console.error('Reprodução falhou:', err));

  document.getElementById('nowTitle').textContent = song.title;
  document.getElementById('nowArtist').textContent = song.artists || 'Artista';
  const cover = document.getElementById('cover');
  if (song.thumbnail_url) {
    cover.style.backgroundImage = `url('${esc(song.thumbnail_url)}')`;
  } else {
    cover.style.backgroundImage = '';
  }
  updateNpFav();
  recordHistory(song);
  renderQueue();
  loadRelated(song);
}

async function loadRelated(song) {
  if (!song || !song.video_id) return;
  const rail = document.getElementById('relatedRail');
  if (!rail) return;
  try {
    const data = await api(`/songs/${encodeURIComponent(song.video_id)}/related/`);
    if (state.current && state.current.video_id !== song.video_id) return;
    state.related = data.results || [];
    state.relatedFor = song.video_id;
  } catch (err) {
    state.related = [];
    state.relatedFor = song.video_id;
  }
  renderRelatedRail();
}

function renderRelatedRail() {
  const rail = document.getElementById('relatedRail');
  if (!rail) return;
  const loadedFor = state.relatedFor;
  const base = loadedFor ? (state.current && state.current.video_id) : null;
  let match = null;
  if (base) {
    match = state.related.find((s) => s.video_id === base);
  }
  const context = match ? `${match.title} · ${match.artists || ''}` : 'Tocar uma música para ver sugestões';
  if (!state.related.length) {
    rail.innerHTML = `
      <div class="rail-head">
        <h3><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/></svg>Músicas similares</h3>
        <p title="${esc(context)}">${esc(context)}</p>
      </div>
      <div class="rail-empty">
        <svg viewBox="0 0 24 24" fill="none" width="34" height="34"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/></svg>
        <span>Nenhuma sugestão ainda.<br>Cada música tocada gera sugestões aqui.</span>
      </div>`;
    return;
  }
  rail.innerHTML = `
    <div class="rail-head">
      <h3><svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2"/></svg>Músicas similares</h3>
      <p title="${esc(context)}">${esc(context)}</p>
    </div>
    <div class="related-list">
      ${state.related.map((s, i) => `
        <div class="rail-row${state.current && state.current.video_id === s.video_id ? ' active' : ''}" onclick="playSimilar(${i})">
          ${s.thumbnail_url
            ? `<img class="rc-thumb" src="${esc(s.thumbnail_url)}" alt="" loading="lazy" />`
            : `<span class="rc-thumb"></span>`}
          <span class="rc-info">
            <span class="rc-name">${esc(s.title)}</span>
            <span class="rc-sub">${esc(s.artists || '')}</span>
          </span>
          <span class="rc-dur">${fmtTime(s.duration)}</span>
          <button class="mini-btn rc-next" title="Tocar a seguir" onclick="event.stopPropagation(); playNextFromRelated(${i})">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12z"/><path d="M16 6v12h2V6h-2z"/></svg>
          </button>
        </div>`).join('')}
    </div>`;
}

function playSimilar(index) {
  if (!state.related || !state.related[index]) return;
  state.queue = state.related;
  playFromQueue(index);
  renderQueue();
  renderRelatedRail();
}

function togglePlay() {
  const items = activeQueue();
  if (!items.length) return;
  if (PLAYER.currentSrc && state.current) {
    if (PLAYER.paused || PLAYER.ended) {
      state.userPaused = false;
      PLAYER.play().catch((err) => console.error('Reprodução falhou:', err));
    } else {
      state.userPaused = true;
      PLAYER.pause();
    }
    return;
  }
  playIndex(0);
}

function nextTrack() {
  if (!state.queue.length) return;
  let next;
  if (state.shuffle) {
    next = Math.floor(Math.random() * state.queue.length);
  } else {
    next = (state.currentIndex + 1) % state.queue.length;
  }
  playFromQueue(next);
}

function prevTrack() {
  if (!state.queue.length) return;
  if (PLAYER.currentTime > 3) {
    PLAYER.currentTime = 0;
    return;
  }
  let prev;
  if (state.shuffle) {
    prev = Math.floor(Math.random() * state.queue.length);
  } else {
    prev = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  }
  playFromQueue(prev);
}

function bindNowPlaying() {
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const progressKnob = document.getElementById('progressKnob');
  const volumeBar = document.getElementById('volumeBar');
  const volumeFill = document.getElementById('volumeFill');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const repeatBtn = document.getElementById('repeatBtn');

  PLAYER.volume = 0.7;
  volumeFill.style.width = '70%';

  playBtn.addEventListener('click', togglePlay);
  document.getElementById('nextBtn').addEventListener('click', nextTrack);
  document.getElementById('prevBtn').addEventListener('click', prevTrack);

  shuffleBtn.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    shuffleBtn.classList.toggle('on', state.shuffle);
  });
  repeatBtn.addEventListener('click', () => {
    state.repeat = !state.repeat;
    repeatBtn.classList.toggle('on', state.repeat);
  });

  document.getElementById('npFav').addEventListener('click', () => {
    if (state.current) toggleFavorite(state.current.video_id);
  });
  document.getElementById('npAdd').addEventListener('click', () => {
    if (state.current) openAddToPlaylist(state.current.video_id);
  });
  document.getElementById('lyricsBtn').addEventListener('click', openLyrics);

  function seekFromX(clientX) {
    if (!PLAYER.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = pct * PLAYER.duration;
    PLAYER.currentTime = time;
    seekFill.style.width = pct * 100 + '%';
    seekKnob.style.left = pct * 100 + '%';
    timeCurrent.textContent = fmtTime(time);
  }

  progressBar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!PLAYER.duration) return;
    progressBar.setPointerCapture(e.pointerId);
    seekFromX(e.clientX);
    progressBar.addEventListener(
      'pointermove',
      (ev) => {
        if (ev.buttons === 0 && ev.pointerType === 'mouse') return;
        seekFromX(ev.clientX);
      },
      { passive: false }
    );
  });
  progressBar.addEventListener('click', (e) => {
    if (!PLAYER.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    PLAYER.currentTime = pct * PLAYER.duration;
  });

  function setVolumeFromX(clientX) {
    const rect = volumeBar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    PLAYER.volume = pct;
    volumeFill.style.width = pct * 100 + '%';
  }

  volumeBar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    volumeBar.setPointerCapture(e.pointerId);
    setVolumeFromX(e.clientX);
    volumeBar.addEventListener(
      'pointermove',
      (ev) => {
        if (ev.buttons === 0 && ev.pointerType === 'mouse') return;
        setVolumeFromX(ev.clientX);
      },
      { passive: false }
    );
  });
  volumeBar.addEventListener('click', (e) => {
    const rect = volumeBar.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    PLAYER.volume = pct;
    volumeFill.style.width = pct * 100 + '%';
  });

  PLAYER.addEventListener('play', () => {
    state.userPaused = false;
    playIcon.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
    document.querySelectorAll('#visualizer span').forEach((s) => s.classList.add('playing'));
  });
  PLAYER.addEventListener('playing', () => {
    state.userPaused = false;
    document.querySelectorAll('#visualizer span').forEach((s) => s.classList.add('playing'));
  });
  PLAYER.addEventListener('waiting', () => {
    if (state.userPaused) return;
    document.querySelectorAll('#visualizer span').forEach((s) => s.classList.add('buffering'));
  });
  PLAYER.addEventListener('stalled', () => {
    if (state.userPaused || !state.current) return;
    if (PLAYER.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      document.querySelectorAll('#visualizer span').forEach((s) => s.classList.remove('buffering'));
      loadTrack(state.current);
    }
  });
  PLAYER.addEventListener('pause', () => {
    playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    document.querySelectorAll('#visualizer span').forEach((s) => s.classList.remove('playing'));
  });
  PLAYER.addEventListener('playing', () => {
    document.querySelectorAll('#visualizer span').forEach((s) => s.classList.add('playing'));
  });
  PLAYER.addEventListener('stalled', () => {
    if (!state.current || state.userPaused) return;
    if (!PLAYER.paused && PLAYER.currentTime > 0 && isFinite(PLAYER.currentTime)) {
      PLAYER.currentTime = PLAYER.currentTime;
    }
  });
  PLAYER.addEventListener('waiting', () => {
    if (!state.current || state.userPaused) return;
    const retry = () => {
      if (state.current && !state.userPaused && PLAYER.paused && !PLAYER.ended && PLAYER.currentSrc) {
        PLAYER.play().catch((err) => console.error('Retomada automática falhou:', err));
      }
    };
    if (PLAYER.currentTime === 0) setTimeout(retry, 1500);
    else setTimeout(retry, 400);
  });
  PLAYER.addEventListener('timeupdate', () => {
    if (!PLAYER.duration) return;
    const pct = (PLAYER.currentTime / PLAYER.duration) * 100;
    progressFill.style.width = pct + '%';
    progressKnob.style.left = pct + '%';
    document.getElementById('curTime').textContent = fmtTime(PLAYER.currentTime);
    document.getElementById('durTime').textContent = fmtTime(PLAYER.duration);
  });
  PLAYER.addEventListener('loadedmetadata', () => {
    document.getElementById('durTime').textContent = fmtTime(PLAYER.duration);
  });
  PLAYER.addEventListener('ended', () => {
    if (state.repeat) {
      PLAYER.currentTime = 0;
      PLAYER.play();
    } else {
      nextTrack();
    }
  });
}

/* ================= INIT ================= */

function initApp() {
  renderApp();
}

if (state.token) {
  state.authed = true;
  initApp();
} else {
  renderAuth();
}