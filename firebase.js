// --- MQTT GAME-LINK SYNC (v18 - MODO SIMULTÁNEO) ---
// Este sistema es como un servidor de Minecraft. Transmisión pura y dura.

const BROKER = 'broker.emqx.io';
const PORT = 8084; // WebSocket SSL
const TOPIC = 'jbygn/v18/love_sync_secure';
const CLIENT_ID = 'js_' + Math.random().toString(16).substr(2, 8);

let client = null;
let syncCallback = null;

export function initMQTT() {
    if (client) return;
    client = new Paho.MQTT.Client(BROKER, PORT, CLIENT_ID);
    
    client.onConnectionLost = (resp) => {
        console.warn('Conexión perdida, reconectando...', resp.errorMessage);
        setTimeout(initMQTT, 2000);
    };

    client.onMessageArrived = (msg) => {
        try {
            const data = JSON.parse(msg.payloadString);
            if (syncCallback) syncCallback(data);
        } catch(e) {}
    };

    client.connect({
        onSuccess: () => {
            console.log('⚡ MODO SIMULTÁNEO ACTIVADO (MQTT)');
            client.subscribe(TOPIC);
            if (window.updateSyncIndicator) window.updateSyncIndicator(true);
        },
        useSSL: true,
        onFailure: () => {
            setTimeout(initMQTT, 3000);
        }
    });
}

export async function fbSave(key, value) {
  // 1. Guardar local
  localStorage.setItem('jg_v6_'+key, JSON.stringify(value));
  
  // 2. Transmitir instantáneamente
  if (client && client.isConnected()) {
    const message = new Paho.MQTT.Message(JSON.stringify({ [key]: JSON.stringify(value) }));
    message.destinationName = TOPIC;
    client.send(message);
  }
}

export function attachSync(onDataReceived) {
  syncCallback = onDataReceived;
  initMQTT();
  return () => {};
}

// Mock de imágenes
export async function fbUploadImage(path, dataUrl) { return dataUrl; }
export async function fbDeleteImage(path) {}
