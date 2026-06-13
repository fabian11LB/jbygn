import { fbSave, attachSync, fbUploadImage, fbDeleteImage } from './firebase.js';

// --- CACHE & QUOTA CLEANUP ---
try {
  let keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    let k = localStorage.key(i);
    // Limpiar claves antiguas de versiones anteriores para liberar espacio y evitar QuotaExceededError
    if (k && k.startsWith('jg_') && !k.startsWith('jg_v6_')) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
} catch(e) {}

// --- HELPERS SECURE LOCAL STORAGE ---
const S = {
  g: (k) => { try { return JSON.parse(localStorage.getItem('jg_v6_'+k)); } catch { return null; } },
  s: (k, v) => {
    try {
      localStorage.setItem('jg_v6_'+k, JSON.stringify(v));
    } catch(e) {
      console.warn("Memoria Local Llena. No se pudo guardar en caché local:", e);
    }
    fbSave(k, v);
  }
};

// --- ESTADOS INICIALES GLOBALES ---
let State = {
  me: null,
  citas: S.g('citas') || [],
  cuaderno: S.g('cuaderno') || [],
  posts: S.g('posts') || [],
  fechas: S.g('fechas') || [],
  dreams: S.g('dreams') || [],
  songs: S.g('songs') || [],
  carta: S.g('carta') || null,
  places: S.g('places') || [],
  scores: S.g('scores') || { J: 0, G: 0 },
  moods: S.g('moods') || [],
  wp: S.g('wp') || { url: '', time: 0, playing: false, chat: [], ctrl: '', type: 'none', queue: [] },
  notasList: S.g('notasList') || [],
  plans: S.g('plans') || [],
  presence: S.g('presence') || { J: 0, G: 0 },
  games: S.g('games') || { 
    ttt: { b: Array(9).fill(null), t: 'J', o: false },
    c4:  { b: Array(6).fill().map(()=>Array(7).fill(null)), t: 'J', o: false },
    mem: { s: [], f: [], m: [], tr: 0 }
  }
};

// LIMPIEZA AUTO MIGRACIÓN (SUEÑOS STRINGS A OBJETOS)
State.fechas = State.fechas.filter(x => x && x.name);
State.dreams = State.dreams.map(x => { 
  if(typeof x === 'string') return { title: x, done: false }; 
  if(x && x.title) return x; 
  return null; 
}).filter(x => x !== null);
State.songs = State.songs.filter(x => x && x.t);
State.places = State.places.filter(x => x && x.n);
State.plans = State.plans.filter(x => x && typeof x === 'string');
State.notasList = State.notasList.filter(x => x && x.t && x.w);
State.posts = State.posts.filter(x => x && x.txt !== undefined);
State.cuaderno = State.cuaderno.filter(x => x && x.title);

if (State.citas.length === 0) {
  const PRE_CITAS = [
    "Picnic en el parque", "Noche de películas", "Cocinar la cena completa", "Viaje improvisado", "Hacerse retratos", "Comer helado", "Caminar al atardecer", "Leer un libro", "Cita elegante", "Comprar pijama", "Maratón de serie", "Cantar karaoke", "Fuerte de almohadas",
    "Ir al cine (película random)", "Desayuno súper especial", "Hacer un postre locochón", "Masajes mutuos", "Plantar una flor", "Hacer un scrapbook", "Escribirse cartas", "Ir a la playa", "Ver las estrellas", "Pintar cerámica", "Hacer galletas", "Tarde de mesa", "Comer pizza a medianoche", "Besarse en lo alto",
    "Ver videos de risa", "Ir al zoológico", "Tomar el té juntos", "Librería o biblioteca", "Hacer ejercicio en pareja", "Ir a evento musical", "Probar comida extraña", "Ir de compras noche", "Lugar que asusta", "Pintar mini cuadro", "Tomarse +100 fotos", "Lugar donde se conocieron", "Volver a la 1ª cita", "Mirador nocturno",
    "Jugar escondidas", "Cita 80s/90s", "Alimentar patitos", "Competencia de TikToks", "Verdad o reto", "Caminar contando pasos", "Dedicarse canciones", "Cata a ciegas de sabores", "Escribir metas", "Armar rompecabezas", "Boliche o mini golf", "Noche de spa casero", "Comprar flores de sorpresa", "Escape room", "Arepas desde cero",
    "Volar una cometa", "Jardín botánico", "Arcade retro o feria", "Votar mejor sándwich", "Día del 'Sí a todo'", "Bailar sin música", "Inventar una historia", "Paseo largo en bus", "Mímica por rato", "Guerra almohadas", "Inventar un cóctel", "Cápsula del tiempo", "Reto en el súper 5 min", "Besarse lento y profundo 💕"
  ];
  State.citas = PRE_CITAS.map((n, i) => ({ id: i, name: n, done: false, date: null, desc: '', photos: [] }));
  S.s('citas', State.citas);
}

// Migración: si las citas tienen campo 'photo', mover a 'photos'
(function migrateCitaPhotos() {
  let migrated = false;
  State.citas.forEach((c) => {
    if (c.photos === undefined) { c.photos = []; migrated = true; }
    if (c.photo) {
      if (typeof c.photo === 'string') {
          if (!c.photos.includes(c.photo)) c.photos.push(c.photo);
      }
      delete c.photo;
      migrated = true;
    }
  });
  if (migrated) {
    saveLocal('citas', State.citas);
  }
})();

// GLOBALS
let currentCitaId = null;
let currentBookId = null;
let pendPhotos = [];   // Album de fotos pendientes de la cita actual
let pendPhotoIndex = 0; // Foto actual visible en el álbum
let pendPostPhoto = null;
let pendBkFile = null;
let pendBkName = '';
let activeTab = 'all'; 
let activeDreamTab = 'todo';

// === LOGIN Y ARRANQUE ===
window.doLogin = function(who) {
  State.me = who;
  document.getElementById('login-screen').style.opacity = '0';
  document.getElementById('composerNameLabel').textContent = who === 'J' ? 'Jhosep' : 'Gabriela';
  document.getElementById('composerAvatar').textContent = who === 'J' ? '🧔' : '👩';
  
  setTimeout(() => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    startHeartbeat();
    refreshUI();
    updatePresenceUI();
  }, 400);
}

// === FIREBASE SYNC ===
let isInternalSync = false;
attachSync((data) => {
  const keys = Object.keys(data);
  let changed = false;
  keys.forEach(k => {
    const remote = JSON.parse(data[k]);
    const local = localStorage.getItem('jg_v6_'+k);
    if(JSON.stringify(remote) !== local) {
      try {
        localStorage.setItem('jg_v6_'+k, data[k]);
      } catch(e) {
        console.warn("Memoria Local Llena en sync:", e);
      }
      State[k] = remote;
      changed = true;
      if (k === 'wp') syncWpPlayerRemotely();
      if (k === 'presence') updatePresenceUI();
    }
  });
  if(changed && State.me) { refreshUI(); syncGamesRenderer(); }
});

function updatePresenceUI() {
  const other = State.me === 'J' ? 'G' : 'J';
  const otherName = other === 'J' ? 'Jhosep' : 'Gabriela';
  const lastSeen = State.presence[other] || 0;
  const now = Date.now();
  const el = document.getElementById('presence-other');
  if(!el) return;
  
  if (now - lastSeen < 45000) { // En línea si se vio hace menos de 45 seg
    el.innerHTML = `${other==='J'?'🧔':'👩'} ${otherName}: <span style="color:var(--ios-green)">En línea</span>`;
    document.getElementById('presence-sync-ic').style.animation = 'pulseSync 2s infinite';
  } else {
    el.innerHTML = `${other==='J'?'🧔':'👩'} ${otherName}: <span style="color:var(--muted)">Desconectado</span>`;
    document.getElementById('presence-sync-ic').style.animation = 'none';
  }
}

window.showSyncError = function(msg) {
  const el = document.getElementById('presence-dashboard-err');
  if(!el) {
    const board = document.getElementById('presence-board');
    if(board) {
      const errDiv = document.createElement('div');
      errDiv.id = 'presence-dashboard-err';
      errDiv.style = 'color: #ff3b30; font-size: 0.7rem; font-weight: 700; margin-top: 5px; width: 100%; text-align: center;';
      board.appendChild(errDiv);
      errDiv.innerHTML = '⚠️ ERROR: ' + msg;
    }
  } else {
    el.innerHTML = '⚠️ ERROR: ' + msg;
  }
}

function startHeartbeat() {
  setInterval(() => {
    if (State.me) {
      State.presence[State.me] = Date.now();
      fbSave('presence', State.presence);
    }
  }, 20000); // Latido cada 20 segundos
}

function saveLocal(key, val) {
  isInternalSync = true;
  S.s(key, val);
  setTimeout(()=> isInternalSync = false, 500);
}

