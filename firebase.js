import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

// Tu configuración actual:
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
} catch(e) { console.warn("Firebase Storage issue:", e); }
const REF = doc(db, "pareja", "jg");

export async function fbSave(key, value) {
  try {
    await setDoc(REF, { [key]: JSON.stringify(value) }, { merge: true });
  } catch(e) { 
    console.error('Error guardando en Firebase:', e); 
    if (window.uiError) {
      window.uiError('Error Firestore: No se pudo guardar. Si dice "Limit Exceeded" tu base de datos superó el 1MB. Borra fotos antiguas o libérala.');
    } else {
      alert('Error Firestore: No se pudo guardar. Limite de 1MB superado u otro error de red.');
    }
  }
}

export function attachSync(onDataReceived, onError) {
  return onSnapshot(REF, (snap) => {
    if (snap.exists()) {
      onDataReceived(snap.data());
    }
  }, (error) => {
    console.error("Firebase Sync error:", error);
    if (onError) onError(error);
  });
}

// Subir imagen a Firebase Storage y devolver la URL
export async function fbUploadImage(path, dataUrl) {
  try {
    const r = ref(storage, path);
    await uploadString(r, dataUrl, 'data_url');
    // Forzar tiempo de espera para que se actualice
    const url = await getDownloadURL(r);
    return url;
  } catch (e) {
    console.error('Error subiendo imagen a Storage:', e);
    throw e;
  }
}

// Eliminar imagen de Firebase Storage
export async function fbDeleteImage(path) {
  try {
    const r = ref(storage, path);
    await deleteObject(r);
  } catch (e) {
    console.warn('Error eliminando imagen de Storage:', e);
  }
}
