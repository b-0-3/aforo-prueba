// ============================================================
//  AFORO · funcionamiento sin conexión
//  Guarda una copia de la web en el móvil para que la puerta (y el resto)
//  se pueda abrir aunque se vaya el wifi.
//  - Archivos de la web: primero se piden a internet (así siempre ves la
//    última versión) y, si no hay conexión, se usa la copia guardada.
//  - Librerías externas (Firebase, lector de QR, fuentes): se usa la copia.
//  Si cambias la lista de archivos, sube VERSION.
// ============================================================
const VERSION = "aforo-v2";
const CORE = [
  "./", "index.html", "eventos.html", "evento.html", "pedido.html", "mesa.html", "legal.html", "404.html",
  "app/", "app/index.html", "app/entrar.html", "app/unirse.html",
  "css/aforo.css", "manifest.webmanifest", "img/icon.svg", "img/icon-180.png", "img/icon-192.png",
  "js/config.js", "js/firebase.js", "js/ui.js", "js/public.js", "js/pagos.js", "js/demo.js",
  "js/app/account.js", "js/app/common.js", "js/app/shell.js",
  "js/app/views/resumen.js", "js/app/views/eventos.js", "js/app/views/entradas.js", "js/app/views/rrpp.js",
  "js/app/views/listas.js", "js/app/views/mesas.js", "js/app/views/puerta.js", "js/app/views/barra.js",
  "js/app/views/mipanel.js", "js/app/views/equipo.js", "js/app/views/ajustes.js"
];
const CDN = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
];
const CDN_HOSTS = ["www.gstatic.com", "cdnjs.cloudflare.com", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(VERSION).then(c => Promise.all(
    CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {}))
      .concat(CDN.map(u => c.add(u).catch(() => {})))
  )).then(() => self.skipWaiting()));
});

self.addEventListener("activate", ev => {
  ev.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("aforo-") && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, ko) => setTimeout(() => ko(new Error("timeout")), ms)); }

async function fromNetworkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req.url, { cache: "no-cache", credentials: "same-origin" }), timeout(5000)]);
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await c.match(req) || await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const p = new URL(req.url).pathname;
      const fallback = await c.match(p.endsWith("/") ? p + "index.html" : p, { ignoreSearch: true }) || await c.match("404.html");
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function fromCacheFirst(req) {
  const c = await caches.open(VERSION);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (u.pathname.startsWith("/.netlify/") || u.pathname.startsWith("/__")) return; // nunca guardar cobros ni datos
    ev.respondWith(fromNetworkFirst(req));
  } else if (CDN_HOSTS.includes(u.hostname)) {
    ev.respondWith(fromCacheFirst(req));
  }
  // El resto (Firebase, Stripe…) va directo a internet
});
