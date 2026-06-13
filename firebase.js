// --- PEER-TO-PEER DIRECT SYNC (v15 - CONEXIÓN DIRECTA) ---
// Este sistema no usa servidores centrales. Conecta Jhosep y Gabriela punto a punto.

let peer = null;
let conn = null;
const MY_ID = 'jbygn-' + (localStorage.getItem('jg_v6_me') || 'anon') + '-2025';
const OTHER_ID = 'jbygn-' + (localStorage.getItem('jg_v6_me') === 'J' ? 'G' : 'J') + '-2025';

let onDataCallback = null;

export function initP2P(role) {
  const myPeerId = 'jbygn-' + role + '-2025';
  const otherPeerId = 'jbygn-' + (role === 'J' ? 'G' : 'J') + '-2025';
  
  if (peer) return;
  
  peer = new Peer(myPeerId);
  
  peer.on('open', (id) => {
    console.log('Mi ID P2P es:', id);
    if (window.updateSyncIndicator) window.updateSyncIndicator(false);
    
    // Intentar conectar con el otro cada 5 segundos
    setInterval(() => {
      if (!conn || !conn.open) {
        connectToOther(otherPeerId);
      }
    }, 5000);
  });
  
  peer.on('connection', (c) => {
    setupConnection(c);
  });

  peer.on('error', (err) => {
    console.warn('Error P2P:', err.type);
    if (err.type === 'peer-unavailable') {
        // El otro no está conectado aún
    }
  });
}

function connectToOther(id) {
  console.log('Buscando a la otra mitad...', id);
  const c = peer.connect(id, { reliable: true });
  setupConnection(c);
}

function setupConnection(c) {
  if (conn && conn.open) return;
  conn = c;
  
  conn.on('open', () => {
    console.log('¡CONECTADOS DIRECTAMENTE! ⚡');
    if (window.updateSyncIndicator) window.updateSyncIndicator(true);
    toast('⚡ Línea Directa con tu pareja establecida');
    
    // Al conectar, enviamos nuestra versión de los datos local para sincronizar
    syncAllLocal();
  });
  
  conn.on('data', (data) => {
    if (onDataCallback) onDataCallback(data);
  });
  
  conn.on('close', () => {
    if (window.updateSyncIndicator) window.updateSyncIndicator(false);
    conn = null;
  });
}

function syncAllLocal() {
    const keys = ['citas', 'cuaderno', 'posts', 'fechas', 'dreams', 'songs', 'carta', 'places', 'scores', 'moods', 'wp', 'notasList', 'plans'];
    keys.forEach(k => {
        const val = localStorage.getItem('jg_v6_' + k);
        if (val) fbSave(k, JSON.parse(val));
    });
}

export async function fbSave(key, value) {
  // 1. Guardar local (siempre)
  localStorage.setItem('jg_v6_'+key, JSON.stringify(value));
  
  // 2. Enviar por P2P si hay conexión
  if (conn && conn.open) {
    conn.send({ [key]: JSON.stringify(value) });
  }
}

export function attachSync(onDataReceived) {
  onDataCallback = onDataReceived;
  return () => {};
}

// Mock de imágenes (Base64 local)
export async function fbUploadImage(path, dataUrl) {
  return dataUrl;
}
export async function fbDeleteImage(path) {}
