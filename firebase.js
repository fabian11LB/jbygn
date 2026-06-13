import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA0jCUtEa_BBHQUoogvyHfMNDUZJzIj5RY",
  authDomain: "jhosep-gabriela.firebaseapp.com",
  projectId: "jhosep-gabriela",
  storageBucket: "jhosep-gabriela.firebasestorage.app",
  messagingSenderId: "185608457820",
  appId: "1:185608457820:web:76cb9780e049ce8a39a099"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let storage = null;
try {
    storage = getStorage(app);
} catch(e) { console.warn("Firebase Storage init issue:", e); }
const REF = doc(db, "pareja", "jg");

// --- SYNC STATUS ---
let syncOk = false;
let syncRetryCount = 0;
const MAX_RETRY = 10;

function updateSyncIndicator(ok, msg) {
  syncOk = ok;
  const el = document.getElementById('syncStatus');
  if (!el) return;
  if (ok) {
    el.className = 'sync-indicator sync-ok';
    el.innerHTML = '🟢 Sincronizado';
    el.title = 'Firebase conectado — ambos ven los cambios en tiempo real';
  } else {
    el.className = 'sync-indicator sync-error';
    el.innerHTML = '🔴 Sin Sync';
    el.title = msg || 'Error de conexión con Firebase';
  }
}

// --- SAVE ---
export async function fbSave(key, value) {
  try {
    await setDoc(REF, { [key]: JSON.stringify(value) }, { merge: true });
    updateSyncIndicator(true);
    syncRetryCount = 0;
  } catch(e) { 
    console.error('Firebase fbSave error:', e);
    updateSyncIndicator(false, 'No se pudo guardar: ' + (e.code || e.message));
  }
}

// --- REALTIME SYNC WITH AUTO-RETRY ---
let unsubscribe = null;

export function attachSync(onDataReceived, onError) {
  function startListener() {
    // Clean previous listener
    if (unsubscribe) {
      try { unsubscribe(); } catch(e) {}
      unsubscribe = null;
    }

    unsubscribe = onSnapshot(REF, (snap) => {
      syncRetryCount = 0;
      updateSyncIndicator(true);
      if (snap.exists()) {
        onDataReceived(snap.data());
      }
    }, (error) => {
      console.error("Firebase Sync error:", error.code, error.message);
      updateSyncIndicator(false, error.message);
      
      // MOSTRAR ERROR VISUAL EN LA APP
      if (window.showSyncError) {
        window.showSyncError(error.code === 'permission-denied' ? 'Falta de permisos en Firebase Console' : error.message);
      }
      
      if (onError) onError(error);

      // Auto-retry with exponential backoff
      if (syncRetryCount < MAX_RETRY) {
        syncRetryCount++;
        const delay = Math.min(2000 * Math.pow(1.5, syncRetryCount), 30000);
        console.log(`Reintentando sync en ${Math.round(delay/1000)}s (intento ${syncRetryCount}/${MAX_RETRY})...`);
        setTimeout(startListener, delay);
      } else {
        console.warn('Se agotaron los reintentos de sync. Recarga la página manualmente.');
        const el = document.getElementById('syncStatus');
        if (el) {
          el.innerHTML = '🔴 Desconectado — <button onclick="location.reload()" style="background:none;border:none;color:var(--rose3);text-decoration:underline;cursor:pointer;font-size:inherit;">Recargar</button>';
        }
      }
    });
  }

  startListener();
  return () => { if (unsubscribe) unsubscribe(); };
}

// --- UPLOAD IMAGE ---
export async function fbUploadImage(path, dataUrl) {
  try {
    if (!storage) throw new Error('Storage no disponible');
    const r = ref(storage, path);
    await uploadString(r, dataUrl, 'data_url');
    const url = await getDownloadURL(r);
    return url;
  } catch (e) {
    console.error('Error subiendo imagen a Storage:', e);
    throw e;
  }
}

// --- DELETE IMAGE ---
export async function fbDeleteImage(path) {
  try {
    if (!storage) return;
    const r = ref(storage, path);
    await deleteObject(r);
  } catch (e) {
    console.warn('Error eliminando imagen de Storage:', e);
  }
}