// --- AUTO MIGRATE BASE64 TO STORAGE PARA LIBERAR ESPACIO ---
setTimeout(async () => {
  let changed = false;
  
  // 1. Citas
  for (let i = 0; i < State.citas.length; i++) {
    let c = State.citas[i];
    if (c.photos) {
      for (let j = 0; j < c.photos.length; j++) {
        if (typeof c.photos[j] === 'string' && c.photos[j].startsWith('data:image/')) {
          try {
            const path = `citas/migr_${c.id}_${Date.now()}_${j}.jpg`;
            const url = await fbUploadImage(path, c.photos[j]);
            State.citas[i].photos[j] = url;
            changed = true;
          } catch(e) { console.error('Error migrando foto cita', e); }
        }
      }
    }
  }

  // 2. Feed
  for (let i = 0; i < State.posts.length; i++) {
    let p = State.posts[i];
    if (typeof p.photo === 'string' && p.photo.startsWith('data:image/')) {
      try {
        const path = `feed/migr_${Date.now()}_${i}.jpg`;
        const url = await fbUploadImage(path, p.photo);
        State.posts[i].photo = url;
        changed = true;
      } catch(e) {}
    }
  }

  // 3. Cuaderno
  for (let i = 0; i < State.cuaderno.length; i++) {
    let b = State.cuaderno[i];
    if (typeof b.file === 'string' && b.file.startsWith('data:image/')) {
      try {
        const path = `cuaderno/migr_${Date.now()}_${i}.jpg`;
        const url = await fbUploadImage(path, b.file);
        State.cuaderno[i].file = url;
        changed = true;
      } catch(e) {}
    }
  }

  if (changed) {
    saveLocal('citas', State.citas);
    saveLocal('posts', State.posts);
    saveLocal('cuaderno', State.cuaderno);
    setTimeout(() => toast('¡Base de datos optimizada! Memoria liberada. 🚀'), 1000);
    if (typeof refreshUI === 'function') refreshUI();
  }
}, 5000); // 5 segundos después de cargar la aplicación

function refreshUI() {
  renderScores(); renderCitas(); renderCuaderno(); renderFeed(); renderMoods(); renderWpChat(); renderWpLink();
  renderFechas(); renderDreams(); renderSongs(); renderPlaces(); syncGamesRenderer(); renderCalMonth();
  if(document.getElementById('wCanvas').offsetParent !== null) drawW(wAngle);
}
function syncGamesRenderer() {
  if(document.getElementById('gp-tictactoe').style.display==='block') { document.getElementById('tttTurnLabel').textContent=(State.games.ttt.t==='J'?'Jhosep':'Gabriela'); drawTTT(); }
  if(document.getElementById('gp-connect4').style.display==='block') { document.getElementById('c4TurnLabel').textContent=(State.games.c4.t==='J'?'Jhosep':'Gabriela'); drawC4(); }
  if(document.getElementById('gp-memory').style.display==='block') { document.getElementById('memTurnsLabel').textContent=State.games.mem.tr; renderMem(); }
}

window.toast = function(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3200); }
window.uiError = function(msg) { 
  console.warn("UI Error silenced:", msg);
}
window.closeModal = function(id) { document.getElementById(id).classList.remove('open'); }
window.confirmReset = function() { document.getElementById('confirmModal').classList.add('open'); }
window.doReset = function() { State.scores = {J:0, G:0}; saveLocal('scores', State.scores); renderScores(); closeModal('confirmModal'); toast('Marcador en ceros.');}

window.go = function(id, btn) {
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.sec').forEach(e => e.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('sec-'+id).classList.add('active');
  document.getElementById('main').scrollTop = 0;
  if (window.innerWidth <= 768) toggleSidebar(false);
  
  if(id === 'mood') renderCalMonth();
  if(id === 'ruleta') setTimeout(()=> drawW(wAngle), 100);
  if(id === 'juegos') setTimeout(()=> { syncGamesRenderer(); }, 100);
}
window.toggleSidebar = function(force) {
  const sb = document.getElementById('sidebar'); const ob = document.getElementById('overlay-bg');
  const open = force !== undefined ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', open); ob.classList.toggle('show', open);
}

const START_DATE = new Date('2025-06-20T00:00:00');
function tick() {
  const d = new Date() - START_DATE;
  const days = Math.floor(d / 86400000);
  document.getElementById('sbD').textContent = days;
  document.getElementById('sbH').textContent = String(Math.floor((d%86400000)/3600000)).padStart(2,'0');
  document.getElementById('sbM').textContent = String(Math.floor((d%3600000)/60000)).padStart(2,'0');
  document.getElementById('sbS').textContent = String(Math.floor((d%60000)/1000)).padStart(2,'0');
  if(document.getElementById('feedDays')) document.getElementById('feedDays').textContent = days;
}
setInterval(tick, 1000); tick();

function renderScores() {
  document.getElementById('sbScJn').textContent = State.scores.J; document.getElementById('sbScGn').textContent = State.scores.G;
  document.getElementById('sbScJ').classList.toggle('lead', State.scores.J > State.scores.G); document.getElementById('sbScG').classList.toggle('lead', State.scores.G > State.scores.J);
}
window.giveScore = function(who) { State.scores[who]++; saveLocal('scores', State.scores); renderScores(); toast(`¡Punto para ${who==='J'?'Jhosep':'Gabriela'}! 🏅`); }

// === CITAS / ALBUM ===

window.renderCitas = function() {
  const grid = document.getElementById('cGrid') || document.getElementById('albumGrid');
  if (!grid) return;
  
  let doneCount = State.citas.filter(c => c.done).length;
  if(document.getElementById('citasBadge')) document.getElementById('citasBadge').textContent = doneCount;
  if(document.getElementById('albumProgText')) document.getElementById('albumProgText').textContent = doneCount;
  if(document.getElementById('albumBar')) document.getElementById('albumBar').style.width = (doneCount/Math.max(100, State.citas.length)*100) + '%';
  if(document.getElementById('citasHechasL')) document.getElementById('citasHechasL').textContent = doneCount;
  if(document.getElementById('feedCitas')) document.getElementById('feedCitas').textContent = doneCount;
  
  grid.innerHTML = '';
  
  const searchEl = document.getElementById('searchCitas');
  const q = searchEl ? searchEl.value.toLowerCase().trim() : '';

  const arr = State.citas.filter(c => { 
     if(activeTab === 'done' && !c.done) return false;
     if(activeTab === 'pend' && c.done) return false;
     if(activeTab === 'todo' && c.done) return false;
     if(q && !c.name.toLowerCase().includes(q)) return false;
     return true; 
  });
  
  arr.forEach((c, idx) => {
    const photos = c.photos || [];
    let imgHtml = '';
    if (photos.length > 1) {
       imgHtml = `<div style="display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:2px; height:100%; border-radius:12px; overflow:hidden;">
          ${photos.slice(0, 4).map(p => `<img src="${p}" style="width:100%; height:100%; object-fit:cover;">`).join('')}
       </div>`;
    } else if (photos.length === 1) {
       imgHtml = `<img src="${photos[0]}" style="width:100%; height:100%; object-fit:cover; border-radius:12px; display:block;">`;
    } else {
       imgHtml = `<div class="cita-empty-ic">${c.done ? '📸' : '📅'}</div>`;
    }
    const el = document.createElement('div'); el.className = 'cita-card' + (c.done ? ' done' : '');
    el.innerHTML = `<div class="cita-num">#${c.id !== undefined ? c.id + 1 : idx + 1}</div>${imgHtml}${photos.length > 4 ? `<div class="cita-photo-count">+${photos.length-4}</div>` : ''}<div class="cita-name">${c.name}</div>`;
    el.onclick = () => {
      currentCitaId = State.citas.findIndex(orig => orig === c); 
      openCitaModal(currentCitaId);
    };
    grid.appendChild(el);
  });
  
  // Añadir la tarjeta de "Nueva Cita" al final si no estamos buscando específicamente
  if(activeTab === 'all' && !q) {
      const addCard = document.createElement('div');
      addCard.className = 'cita-card cita-add-card';
      addCard.innerHTML = `<div style="font-size:2rem; color:var(--rose);">➕</div><div style="font-size:0.8rem; font-weight:600; color:var(--rose3); margin-top:8px;">Nueva Cita</div>`;
      addCard.onclick = () => {
         const newName = prompt("¿Cómo se llama la nueva cita o plan?");
         if (newName && newName.trim()) {
             const newId = State.citas.length;
             State.citas.push({ id: newId, name: newName.trim(), done: false, date: null, desc: '', photos: [] });
             saveLocal('citas', State.citas);
             renderCitas();
             toast('¡Nueva cita agregada al álbum! 📒');
         }
      };
      grid.appendChild(addCard);
  }
}

