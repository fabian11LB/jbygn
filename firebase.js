// --- REEMPLAZO DE FIREBASE POR GUN.JS (v13 - MOTOR DESCENTRALIZADO) ---
// Este sistema no requiere cuentas ni reglas. Los móviles se conectan directamente.

const ROOM_ID = 'jg_forever_love_2025_safe_v13'; // Llave única para vosotros
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun', 'https://gun-ams1.herokuapp.com/gun']);
const appData = gun.get(ROOM_ID);

// Simular el comportamiento de fbSave
export async function fbSave(key, value) {
  try {
    appData.get(key).put(JSON.stringify(value));
    if (window.updateSyncIndicator) window.updateSyncIndicator(true);
  } catch(e) { 
    console.error('Error guardando en Gun:', e); 
  }
}

// Simular el comportamiento de attachSync
export function attachSync(onDataReceived) {
  // Escuchar todos los campos que nos interesan
  const keys = ['citas', 'cuaderno', 'posts', 'fechas', 'dreams', 'songs', 'carta', 'places', 'scores', 'moods', 'wp', 'notasList', 'plans', 'presence'];
  
  keys.forEach(k => {
    appData.get(k).on((data) => {
      if (data) {
        onDataReceived({ [k]: data });
      }
    });
  });

  if (window.updateSyncIndicator) window.updateSyncIndicator(true);
  return () => {}; // No-op cleanup
}

// Mock de Storage para evitar errores (Gun no guarda imágenes pesadas, se usarán Base64 comprimido)
export async function fbUploadImage(path, dataUrl) {
  // Retornamos el dataUrl directamente, Gun lo manejará como string (comprimido por el app.js)
  return dataUrl;
}

export async function fbDeleteImage(path) {
  // No-op en este sistema descentralizado
}
