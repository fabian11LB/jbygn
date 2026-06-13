// --- SHARED SERVER SYNC (v19 - MODO PERSISTENTE) ---
// Este sistema usa Gun.js para que los datos estén "siempre ahí" (como un server de Minecraft).

const ROOM_ID = 'jbygn_forever_server_v19_final';
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun', 'https://gun-ams1.herokuapp.com/gun']);
const appData = gun.get(ROOM_ID);

export function initSync() {
    console.log('🏰 Servidor Conectado');
}

export async function fbSave(key, value) {
  // 1. Guardar local
  localStorage.setItem('jg_v6_'+key, JSON.stringify(value));
  
  // 2. Transmitir a la nube de Gun
  appData.get(key).put(JSON.stringify(value));
}

export function attachSync(onDataReceived) {
  const keys = ['citas', 'cuaderno', 'posts', 'fechas', 'dreams', 'songs', 'carta', 'places', 'scores', 'moods', 'wp', 'notasList', 'plans', 'presence'];
  
  keys.forEach(k => {
    appData.get(k).on((data) => {
      if (data) {
        onDataReceived({ [k]: data });
      }
    });
  });

  if (window.updateSyncIndicator) window.updateSyncIndicator(true);
  return () => {};
}

// Mock de imágenes
export async function fbUploadImage(path, dataUrl) { return dataUrl; }
export async function fbDeleteImage(path) {}