// Abrir modal de cita cargando fotos de IndexedDB
async function openCitaModal(citaIdx) {
  const c = State.citas[citaIdx];
  if (!c) return;
  const modalEl = document.getElementById('citaMTitle');
  if (!modalEl) return;
  
  document.getElementById('citaMTitle').textContent = `Memoria #${citaIdx + 1}`;
  document.getElementById('citaName').value = c.name;
  document.getElementById('citaDate').value = c.date || '';
  document.getElementById('citaDesc').value = c.desc || '';
  document.getElementById('citaDriveLink').value = c.driveLink || '';
  document.getElementById('citaCheckDone').checked = c.done;
  
  // Cargar fotos guardadas
  pendPhotos = [...(c.photos || [])];
  pendPhotoIndex = 0;
  renderAlbumPreview();
  
  document.getElementById('citaModal').classList.add('open');
}

// Renderizar la galería de fotos del álbum en el modal
window.renderAlbumPreview = function() {
  const container = document.getElementById('citaAlbumArea');
  if (!container) return;
  
  let linkBtn = '';
  const dLink = document.getElementById('citaDriveLink') ? document.getElementById('citaDriveLink').value : '';
  if (dLink) {
     linkBtn = `<a href="${dLink}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px; background:var(--ios-blue); color:#fff; text-decoration:none; border-radius:12px; margin-bottom:16px; font-weight:600; font-size:0.9rem;"><i data-lucide="external-link" style="width:16px;height:16px;"></i> Ver Álbum Completo Externo</a>`;
  }

  if (pendPhotos.length === 0) {
    container.innerHTML = `
      ${linkBtn}
      <div class="album-empty" onclick="document.getElementById('photoInput').click()">
        <div style="font-size:3rem; opacity:0.12; margin-bottom:8px;">📸</div>
        <div style="font-size:0.85rem; color:var(--muted); font-weight:500;">Agregar portadas (opcional)</div>
      </div>`;
    if(window.lucide) lucide.createIcons();
    return;
  }
  
  container.innerHTML = `
    ${linkBtn}
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:8px; margin-bottom:16px;">
      ${pendPhotos.map((p, i) => `
        <div style="position:relative; aspect-ratio:1; border-radius:8px; overflow:hidden; border:1px solid rgba(0,0,0,0.05); box-shadow:0 2px 4px rgba(0,0,0,0.05);">
          <img src="${p}" style="width:100%; height:100%; object-fit:cover; display:block;" onclick="openPhotoFullscreen(${i})">
          <button onclick="deleteAlbumPhoto(${i})" style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:50%; width:22px; height:22px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
        </div>
      `).join('')}
      <div onclick="document.getElementById('photoInput').click()" style="aspect-ratio:1; border-radius:8px; border:2px dashed var(--glass-border); display:flex; align-items:center; justify-content:center; font-size:24px; color:var(--muted); cursor:pointer; background:rgba(255,255,255,0.4);">+</div>
    </div>
  `;
  if(window.lucide) lucide.createIcons();
}

window.deleteAlbumPhoto = function(idx) {
  pendPhotos.splice(idx, 1);
  if (pendPhotoIndex >= pendPhotos.length) pendPhotoIndex = Math.max(0, pendPhotos.length - 1);
  renderAlbumPreview();
  toast('Foto eliminada del álbum');
}

// Fullscreen photo viewer
window.openPhotoFullscreen = function(idx) {
  const overlay = document.createElement('div');
  overlay.className = 'photo-fullscreen';
  overlay.innerHTML = `
    <img src="${pendPhotos[idx]}">
    <button onclick="this.parentElement.remove()" style="position:absolute;top:20px;right:20px;background:rgba(0,0,0,0.6);color:#fff;border:none;width:44px;height:44px;border-radius:50%;font-size:1.3rem;cursor:pointer;z-index:10;">✕</button>`;
  overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

window.filterCitas = function(tab, btn) { activeTab = tab; document.querySelectorAll('.cita-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderCitas(); }

// Compresión inteligente de imágenes para evitar llenar la memoria del celular o Firebase
function compressImage(file, maxW, cb) {
  if(!file) return;
  let r = new FileReader(); 
  r.onload = e => {
    let img = new Image(); 
    img.onload = () => {
      let cvs = document.createElement('canvas'), w = img.width, h = img.height;
      if(w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
      if(h > maxW * 1.5) { w = Math.round((w * maxW * 1.5) / h); h = Math.round(maxW * 1.5); }
      cvs.width = w; cvs.height = h;
      let ctx = cvs.getContext('2d');
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      cb(cvs.toDataURL('image/jpeg', 0.6));
    }; 
    img.onerror = () => toast('Error al procesar la imagen.'); 
    img.src = e.target.result;
  }; 
  r.readAsDataURL(file);
}

// Handle multiple photo uploads for cita album
window.handlePhoto = function(e) { 
  const files = e.target.files;
  if(!files || files.length === 0) return;
  toast(`Procesando ${files.length} foto(s)... 📸`);
  let processed = 0;
  
  Array.from(files).forEach(file => {
    compressImage(file, 400, (dataUrl) => {
      pendPhotos.push(dataUrl);
      processed++;
      if (processed === files.length) {
        pendPhotoIndex = pendPhotos.length - 1;
        renderAlbumPreview();
        toast(`${files.length} foto(s) agregada(s) al álbum ✅`);
      }
    });
  });
  // Reset input so same file can be re-selected
  e.target.value = '';
}

window.saveCita = async function() {
  if(currentCitaId < 0 || currentCitaId >= State.citas.length) return;
  const c = State.citas[currentCitaId];
  c.name = document.getElementById('citaName').value;
  c.date = document.getElementById('citaDate').value;
  c.desc = document.getElementById('citaDesc').value;
  c.driveLink = document.getElementById('citaDriveLink').value;
  c.done = document.getElementById('citaCheckDone').checked;
  
  const btn = document.querySelector('#citaModal .btn');
  if(btn) { btn.disabled = true; btn.textContent = 'Guardando Nube... ⏳'; }
  document.getElementById('citaModal').classList.add('uploading');
  
  try {
    const finalPhotos = [];
    const citaId = c.id !== undefined ? c.id : currentCitaId;
    
    for(let i=0; i<pendPhotos.length; i++) {
      const p = pendPhotos[i];
      if (p.startsWith('data:image/')) {
        toast(`Subiendo foto ${i+1} de ${pendPhotos.length}...`);
        try {
           const fileName = `citas/${citaId}_${Date.now()}_${i}.jpg`;
           const url = await fbUploadImage(fileName, p);
           finalPhotos.push(url);
        } catch(storageErr) {
           uiError('¡Firebase Storage te ha bloqueado!<br><br>Parece que tu base de datos Firebase tiene las reglas de seguridad cerradas por defecto y no te deja subir nuevas fotos de portada.<br><br><b>Solución:</b> Ve a Firebase Console en tu laptop > Storage > Rules y cambia la regla a:<br><code>allow read, write: if true;</code><br><br>Mientras tanto, puedes pegar el enlace de Drive en su lugar.');
           throw storageErr;
        }
      } else {
        finalPhotos.push(p);
      }
    }
    
    c.photos = finalPhotos;
    saveLocal('citas', State.citas);
    toast('¡Memoria sincronizada! 💕');
    closeModal('citaModal');
    renderCitas();
  } catch(e) {
    console.error('Error guardando cita:', e);
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Guardar Memoria 💕'; }
    document.getElementById('citaModal').classList.remove('uploading');
  }
}

// === FEED ===
window.handlePostPhoto = function(e) {
  const f = e.target.files[0]; if(!f) return; 
  compressImage(f, 800, (dataUrl) => {
    pendPostPhoto = dataUrl; 
    document.getElementById('postImgEl').src = pendPostPhoto; 
    document.getElementById('postImgPreview').style.display = 'block';
    toast('Foto cargada en previsualización ✅');
  });
}
window.publishPost = async function() {
  const text = document.getElementById('postText').value; 
  if(!text && !pendPostPhoto) return toast('Redacta un momento breve o ponle foto.');
  
  const btn = document.querySelector('#sec-feed .btn-row .btn:not(.btn-ghost)');
  if(btn) { btn.disabled = true; btn.textContent = 'Subiendo... ⏳'; }
  
  try {
    let finalPhoto = pendPostPhoto;
    if (finalPhoto && finalPhoto.startsWith('data:image/')) {
       toast('Subiendo foto al álbum...');
       const fileName = `feed/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.jpg`;
       finalPhoto = await fbUploadImage(fileName, finalPhoto);
    }
    
    State.posts.unshift({ who: State.me, txt: text, photo: finalPhoto, date: new Date().toLocaleDateString('es', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) });
    saveLocal('posts', State.posts); 
    
    document.getElementById('postText').value = '';
    pendPostPhoto = null; 
    document.getElementById('postImgPreview').style.display='none'; 
    renderFeed(); 
    toast('Momentos plasmados 💖');
  } catch(e) {
    console.error('Error publicando post:', e);
    toast('Error guardando la foto. Revisa tu internet.');
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Subir Recuerdo'; }
  }
}
function renderFeed() {
  const el = document.getElementById('postsFeed');
  if(!State.posts.length) { el.innerHTML = '<p style="text-align:center;color:var(--muted); font-style:italic;">Primer libro en blanco. Inicien redactando.</p>'; return; }
  el.innerHTML = State.posts.map((p, i) => `
    <div class="card" style="padding:18px;">
       <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
         <div style="font-weight:700; font-family:'Playfair Display'; font-size:1.1rem; color:${p.who==='J'?'var(--gold2)':'var(--rose2)'}">${p.who==='J'?'Jhosep':'Gabriela'}</div>
         <div style="font-size:0.75rem; color:var(--muted); font-weight:600;">${p.date} <button onclick="delPost(${i})" style="background:none; border:none; color:var(--rose3); cursor:pointer; margin-left:10px;">🗑️</button></div>
       </div>
       ${p.photo ? `<img src="${p.photo}" style="width:100%; border-radius:14px; margin-bottom:12px;">` : ''}
       <p style="font-size:0.85rem; line-height: 1.6; color:var(--text);">${p.txt}</p>
    </div>
  `).join('');
}
window.delPost = function(i) { State.posts.splice(i,1); saveLocal('posts', State.posts); renderFeed(); }

// === CUADERNO INLINE (sin modal) ===
window.handleBkFile = function(e) {
  const f = e.target.files[0]; if(!f) return;
  if(f.size > 1.5 * 1024 * 1024) return toast('Excede 1.5MB de límite. Intenta comprimirlo.');
  const r = new FileReader(); r.onload = ev => { pendBkFile = ev.target.result; pendBkName = f.name; updateBkFileLabel(); }; r.readAsDataURL(f);
}
function updateBkFileLabel() { 
  const lbl = document.getElementById('bkFileLabel'); 
  if(!lbl) return;
  lbl.textContent = pendBkFile ? pendBkName : 'Ninguno'; 
}

window.saveBookNote = async function() {
  const t = document.getElementById('bkTitle').value, f = document.getElementById('bkFolder').value || 'General', b = document.getElementById('bkBody').value;
  if(!t) return toast('Ponle un título a la nota.');
  
  const btn = document.querySelector('#sec-cuaderno .btn-gold');
  if(btn) { btn.disabled = true; btn.textContent = 'Guardando... ⏳'; }
  
  try {
    let finalFile = pendBkFile;
    if (finalFile && finalFile.startsWith('data:')) {
       toast('Subiendo archivo adjunto...');
       const ext = pendBkName.split('.').pop() || 'file';
       const fileName = `cuaderno/${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
       finalFile = await fbUploadImage(fileName, finalFile);
    }

    let struct = { title: t, folder: f, body: b, date: Date.now(), file: finalFile, fileName: pendBkName };
    if(currentBookId !== null) { State.cuaderno[currentBookId] = struct; } else { State.cuaderno.push(struct); }
    saveLocal('cuaderno', State.cuaderno); 
    
    // Limpiar formulario
    document.getElementById('bkTitle').value = ''; document.getElementById('bkFolder').value = ''; document.getElementById('bkBody').value = '';
    pendBkFile = null; pendBkName = ''; currentBookId = null; updateBkFileLabel();
    renderCuaderno(); toast('Nota guardada ✅');
  } catch(e) {
    console.error('Error publicando nota:', e);
    toast('Error subiendo archivo. Intenta de nuevo.');
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Guardar Nota'; }
  }
}
window.editBookNote = function(id) {
  currentBookId = id; const n = State.cuaderno[id];
  document.getElementById('bkTitle').value = n.title; document.getElementById('bkFolder').value = n.folder; document.getElementById('bkBody').value = n.body; 
  pendBkFile = n.file || null; pendBkName = n.fileName || ''; updateBkFileLabel();
  document.getElementById('main').scrollTop = 0; // Scroll arriba para ver el form
  toast('Editando nota: ' + n.title);
}
window.deleteBookNote = function(id) { 
  State.cuaderno.splice(id, 1); saveLocal('cuaderno', State.cuaderno); renderCuaderno(); 
  if(currentBookId === id) { currentBookId = null; document.getElementById('bkTitle').value=''; document.getElementById('bkBody').value=''; }
  toast('Nota eliminada.'); 
}
function renderCuaderno(query = '') {
  const container = document.getElementById('bookGrid'); container.innerHTML = '';
  let filtered = State.cuaderno.map((n,i) => ({...n, id: i})).filter(n => {
    if(!n || !n.title) return false;
    if(query && !n.title.toLowerCase().includes(query.toLowerCase()) && !n.body.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  if(filtered.length === 0) { container.innerHTML = '<div class="card" style="text-align:center; color:var(--muted); font-style:italic; padding:30px;">Aún no hay notas. Escribe la primera arriba ☝️</div>'; return; }

  // Agrupar por carpeta
  let folders = {};
  filtered.forEach(n => { if(!folders[n.folder]) folders[n.folder] = []; folders[n.folder].push(n); });
  
  Object.keys(folders).forEach(folderName => {
    let section = `<div class="card" style="padding:18px; margin-bottom:14px;">
      <h4 style="font-family:'Playfair Display'; color:var(--rose2); font-style:italic; font-size:1.2rem; margin-bottom:14px; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:8px;">📂 ${folderName}</h4>`;
    folders[folderName].forEach(n => {
      let fileHTML = '';
      if(n.file) {
        if(n.file.startsWith('data:image/')) fileHTML = `<img src="${n.file}" style="max-width:100%; max-height:160px; border-radius:8px; margin-top:8px; border:1px solid rgba(0,0,0,0.05);">`;
        else if(n.file.startsWith('data:application/pdf')) fileHTML = `<a href="${n.file}" download="${n.fileName}" style="font-size:0.75rem; color:var(--gold2); display:block; margin-top:6px;">📎 ${n.fileName}</a>`;
      }
      section += `<div style="padding:12px 0; border-bottom:1px solid rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="flex:1;">
            <div style="font-weight:600; color:var(--text-dark); font-size:0.95rem;">📓 ${n.title}</div>
            <p style="font-size:0.82rem; color:var(--muted); margin-top:4px; line-height:1.5; white-space:pre-wrap;">${n.body}</p>
            ${fileHTML}
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0; margin-left:10px;">
            <button class="btn btn-ghost btn-sm" onclick="editBookNote(${n.id})" style="padding:6px 10px;">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteBookNote(${n.id})" style="padding:6px 10px;">🗑️</button>
          </div>
        </div>
      </div>`;
    });
    section += '</div>';
    container.innerHTML += section;
  });
}
window.filterNotasBook = function() { renderCuaderno(document.getElementById('ntSearch').value); }

// === MOOD RADAR Y CALENDARIO MENSUAL ===
const EMOJIS = ['Ninguno', '😡', '😞', '😴', '😐', '🙂', '🥰'];
let currentCalDate = new Date();

window.saveMood = function(who, level, btn) {
  document.querySelectorAll(`#sel${who} .mood-btn`).forEach(b => b.classList.remove('sel')); btn.classList.add('sel');
  const today = new Date().toLocaleDateString('en-CA');
  let existing = State.moods.find(m => m.date === today);
  if(!existing) { existing = { date: today, J: null, G: null }; State.moods.push(existing); }
  existing[who] = level;
  saveLocal('moods', State.moods); toast('Estado Diurno Apuntado ✨'); renderCalMonth(); 
}

function renderMoods() {
  const today = new Date().toLocaleDateString('en-CA');
  const m = State.moods.find(x => x.date === today);
  if(m) {
    if(m.J) { let js=document.querySelectorAll('#selJ .mood-btn'); if(js.length>=m.J) js[m.J-1].classList.add('sel'); }
    if(m.G) { let gs=document.querySelectorAll('#selG .mood-btn'); if(gs.length>=m.G) gs[m.G-1].classList.add('sel'); }
  }
}

window.changeCalMonth = function(dir) {
  currentCalDate.setMonth(currentCalDate.getMonth() + dir);
  renderCalMonth();
}

window.renderCalMonth = function() {
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const y = currentCalDate.getFullYear(); const m = currentCalDate.getMonth();
  document.getElementById('calMonthLabel').textContent = `${monthNames[m]} ${y}`;

  const grid = document.getElementById('moodCalGrid');
  if(!grid) return;
  grid.innerHTML = '<div class="cal-head">LUN</div><div class="cal-head">MAR</div><div class="cal-head">MIE</div><div class="cal-head">JUE</div><div class="cal-head">VIE</div><div class="cal-head">SAB</div><div class="cal-head">DOM</div>';
  
  const firstDay = new Date(y, m, 1).getDay();
  let shift = firstDay === 0 ? 6 : firstDay - 1; 
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for(let i=0; i<shift; i++) grid.innerHTML += '<div class="cal-day empty"></div>';

  for(let day=1; day<=daysInMonth; day++) {
    const dStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const moodData = State.moods.find(x => x.date === dStr);
    let jEm = moodData && moodData.J ? EMOJIS[moodData.J] : '';
    let gEm = moodData && moodData.G ? EMOJIS[moodData.G] : '';
    
    let cont = `<div class="cal-date-lb">${day}</div>`;
    if (jEm || gEm) cont += `<div class="cal-em-row"><span>${jEm}</span><span>${gEm}</span></div>`;

    grid.innerHTML += `<div class="cal-day" title="${dStr}">${cont}</div>`;
  }
}

// =============================================
// === WATCH PARTY (EMBED VISUAL EN PÁGINA) ===
// =============================================

// Limpiar estado
if(State.wp.type && !['yt-embed','mp4','iframe','none'].includes(State.wp.type)) {
  State.wp.type = 'none'; State.wp.url = '';
}

// Inicializar YouTube API dinámicamente
let ytPlayer = null;
let isYtReady = false;

if (!window.YT) {
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName('script')[0];
  if (firstScriptTag) firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  else document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() {
  isYtReady = true;
  if (State.wp.type === 'yt-embed' && State.wp.embedSrc) {
    createYtPlayer();
  }
};

function createYtPlayer() {
  const ytId = getYtId(State.wp.url);
  if(!ytId || !isYtReady) return;
  
  // Limpiar anterior si existe
  const container = document.getElementById('wpYtPlayer');
  if(!container) return;
  
  if(ytPlayer) {
    try { ytPlayer.destroy(); ytPlayer = null; } catch(e){}
  }
  
  // YouTube API reemplaza el DIV, necesitamos el div original si se destruyó
  if (container.tagName !== 'DIV') {
      const newDiv = document.createElement('div');
      newDiv.id = 'wpYtPlayer';
      newDiv.style.display = 'block';
      newDiv.style.width = '100%';
      newDiv.style.height = '100%';
      container.parentNode.replaceChild(newDiv, container);
  } else {
      container.style.display = 'block';
  }

  ytPlayer = new YT.Player('wpYtPlayer', {
    height: '100%',
    width: '100%',
    videoId: ytId,
    playerVars: { 'playsinline': 1, 'rel': 0 },
    events: {
      'onReady': onYtReady,
      'onStateChange': onYtStateChange
    }
  });
}

function onYtReady(event) {
  if (State.wp.playing) event.target.playVideo();
  if (State.wp.time > 0) event.target.seekTo(State.wp.time, true);
}

function onYtStateChange(event) {
  if (isInternalSync) return;
  if (event.data === YT.PlayerState.PLAYING) {
    State.wp.playing = true;
    State.wp.time = ytPlayer.getCurrentTime();
    State.wp.ctrl = State.me === 'J' ? 'Jhosep' : 'Gabriela';
    saveLocal('wp', State.wp);
  } else if (event.data === YT.PlayerState.PAUSED) {
    State.wp.playing = false;
    State.wp.time = ytPlayer.getCurrentTime();
    State.wp.ctrl = State.me === 'J' ? 'Jhosep' : 'Gabriela';
    saveLocal('wp', State.wp);
  } else if (event.data === YT.PlayerState.ENDED) {
    if (State.wp.queue && State.wp.queue.length > 0) {
       setTimeout(playNextInQueue, 1500);
    }
  }
}

// ==== MP4 Native Sync ====
const wpVideo = document.getElementById('wpVideo');
if(wpVideo) {
  wpVideo.addEventListener('play', () => {
    if(isInternalSync) return;
    State.wp.playing = true; State.wp.time = wpVideo.currentTime; 
    State.wp.ctrl = State.me === 'J' ? 'Jhosep' : 'Gabriela'; saveLocal('wp', State.wp);
  });
  wpVideo.addEventListener('pause', () => {
    if(isInternalSync) return;
    State.wp.playing = false; State.wp.time = wpVideo.currentTime; 
    State.wp.ctrl = State.me === 'J' ? 'Jhosep' : 'Gabriela'; saveLocal('wp', State.wp);
  });
  wpVideo.addEventListener('seeked', () => {
    if(isInternalSync) return;
    State.wp.time = wpVideo.currentTime; 
    State.wp.ctrl = State.me === 'J' ? 'Jhosep' : 'Gabriela'; saveLocal('wp', State.wp);
  });
  wpVideo.addEventListener('ended', () => {
    if (State.wp.queue && State.wp.queue.length > 0) {
       setTimeout(playNextInQueue, 1500);
    }
  });
}

function getYtId(url) {
  try {
    if(url.includes('v=')) return url.split('v=')[1].split('&')[0];
    if(url.includes('youtu.be/')) return url.split('youtu.be/')[1].split('?')[0];
    if(url.includes('/embed/')) return url.split('/embed/')[1].split('?')[0];
  } catch(e) {}
  return null;
}

function buildEmbedUrl(url) {
  const ytId = getYtId(url);
  if(ytId) return { src: 'https://www.youtube.com/embed/' + ytId + '?rel=0&enablejsapi=1', type: 'yt-embed' };
  if(url.includes('drive.google.com/file/d/')) return { src: 'https://drive.google.com/file/d/' + url.split('/d/')[1].split('/')[0] + '/preview', type: 'iframe' };
  if(url.includes('tiktok.com')) return { src: 'https://www.tiktok.com/embed/v2/' + url.split('/').pop().split('?')[0], type: 'iframe' };
  if(url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return { src: url, type: 'mp4' };
  return { src: url, type: 'iframe' };
}

window.loadWpVideo = function() {
  let url = document.getElementById('wpUrl').value.trim();
  if(!url) return toast('Pega un link primero.');
  if(!url.startsWith('http')) url = 'https://' + url;

  const result = buildEmbedUrl(url);
  State.wp.url = url;
  State.wp.embedSrc = result.src;
  State.wp.type = result.type;
  State.wp.ctrl = State.me === 'J' ? 'Jhosep' : 'Gabriela';
  State.wp.time = 0; 
  State.wp.playing = false;
  S.s('wp', State.wp);
  
  if (ytPlayer && State.wp.type !== 'yt-embed') {
     try { ytPlayer.pauseVideo(); } catch(e){}
  }
  
  showWpEmbed();
  toast('Video cargado y Sincronizado!');
}

window.clearWpLink = function() {
  if (ytPlayer && ytPlayer.stopVideo) try { ytPlayer.stopVideo(); } catch(e){}
  if (wpVideo) wpVideo.pause();
  State.wp.url = ''; State.wp.type = 'none'; State.wp.embedSrc = '';
  saveLocal('wp', State.wp);
  showWpEmbed();
}

window.syncWpNow = function() {
  State.wp.ctrl = State.me === 'J' ? 'Jhosep' : 'Gabriela';
  if (State.wp.type === 'yt-embed' && ytPlayer && ytPlayer.getCurrentTime) {
      State.wp.time = ytPlayer.getCurrentTime();
      State.wp.playing = ytPlayer.getPlayerState() === 1;
  } else if (State.wp.type === 'mp4' && wpVideo) {
      State.wp.time = wpVideo.currentTime;
      State.wp.playing = !wpVideo.paused;
  }
  saveLocal('wp', State.wp);
  toast(`Sincronizado forzado por ${State.wp.ctrl} 📡`);
}

window.addToWpQueue = function() {
  let url = document.getElementById('wpUrl').value.trim();
  if(!url) return toast('Pega un link para añadir a la cola.');
  if(!url.startsWith('http')) url = 'https://' + url;
  
  if(!State.wp.queue) State.wp.queue = [];
  State.wp.queue.push({ url: url, who: State.me || 'J', date: Date.now() });
  saveLocal('wp', State.wp);
  document.getElementById('wpUrl').value = '';
  toast('¡Añadido a la cola! 📝');
  renderWpQueue();
}

window.playNextInQueue = function() {
  if (!State.wp.queue || State.wp.queue.length === 0) return toast('La cola está vacía.');
  const next = State.wp.queue.shift(); // Saca el primero
  saveLocal('wp', State.wp);
  
  // Como cargar el video auto
  document.getElementById('wpUrl').value = next.url;
  loadWpVideo();
  setTimeout(() => {
     State.wp.playing = true;
     saveLocal('wp', State.wp);
  }, 1000); // Give it a second to load then auto play
}

window.removeFromQueue = function(queueIndex) {
  if (!State.wp.queue) return;
  State.wp.queue.splice(queueIndex, 1);
  saveLocal('wp', State.wp);
  renderWpQueue();
}

function renderWpQueue() {
  const container = document.getElementById('wpQueueList');
  const nextBtn = document.getElementById('wpNextBtn');
  if(!container) return;
  
  if(!State.wp.queue || State.wp.queue.length === 0) {
     container.innerHTML = '<p style="font-size:0.8rem; color:var(--muted); font-style:italic;">La cola está vacía.</p>';
     if(nextBtn) nextBtn.style.display = 'none';
     return;
  }
  
  if(nextBtn) nextBtn.style.display = 'block';
  
  container.innerHTML = State.wp.queue.map((item, idx) => `
    <div class="wp-queue-item ${idx===0 ? 'active' : ''}">
       <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:10px;">
         <span style="font-size:0.75rem; color:var(--gold2); display:block; margin-bottom:2px;">Añadido por ${item.who==='J'?'Jhosep':'Gabriela'}</span>
         ${item.url}
       </div>
       <button class="btn btn-ghost btn-sm" style="flex-shrink:0; padding:4px 8px;" onclick="removeFromQueue(${idx})">❌</button>
    </div>
  `).join('');
}

function showWpEmbed() {
  const embed = document.getElementById('wpEmbed');
  const ph = document.getElementById('wpPlaceholder');
  const ytCont = document.getElementById('wpYtPlayer');
  if(!embed || !wpVideo || !ph) return;

  embed.style.display = 'none';
  wpVideo.style.display = 'none';
  if(ytCont) ytCont.style.display = 'none';
  ph.style.display = 'none';

  isInternalSync = true;

  if(!State.wp.type || State.wp.type === 'none' || !State.wp.embedSrc) {
    ph.style.display = 'flex';
  } else if(State.wp.type === 'mp4') {
    wpVideo.style.display = 'block';
    if(wpVideo.src !== State.wp.embedSrc) wpVideo.src = State.wp.embedSrc;
    if(Math.abs(wpVideo.currentTime - State.wp.time) > 1.5) wpVideo.currentTime = State.wp.time;
    if(State.wp.playing) { wpVideo.play().catch(()=>{}); } else { wpVideo.pause(); }
  } else if(State.wp.type === 'yt-embed') {
    if (ytCont) ytCont.style.display = 'block';
    if (!ytPlayer || !ytPlayer.playVideo) {
        if(isYtReady) createYtPlayer();
    } else {
        const currentYtId = getYtId(State.wp.url);
        if (rootYtIdMatches(ytPlayer.getVideoUrl(), currentYtId)) {
            let cTime = ytPlayer.getCurrentTime && ytPlayer.getCurrentTime() || 0;
            if(Math.abs(cTime - State.wp.time) > 1.5) ytPlayer.seekTo(State.wp.time, true);
            if(State.wp.playing) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
        } else {
            ytPlayer.loadVideoById(currentYtId, State.wp.time);
            if (!State.wp.playing) setTimeout(() => ytPlayer.pauseVideo(), 500); 
        }
    }
  } else {
    // Otros links
    embed.style.display = 'block';
    if(embed.src !== State.wp.embedSrc) embed.src = State.wp.embedSrc;
  }

  const st = document.getElementById('wpStatusLabel');
  if(st) st.textContent = 'Controlado por: ' + (State.wp.ctrl || 'Nadie');
  
  renderWpQueue();
  setTimeout(() => { isInternalSync = false; }, 800);
}

function rootYtIdMatches(url, id) {
   if (!url || !id) return false;
   return url.includes(id);
}

function syncWpPlayerRemotely() { showWpEmbed(); }
function renderWpLink() { showWpEmbed(); }

window.sendWpChat = function() {
  const m = document.getElementById('wpChatMsg').value.trim(); if(!m) return; const who = State.me || 'J';
  State.wp.chat.push({w:who, m:m, id:Date.now()}); if(State.wp.chat.length > 50) State.wp.chat.shift();
  saveLocal('wp', State.wp); document.getElementById('wpChatMsg').value = ''; renderWpChat();
}
function renderWpChat() {
  const box = document.getElementById('wpChatBox'); if(!box) return; const me = State.me || 'J';
  box.innerHTML = State.wp.chat.map(c => `<div class="msg-bubble ${c.w === me ? 'me' : 'other'}"><strong style="font-size:0.6rem;opacity:0.5;display:block;">${c.w}</strong>${c.m}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}
// === MISC OLD SECTIONS ===
window.addFecha = function() { const n = document.getElementById('nfn').value.trim(); const d = document.getElementById('nfd').value; if(n && d) { State.fechas.push({name:n, date:d, icon:document.getElementById('nfi').value||'🗓️', id:Date.now()}); saveLocal('fechas', State.fechas); renderFechas(); toast('Agendado 🗓️'); document.getElementById('nfn').value='';} }
window.delFecha = function(i) { State.fechas.splice(i,1); saveLocal('fechas', State.fechas); renderFechas(); }
function renderFechas() { document.getElementById('fechasList').innerHTML = State.fechas.map((f,i) => `<div class="card" style="display:flex; justify-content:space-between; align-items:center;"><span><span style="font-size:1.5rem;">${f.icon||'📍'}</span> <b>${f.name}</b> (${f.date})</span><button class="btn btn-ghost btn-sm" onclick="delFecha(${i})">🗑️</button></div>`).join(''); }

window.filterDreams = function(tab, btn) { activeDreamTab = tab; document.querySelectorAll('#sec-suenos .cita-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderDreams(); }
window.addDream = function() { let d = document.getElementById('newDream').value.trim(); if(d) { State.dreams.push({title: d, done: false}); saveLocal('dreams', State.dreams); renderDreams(); document.getElementById('newDream').value='';} }
window.rmDream = function(i) { State.dreams.splice(i,1); saveLocal('dreams', State.dreams); renderDreams(); }
window.toggleDream = function(i) { State.dreams[i].done = !State.dreams[i].done; saveLocal('dreams', State.dreams); renderDreams(); }
function renderDreams() {
  const arr = State.dreams.map((d,i)=>({d,i})).filter(x => activeDreamTab==='todo' ? !x.d.done : x.d.done);
  document.getElementById('dreamsList').innerHTML = arr.length ? arr.map(x => `
    <div class="dream-item ${x.d.done ? 'done':''}">
      <span class="title" style="flex:1;">${x.d.title}</span>
      <div style="display:flex; gap:6px;">
         <button class="btn btn-sm ${x.d.done?'btn-gold':'btn-ghost'}" onclick="toggleDream(${x.i})">✅</button>
         <button class="btn btn-ghost btn-sm" onclick="rmDream(${x.i})">🗑️</button>
      </div>
    </div>`).join('') : `<p style="text-align:center;color:var(--muted);font-style:italic;padding:20px;">No hay sueños en esta sección.</p>`; 
}

window.addSong = function() { let t = document.getElementById('nst').value; if(!t) return; State.songs.push({t:t, a:document.getElementById('nsa').value, n:document.getElementById('nsn').value}); saveLocal('songs', State.songs); renderSongs(); document.getElementById('nst').value='';document.getElementById('nsa').value='';document.getElementById('nsn').value='';}
window.rmSong = function(i) { State.songs.splice(i,1); saveLocal('songs', State.songs); renderSongs(); }
function renderSongs() { document.getElementById('songsList').innerHTML = State.songs.map((s,i)=>`<div class="card" style="display:flex; justify-content:space-between;"><div><b style="color:var(--gold2)">${s.t}</b> - ${s.a}<br><small style="color:var(--muted);">${s.n}</small></div><button onclick="rmSong(${i})" class="btn btn-ghost btn-sm">🗑️</button></div>`).join(''); }

window.addPlace = function() { let n = document.getElementById('npn').value; if(!n) return; State.places.push({n:n, d:document.getElementById('npd').value, i:document.getElementById('npi').value||'📍'}); saveLocal('places', State.places); renderPlaces(); document.getElementById('npn').value='';document.getElementById('npd').value='';document.getElementById('npi').value='';}
window.rmPlace = function(i) { State.places.splice(i,1); saveLocal('places', State.places); renderPlaces(); }
function renderPlaces() { document.getElementById('placesList').innerHTML = State.places.map((p,i)=>`<div class="card" style="display:flex; justify-content:space-between; align-items:center;"><div><span style="font-size:2rem; margin-right:10px;">${p.i||'📍'}</span><b>${p.n}</b><br><small style="color:var(--muted);">${p.d}</small></div><button onclick="rmPlace(${i})" class="btn btn-ghost btn-sm">🗑️</button></div>`).join(''); }

window.mostrarNotaAleatoria = function() { if(!State.notasList.length) return toast('Aún no hay mensajes en el cofre.'); let r = State.notasList[Math.floor(Math.random()*State.notasList.length)]; document.getElementById('notaDiaria').innerHTML = `De: <span style="font-style:normal;">${r.w==='J'?'🧔 Jhosep':'👩 Gabriela'}</span><br><br>"${r.t}"`; }
window.guardarNota = function(who) { let text = document.getElementById('notaTxt').value.trim(); if(text) { State.notasList.push({w: who, t:text}); saveLocal('notasList', State.notasList); toast('Pergamino oculto entre las ropas 💌'); document.getElementById('notaTxt').value=''; } }

window.saveCarta = function(who) { State.carta = { for: who, txt: document.getElementById('cartaTxt').value, date: document.getElementById('cartaDate').value }; saveLocal('carta', State.carta); toast('Cápsula cerrada y lacrada 🔒'); document.getElementById('cartaTxt').value=''; renderCarta(); }
function renderCarta() { let c = State.carta; let el = document.getElementById('cartaView'); if(!c) { el.innerHTML = 'Aún no hay cápsula viva.'; return; } let d = Math.ceil((new Date(c.date) - new Date()) / 86400000); if(d > 0) el.innerHTML = `<h3 style="color:var(--rose3);">Para ${c.for}</h3><p style="font-size:2rem; margin:10px 0;">⏳</p><p style="color:var(--text-dark)">Faltan ${d} días para revelar el contenido.</p>`; else el.innerHTML = `<h3 style="color:var(--rose3);">Para ${c.for}</h3><p style="font-size:1rem; margin-top:20px; font-style:italic;">"${c.txt}"</p>`; }

const DEF_PLANS = ['Pizza + Anime', 'Spa Romántico', 'Ocaso Lento', 'Heladería Ciega', 'Cocinar Nuevo Plato'];
let wAngle = 0; let isSpinning = false;
function getPlans() { return [...DEF_PLANS, ...State.plans]; }
window.drawW = function(a = 0) {
  let cv = document.getElementById('wCanvas'); if(!cv || cv.offsetParent === null) return;
  let ctx = cv.getContext('2d'); if(!ctx) return;
  let plans = getPlans(), n = plans.length; if(n === 0) return;
  let arc = 2*Math.PI/n, r = 140, cx = 140, cy = 140;
  ctx.clearRect(0,0,280,280);
  let cols = ['#d68383', '#bf6f6f', '#c2aa7a', '#ad9463', '#b37f71', '#9e695b'];
  for(let i=0; i<n; i++) {
    let s = a + i*arc, e = s + arc;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,s,e); ctx.closePath(); ctx.fillStyle = cols[i%cols.length]; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(s + arc/2); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '500 10px Inter';
    let txt = plans[i] ? (plans[i].length>18 ? plans[i].substring(0,17)+'...' : plans[i]) : '?';
    ctx.fillText(txt, r-15, 3); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx,cy,22,0,Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.fillStyle = '#d68383'; ctx.font='16px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('💕', cx, cy+2);
}
window.spinW = function() {
  if(isSpinning) return; isSpinning = true; document.getElementById('wResult').style.display='none';
  let spins = Math.PI*2 * (4 + Math.random()*3) + Math.random()*Math.PI*2; let duration = 3000; let start = performance.now(); let sa = wAngle;
  function animate(time) {
    let p = Math.min((time - start) / duration, 1); let ease = 1 - Math.pow(1 - p, 4); wAngle = sa + spins * ease; drawW(wAngle);
    if(p < 1) requestAnimationFrame(animate);
    else {
      isSpinning = false; let plans = getPlans(), n = plans.length; let rot = ((wAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
      let idx = Math.floor(((Math.PI*2 - rot) % (Math.PI*2)) / (Math.PI*2 / n)) % n;
      document.getElementById('wPlan').textContent = plans[idx]; document.getElementById('wResult').style.display = 'block';
    }
  }
  requestAnimationFrame(animate);
}
window.addPlan = function() { let p = document.getElementById('newPlan').value.trim(); if(p) { State.plans.push(p); saveLocal('plans', State.plans); document.getElementById('newPlan').value=''; drawW(wAngle); toast('El destino decide 🦋');} }
window.rmPlan = function(idx) { State.plans.splice(idx, 1); saveLocal('plans', State.plans); drawW(wAngle); }

// === JUEGOS GLOBALES ===
window.showGame = function(id) {
  document.querySelectorAll('.gpanel').forEach(p => p.style.display='none'); document.getElementById('gp-'+id).style.display='block'; document.getElementById('game-placeholder').style.display='none';
  setTimeout(()=> {
     if(id==='connect4') { syncGamesRenderer(); } 
     if(id==='tictactoe') { syncGamesRenderer(); } 
     if(id==='snake') { initSnake(); }
     if(id==='memory') { syncGamesRenderer(); }
  }, 100);
}

window.initTTT = function() { State.games.ttt = { b:Array(9).fill(null), t:'J', o:false }; saveLocal('games', State.games); syncGamesRenderer(); }
window.drawTTT = function() {
  let cv = document.getElementById('tttCanvas'); if(!cv) return; let ctx = cv.getContext('2d'); ctx.clearRect(0,0,300,300); ctx.strokeStyle = "rgba(0,0,0,0.1)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(100,20); ctx.lineTo(100,280); ctx.stroke(); ctx.beginPath(); ctx.moveTo(200,20); ctx.lineTo(200,280); ctx.stroke(); ctx.beginPath(); ctx.moveTo(20,100); ctx.lineTo(280,100); ctx.stroke(); ctx.beginPath(); ctx.moveTo(20,200); ctx.lineTo(280,200); ctx.stroke();
  State.games.ttt.b.forEach((v, i) => { if(!v) return; let x = (i%3)*100 + 50, y = Math.floor(i/3)*100 + 50; ctx.font = "bold 60px Inter"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = v==='J' ? "var(--gold2)" : "var(--rose2)"; ctx.fillText(v==='J' ? 'X' : 'O', x, y+5); });
}
// Helper to get coordinates from either mouse or touch events
function getEventCoords(e) {
  if(e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if(e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

window.tttClick = function(e) {
  e.preventDefault();
  const g = State.games.ttt; if(g.o) return; if(State.me && State.me !== g.t) return toast(`¡Espera! Es el turno de ${g.t==='J'?'Jhosep':'Gabriela'}`);
  const coords = getEventCoords(e);
  let r = e.target.getBoundingClientRect();
  let scaleX = 300 / r.width, scaleY = 300 / r.height;
  let x = (coords.x - r.left) * scaleX, y = (coords.y - r.top) * scaleY;
  let i = Math.floor(x/100) + Math.floor(y/100)*3;
  if(i < 0 || i > 8) return;
  if(g.b[i]) return; g.b[i] = g.t; const w = [ [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6] ];
  if(w.some(c => g.b[c[0]] && g.b[c[0]]===g.b[c[1]] && g.b[c[1]]===g.b[c[2]])) { giveScore(g.t); g.o = true; toast(`¡Ganador: ${g.t==='J'?'Jhosep':'Gabriela'}! 🏅`); }
  else if(!g.b.includes(null)) { toast('Lástima, ¡Empate!'); g.o=true; } else { g.t = g.t==='J' ? 'G' : 'J'; }
  saveLocal('games', State.games); syncGamesRenderer();
}

const C4_C = 7, C4_R = 6, C_SZ = 350, R_SZ = 300, C_W = C_SZ/C4_C, C_H = R_SZ/C4_R;
window.initC4 = function() { State.games.c4 = { b:Array(C4_R).fill().map(()=>Array(C4_C).fill(null)), t:'J', o:false }; saveLocal('games', State.games); syncGamesRenderer(); }
window.drawC4 = function() {
  let cv = document.getElementById('c4Canvas'); if(!cv) return; let ctx = cv.getContext('2d'); ctx.clearRect(0,0,C_SZ,R_SZ); ctx.fillStyle="#faf9f7"; ctx.fillRect(0,0,C_SZ,R_SZ);
  for(let r=0; r<C4_R; r++) { for(let c=0; c<C4_C; c++) { let x = c*C_W + C_W/2, y = r*C_H + C_H/2; ctx.beginPath(); ctx.arc(x,y, C_W/2 - 4, 0, Math.PI*2); let v = State.games.c4.b[r][c]; ctx.fillStyle = v==='J' ? '#c2aa7a' : (v==='G' ? '#d68383' : '#e6dfd8'); ctx.fill(); } }
}
window.c4Click = function(e) {
  e.preventDefault();
  const g = State.games.c4; if(g.o) return; if(State.me && State.me !== g.t) return toast(`¡Espera! Mueve ${g.t==='J'?'Jhosep':'Gabriela'}`);
  const coords = getEventCoords(e);
  let r = e.target.getBoundingClientRect();
  let scaleX = C_SZ / r.width;
  let col = Math.floor((coords.x - r.left) * scaleX / C_W);
  if(col < 0 || col >= C4_C) return;
  for(let row=C4_R-1; row>=0; row--) {
    if(!g.b[row][col]) {
       g.b[row][col] = g.t; if(checkC4Win(row, col, g.t, g.b)) { giveScore(g.t); g.o=true; toast(`¡${g.t==='J'?'Jhosep':'Gabriela'} hizo Conecta 4! 🔥`); }
       else { g.t = g.t==='J' ? 'G' : 'J'; } 
       saveLocal('games', State.games); syncGamesRenderer(); return;
    }
  }
}
function checkC4Win(r, c, who, bd) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  return dirs.some(([dr,dc]) => { let count = 1; for(let d of [1,-1]) { let nr=r+dr*d, nc=c+dc*d; while(nr>=0 && nr<C4_R && nc>=0 && nc<C4_C && bd[nr][nc]===who) { count++; nr+=dr*d; nc+=dc*d; } } return count >= 4; });
}

// WORDLE
const WORDS = ['AMOR', 'BESOS', 'FELIZ', 'NOCHE', 'CIELO', 'CARTA', 'MAGIA', 'DULCE', 'ALMAS']; let wrdGoal='', wrdRow=0;
window.initWordle = function() { wrdGoal = WORDS[Math.floor(Math.random()*WORDS.length)]; wrdRow = 0; document.getElementById('wrdInput').value = ''; document.getElementById('wrdInput').disabled = false; let grid = document.getElementById('wrdGrid'); grid.style.gridTemplateColumns = `repeat(${wrdGoal.length}, 1fr)`; grid.innerHTML = Array(6 * wrdGoal.length).fill('<div style="aspect-ratio:1; background:#f4f0ec; border:1px solid rgba(0,0,0,0.1); border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.4rem; color:var(--text-dark);"></div>').join(''); }
window.wrdGuess = function() {
  let guess = document.getElementById('wrdInput').value.toUpperCase().trim(); if(guess.length !== wrdGoal.length) return toast(`Debe tener ${wrdGoal.length} letras`);
  let cells = document.getElementById('wrdGrid').children; let isWin = true;
  for(let i=0; i<wrdGoal.length; i++) {
    let cell = cells[wrdRow * wrdGoal.length + i]; cell.textContent = guess[i]; cell.style.color = 'white';
    if(guess[i] === wrdGoal[i]) { cell.style.background = 'var(--rose2)'; cell.style.borderColor = 'var(--rose2)'; }
    else if(wrdGoal.includes(guess[i])) { cell.style.background = 'var(--gold2)'; cell.style.borderColor = 'var(--gold2)'; isWin=false; }
    else { cell.style.background = '#8a7f7b'; isWin=false; }
  }
  document.getElementById('wrdInput').value = ''; wrdRow++;
  if(isWin) { toast('¡Victoria! ✅'); giveScore(State.me||'J'); document.getElementById('wrdInput').disabled=true; } else if(wrdRow >= 6) { toast('Era: ' + wrdGoal); document.getElementById('wrdInput').disabled=true; }
}

// SNAKE LOCAL FIX AUTOSTART
let snake=null, skInterval=null;
window.initSnake = function() {
  if (skInterval) clearInterval(skInterval); skInterval = null;
  snake = { s:[{x:10,y:10},{x:9,y:10}], d:{x:1,y:0}, f:{x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*20)}, score:0, dead:false };
  drawSk();
}
window.startSnake = function() {
  if (skInterval) clearInterval(skInterval);
  initSnake();
  skInterval = setInterval(stepSk, 130);
  toast("¡Serpiente iniciada! Usa flechas o botones ▲▼◀▶");
}
window.drawSk = function() {
  let cv = document.getElementById('snakeCanvas'); if(!cv) return; let ctx = cv.getContext('2d');
  ctx.clearRect(0,0,280,280); ctx.fillStyle="#faf9f7"; ctx.fillRect(0,0,280,280);
  if(!snake) return;
  ctx.fillStyle='#d68383'; ctx.font='14px Inter'; ctx.fillText('❤️', snake.f.x*14, snake.f.y*14 + 12);
  snake.s.forEach((p,i) => { ctx.fillStyle = i===0 ? '#9e695b' : '#b37f71'; ctx.fillRect(p.x*14, p.y*14, 13, 13); });
  if(snake.dead) { ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.fillRect(0,0,280,280); ctx.fillStyle='#2a2220'; ctx.font='600 16px Inter'; ctx.fillText(`Fin! Puntos: ${snake.score}. \nClick para reiniciar.`, 40, 140); }
}
function stepSk() {
  if (!snake || snake.dead) return;
  let h = snake.s[0], nx = (h.x + snake.d.x + 20) % 20, ny = (h.y + snake.d.y + 20) % 20;
  if(snake.s.some(p => p.x===nx && p.y===ny)) { snake.dead = true; giveScore(State.me||'J'); toast('¡Auch!'); drawSk(); clearInterval(skInterval); skInterval = null; return;}
  snake.s.unshift({x:nx,y:ny});
  if(nx === snake.f.x && ny === snake.f.y) { snake.score++; snake.f = {x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*20)}; } else { snake.s.pop(); }
  drawSk();
}
document.addEventListener('keydown', e => {
  if(document.getElementById('sec-juegos').classList.contains('active') && document.getElementById('gp-snake').style.display==='block') {
    let map={'ArrowLeft':[-1,0],'ArrowRight':[1,0],'ArrowUp':[0,-1],'ArrowDown':[0,1]};
    if(map[e.key] && snake) { e.preventDefault(); if (snake.d.x !== -map[e.key][0] || snake.d.y !== -map[e.key][1]) snake.d = {x:map[e.key][0], y:map[e.key][1]}; }
  }
});

// Mobile D-pad for snake
window.snakeDir = function(dx, dy) {
  if(!snake || snake.dead) return;
  if(snake.d.x !== -dx || snake.d.y !== -dy) {
    snake.d = { x: dx, y: dy };
  }
}

let memLock = false;
window.initMemory = function() {
  let p = [...['🌹','☕','✨','🥰','💖','🎵','🌙','🍒'], ...['🌹','☕','✨','🥰','💖','🎵','🌙','🍒']]; p.sort(()=>Math.random()-0.5); 
  State.games.mem = { s: p, f: [], m: [], tr: 0 }; memLock = false; saveLocal('games', State.games); syncGamesRenderer();
}
window.clickMem = function(i) {
  let g = State.games.mem; if(memLock || g.f.includes(i) || g.m.includes(i) || !g.s || g.s.length === 0) return;
  g.f.push(i); renderMem();
  if(g.f.length === 2) {
    g.tr++; memLock = true;
    setTimeout(() => {
      let [a,b] = g.f; if(g.s[a]===g.s[b]) g.m.push(a,b); g.f = []; memLock=false; 
      saveLocal('games', State.games); syncGamesRenderer();
      if(g.m.length === g.s.length) { giveScore(State.me||'J'); toast('¡Memoria superada! 🏅'); }
    }, 800);
  }
}
function renderMem() {
  let g = State.games.mem; if(!g || !g.s) return; document.getElementById('memTurnsLabel').textContent = g.tr || 0;
  document.getElementById('memGrid').innerHTML = g.s.map((em,i) => {
    let show = g.f.includes(i) || g.m.includes(i);
    return `<div onclick="clickMem(${i})" style="aspect-ratio:3/4; background:${show?'#faf9f7':'var(--rose2)'}; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:2rem; border:1px solid var(--glass-border); cursor:pointer; transition:0.3s; box-shadow:0 4px 10px rgba(0,0,0,0.05);">${show?em:''}</div>`
  }).join('');
}

// ==== APP PRE LAUNCH =====
document.addEventListener("DOMContentLoaded", () => {
    if(State.me) refreshUI();
    initWordle();
    initFloatingHearts();
    initCursorTrail();
    initTouchCanvases();
});

// === MOBILE TOUCH SUPPORT FOR GAME CANVASES ===
function initTouchCanvases() {
  // TicTacToe canvas touch
  const tttCv = document.getElementById('tttCanvas');
  if(tttCv) {
    tttCv.addEventListener('touchend', function(e) { e.preventDefault(); tttClick(e); }, { passive: false });
  }
  // Connect4 canvas touch
  const c4Cv = document.getElementById('c4Canvas');
  if(c4Cv) {
    c4Cv.addEventListener('touchend', function(e) { e.preventDefault(); c4Click(e); }, { passive: false });
  }
  // Snake canvas touch to start
  const skCv = document.getElementById('snakeCanvas');
  if(skCv) {
    skCv.addEventListener('touchend', function(e) { e.preventDefault(); startSnake(); }, { passive: false });
  }
}

// === CORAZONES FLOTANTES EN EL FONDO ===
function initFloatingHearts() {
  const container = document.getElementById('hearts-bg');
  if(!container) return;
  const symbols = ['💕','❤️','💗','✨','🌸','💖','🤍','💫'];
  function spawnHeart() {
    const el = document.createElement('div');
    el.className = 'float-heart';
    el.textContent = symbols[Math.floor(Math.random()*symbols.length)];
    el.style.left = Math.random() * 100 + '%';
    el.style.fontSize = (0.8 + Math.random() * 1.2) + 'rem';
    el.style.animationDuration = (8 + Math.random() * 12) + 's';
    el.style.animationDelay = Math.random() * 2 + 's';
    container.appendChild(el);
    setTimeout(() => el.remove(), 22000);
  }
  // Crear algunos al inicio
  for(let i=0; i<8; i++) setTimeout(() => spawnHeart(), i * 600);
  // Seguir creando
  setInterval(spawnHeart, 3000);
}

// === CURSOR TRAIL (Partículas del mouse) ===
function initCursorTrail() {
  let lastX = 0, lastY = 0, throttle = 0;
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if(now - throttle < 80) return; // Limitar cantidad
    throttle = now;
    // Solo crear si el mouse se movió suficiente
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if(Math.abs(dx) + Math.abs(dy) < 15) return;
    lastX = e.clientX; lastY = e.clientY;
    const p = document.createElement('div');
    p.className = 'cursor-particle';
    p.style.left = (e.clientX - 4) + 'px';
    p.style.top = (e.clientY - 4) + 'px';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 800);
  });
}
