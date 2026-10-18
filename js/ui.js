// Utilidades de interfaz compartidas por todas las páginas.

// Carpeta donde está la web (funciona en la raíz o en una subcarpeta como GitHub Pages)
export const ROOT = new URL("../", import.meta.url).href;
export const url = p => new URL(String(p).replace(/^\//, ""), ROOT).href;

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const eur = n => {
  n = Number(n) || 0;
  const d = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: d ? 2 : 0 }).format(n);
};
export const num = n => new Intl.NumberFormat("es-ES").format(Number(n) || 0);
export const ucf = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
export const toDate = v => (v && typeof v.toDate === "function") ? v.toDate() : (v instanceof Date ? v : new Date(v || Date.now()));
const TZ = "Europe/Madrid";
export const fmtDay = d => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(toDate(d));
export const fmtDayNum = d => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: TZ }).format(toDate(d));
export const fmtLong = d => new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(toDate(d));
export const fmtTime = d => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(toDate(d));
export const dayKey = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(toDate(d));
export const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const slugify = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function rid(n = 20) {
  const a = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(n); crypto.getRandomValues(buf);
  return Array.from(buf, x => a[x % a.length]).join("");
}
export function ago(d) {
  const m = Math.round((Date.now() - toDate(d)) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return "hace " + m + " min";
  const h = Math.round(m / 60);
  return h < 24 ? "hace " + h + " h" : "hace " + Math.round(h / 24) + " d";
}
export const HUES = [346, 22, 205, 160, 278, 48, 190, 104];

export const BRAND_SVG = '<svg viewBox="0 0 34 22" aria-hidden="true"><rect x="2.2" y="4" width="2.6" height="15" rx="1.3" fill="var(--brass)"/><rect x="29.2" y="4" width="2.6" height="15" rx="1.3" fill="var(--brass)"/><circle cx="3.5" cy="3.6" r="2.6" fill="var(--brass)"/><circle cx="30.5" cy="3.6" r="2.6" fill="var(--brass)"/><rect x="0" y="18.6" width="7" height="2.6" rx="1.2" fill="var(--brass)"/><rect x="27" y="18.6" width="7" height="2.6" rx="1.2" fill="var(--brass)"/><path d="M4.8 6.4 Q17 19 29.2 6.4" fill="none" stroke="var(--rope)" stroke-width="2.6" stroke-linecap="round"/></svg>';

/* ---------- avisos flotantes ---------- */
let toastEl = null, toastTimer = null;
export function toast(msg) {
  if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
}

/* ---------- hoja (ventana modal) ---------- */
let sheetEl = null, onClose = null;
function ensureSheet() {
  if (sheetEl) return;
  sheetEl = document.createElement("div");
  sheetEl.className = "sheet"; sheetEl.hidden = true;
  sheetEl.innerHTML = '<button class="scrim" data-sheet-close aria-label="Cerrar" tabindex="-1"></button><div class="sheet-card" role="dialog" aria-modal="true"><button class="x sheet-x" data-sheet-close aria-label="Cerrar">×</button><div class="sheet-body"></div></div>';
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener("click", e => { if (e.target.closest("[data-sheet-close]")) closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheetEl.hidden) closeSheet(); });
}
export function openSheet(html, closeCb) {
  ensureSheet(); onClose = closeCb || null;
  sheetEl.querySelector(".sheet-body").innerHTML = html;
  sheetEl.hidden = false; document.body.style.overflow = "hidden";
  return sheetEl.querySelector(".sheet-body");
}
export function setSheet(html) { ensureSheet(); sheetEl.querySelector(".sheet-body").innerHTML = html; return sheetEl.querySelector(".sheet-body"); }
export function sheetBody() { ensureSheet(); return sheetEl.querySelector(".sheet-body"); }
export function sheetOpen() { return !!sheetEl && !sheetEl.hidden; }
export function closeSheet() {
  if (!sheetEl) return;
  sheetEl.hidden = true; document.body.style.overflow = "";
  const cb = onClose; onClose = null; if (cb) cb();
}
export const paying = t => '<div class="paying"><div class="spin" aria-hidden="true"></div><p class="small">' + esc(t) + '</p></div>';

/* ---------- clics con data-act ---------- */
// Une un mapa de acciones a un contenedor: <button data-act="nombre" data-id="...">
export function delegate(root, actions) {
  const h = e => {
    const b = e.target.closest("[data-act]");
    if (!b || !root.contains(b) || b.disabled) return;
    const fn = actions[b.dataset.act];
    if (fn) { e.preventDefault(); fn(b.dataset, b, e); }
  };
  root.addEventListener("click", h);
  return () => root.removeEventListener("click", h);
}

/* ---------- piezas ---------- */
export function flyer(e, size) {
  const h = Number(e.hue) || 346;
  if (size === "mini") return '<div class="flyer flyer-mini" style="--h:' + h + '" aria-hidden="true"></div>';
  const line = (e.lineup || []).slice(0, 2).join(" · ");
  return '<div class="flyer flyer-' + size + '" style="--h:' + h + '"><div class="fl-top"><span>' + esc(fmtDay(e.date)) + '</span><span>' + esc(e.venueName || "") + '</span></div><div class="fl-name">' + esc(e.name) + '</div><div class="fl-bot"><span>' + esc(line) + '</span></div></div>';
}
export function stepper(act, id, v, max) {
  return '<div class="step"><button type="button" data-act="' + act + '" data-id="' + esc(id) + '" data-d="-1" ' + (v <= 0 ? "disabled" : "") + ' aria-label="Quitar uno">−</button><span class="mono">' + v + '</span><button type="button" data-act="' + act + '" data-id="' + esc(id) + '" data-d="1" ' + (v >= max ? "disabled" : "") + ' aria-label="Añadir uno">+</button></div>';
}
export const soldOf = e => (e.tiers || []).reduce((a, t) => a + (t.sold || 0), 0);
export const qtyOf = e => (e.tiers || []).reduce((a, t) => a + (t.qty || 0), 0);
export function fromPrice(e) {
  const av = (e.tiers || []).filter(t => (t.sold || 0) < t.qty && !t.hidden);
  return av.length ? Math.min.apply(null, av.map(t => t.price)) : null;
}
export function evStatus(e) {
  if (!e.published) return ["Borrador", ""];
  const s = soldOf(e), q = qtyOf(e);
  if (toDate(e.date) < new Date(Date.now() - 8 * 3600e3)) return ["Terminado", ""];
  if (q && s >= q) return ["Agotado", "bad"];
  if (q && s / q >= .8) return ["Últimas entradas", "warn"];
  return ["A la venta", "ok"];
}

// Plano de sala. layout = {zones:[], tables:[]}
export function mapHtml(layout, opts = {}) {
  const taken = new Set(opts.taken || []), arrived = new Set(opts.arrived || []);
  const zones = layout.zones || [], tables = layout.tables || [];
  return '<div class="map' + (opts.editing ? " editing" : "") + '" role="group" aria-label="Plano de la sala">' +
    zones.map(z => '<div class="zone' + (z.floor ? " floor" : "") + (z.v ? " v" : "") + '" style="left:' + z.x + '%;top:' + z.y + '%;width:' + z.w + '%;height:' + z.h + '%"><span>' + esc(z.label) + '</span></div>').join("") +
    tables.map(t => {
      const isTaken = taken.has(t.id);
      const cls = opts.editing ? "" : (isTaken ? (arrived.has(t.id) ? "in" : "res") : (opts.sel === t.id ? "sel" : ""));
      const dis = !opts.editing && isTaken && !opts.allowTaken;
      return '<button type="button" class="tbl ' + cls + '" style="left:' + t.x + '%;top:' + t.y + '%;width:' + t.w + '%;height:' + t.h + '%" data-act="' + (opts.act || "") + '" data-id="' + esc(t.id) + '" ' + (dis ? "disabled" : "") + ' aria-label="Mesa ' + esc(t.id) + ', ' + (isTaken ? "reservada" : "libre") + ', hasta ' + t.pax + ' personas"><span>' + esc(t.id) + '</span><small>' + t.pax + 'p</small></button>';
    }).join("") + '</div>';
}
export const legend = () => '<div class="legend"><span><i class="lg-free"></i>Libre</span><span><i class="lg-res"></i>Reservada</span><span><i class="lg-in"></i>Ya ha llegado</span></div>';

/* ---------- gráfico de ventas por día ---------- */
function niceMax(m) { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, m)))); for (const k of [1, 2, 4, 6, 8, 10]) { if (k * p >= m) return k * p; } return 10 * p; }
function barPath(x, y0, w, h, r) { if (h <= 0) return ""; r = Math.min(r, w / 2, h); const yb = y0 + h; return "M" + x + "," + yb + "V" + (y0 + r) + "Q" + x + "," + y0 + " " + (x + r) + "," + y0 + "H" + (x + w - r) + "Q" + (x + w) + "," + y0 + " " + (x + w) + "," + (y0 + r) + "V" + yb + "Z"; }
export function lastDays(daily, n = 14) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); out.push({ d, v: (daily && daily[dayKey(d)]) || 0 }); }
  return out;
}
export function drawDailyChart(el, daily) {
  const days = lastDays(daily, 14), vals = days.map(x => x.v);
  const W = Math.max(260, Math.round(el.clientWidth || 600)), H = 200, pl = 32, pr = 6, pt = 20, pb = 24, n = vals.length;
  const max = niceMax(Math.max(4, Math.max.apply(null, vals)));
  const cw = (W - pl - pr) / n, gap = Math.max(2, cw * .28), bw = cw - gap;
  const y = v => pt + (H - pt - pb) * (1 - v / max);
  const fmtD = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  const peak = vals.indexOf(Math.max.apply(null, vals));
  let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Entradas vendidas por día en los últimos 14 días">';
  [0, max / 2, max].forEach(t => { s += '<line class="ch-grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text class="ch-ax" x="' + (pl - 6) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end">' + num(t) + "</text>"; });
  vals.forEach((v, i) => {
    const x = pl + i * cw + gap / 2, top = y(v), h = H - pb - top, isNow = i === n - 1, d = days[i].d;
    s += '<path class="ch-bar' + (isNow ? " now" : "") + '" data-i="' + i + '" d="' + barPath(x, top, bw, h, 4) + '"/>';
    if ((n - 1 - i) % 2 === 0) s += '<text class="ch-ax" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + (isNow ? "hoy" : Number(dayKey(d).slice(8))) + "</text>";
    if ((isNow || i === peak) && v > 0) s += '<text class="ch-val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (top - 6).toFixed(1) + '" text-anchor="middle">' + v + "</text>";
    s += '<rect class="hit" x="' + (pl + i * cw).toFixed(1) + '" y="' + pt + '" width="' + cw.toFixed(1) + '" height="' + (H - pt - pb + 4) + '" data-i="' + i + '" data-x="' + (x + bw / 2).toFixed(1) + '" data-y="' + top.toFixed(1) + '" data-tip="' + esc(ucf(fmtD.format(d)) + " · " + v + " entrada" + (v === 1 ? "" : "s") + (isNow ? " (en curso)" : "")) + '"/>';
  });
  el.innerHTML = s + '</svg><div class="tip" hidden></div>';
  const tip = el.querySelector(".tip");
  const show = evt => {
    const h = evt.target.closest && evt.target.closest(".hit");
    el.querySelectorAll(".ch-bar.hot").forEach(b => b.classList.remove("hot"));
    if (!h) { tip.hidden = true; return; }
    const b = el.querySelector('.ch-bar[data-i="' + h.dataset.i + '"]'); if (b) b.classList.add("hot");
    tip.textContent = h.dataset.tip; tip.hidden = false;
    const x = +h.dataset.x, w = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(el.clientWidth - w, x - w / 2)) + "px";
    tip.style.top = Math.max(0, +h.dataset.y - 38) + "px";
  };
  el.onpointermove = show; el.onpointerdown = show;
  el.onpointerleave = () => { tip.hidden = true; el.querySelectorAll(".ch-bar.hot").forEach(b => b.classList.remove("hot")); };
}

/* ---------- QR ---------- */
// Necesita <script src=".../qrcode.min.js"> en la página
export function drawQR(root = document, size = 120) {
  root.querySelectorAll("[data-qr]").forEach(el => {
    if (el.dataset.done) return; el.dataset.done = "1";
    if (typeof window.QRCode === "undefined") { el.innerHTML = '<span class="mono" style="color:#111;font-size:12px;text-align:center">' + esc(el.dataset.qr) + "</span>"; return; }
    try { new window.QRCode(el, { text: el.dataset.qr, width: size, height: size, colorDark: "#111111", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M }); } catch (e) { /* nada */ }
  });
}

/* ---------- copiar y sonido ---------- */
export function copyText(text, okMsg) {
  const fail = () => toast("No se pudo copiar. Mantén pulsado el texto para copiarlo.");
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg || "Copiado"), fail); } catch (e) { fail(); }
}
export async function shareOrCopy(title, url) {
  if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  copyText(url, "Enlace copiado");
}
let actx = null;
export function beep(ok) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const tones = ok ? [[880, 0], [1320, .09]] : [[190, 0]];
    tones.forEach(([f, dl]) => {
      const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + dl, len = ok ? .12 : .38;
      o.type = ok ? "sine" : "square"; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(ok ? .2 : .09, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + len);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + len + .02);
    });
  } catch (e) { /* sin sonido */ }
}

/* ---------- datos por defecto al crear una cuenta ---------- */
export const DEFAULT_LAYOUTS = {
  local: {
    zones: [{ label: "Cabina DJ", x: 40, y: 3, w: 20, h: 9 }, { label: "Pista", x: 24, y: 17, w: 52, h: 47, floor: true }, { label: "Barra 1", x: 2, y: 17, w: 8, h: 47, v: true }, { label: "Barra 2", x: 90, y: 17, w: 8, h: 47, v: true }, { label: "Entrada", x: 40, y: 89, w: 20, h: 8 }],
    tables: [{ id: "R1", x: 13, y: 3, w: 13, h: 10, pax: 10, min: 600 }, { id: "R2", x: 74, y: 3, w: 13, h: 10, pax: 10, min: 600 }, { id: "V1", x: 13, y: 19, w: 9, h: 11, pax: 6, min: 300 }, { id: "V2", x: 13, y: 34, w: 9, h: 11, pax: 6, min: 300 }, { id: "V3", x: 13, y: 49, w: 9, h: 11, pax: 6, min: 300 }, { id: "V4", x: 78, y: 19, w: 9, h: 11, pax: 6, min: 300 }, { id: "V5", x: 78, y: 34, w: 9, h: 11, pax: 6, min: 300 }, { id: "V6", x: 78, y: 49, w: 9, h: 11, pax: 6, min: 300 }, { id: "V7", x: 28, y: 70, w: 12, h: 11, pax: 6, min: 300 }, { id: "V8", x: 60, y: 70, w: 12, h: 11, pax: 6, min: 300 }]
  },
  promotora: {
    zones: [{ label: "Escenario", x: 28, y: 3, w: 44, h: 10 }, { label: "Pista", x: 20, y: 17, w: 60, h: 58, floor: true }, { label: "Barra", x: 30, y: 82, w: 40, h: 9 }, { label: "Entrada", x: 2, y: 84, w: 15, h: 10 }],
    tables: [{ id: "P1", x: 5, y: 18, w: 11, h: 13, pax: 8, min: 400 }, { id: "P2", x: 5, y: 36, w: 11, h: 13, pax: 8, min: 400 }, { id: "P3", x: 5, y: 54, w: 11, h: 13, pax: 8, min: 400 }, { id: "P4", x: 84, y: 18, w: 11, h: 13, pax: 8, min: 400 }, { id: "P5", x: 84, y: 36, w: 11, h: 13, pax: 8, min: 400 }, { id: "P6", x: 84, y: 54, w: 11, h: 13, pax: 8, min: 400 }]
  }
};
export const PRODUCT_CATS = ["Copas", "Cervezas", "Botellas", "Otros"];
export const DEFAULT_PRODUCTS = [
  { id: "copa", name: "Copa", price: 10, cat: "Copas" }, { id: "copap", name: "Copa premium", price: 13, cat: "Copas" },
  { id: "cerveza", name: "Cerveza", price: 5, cat: "Cervezas" }, { id: "tercio", name: "Tercio", price: 6, cat: "Cervezas" },
  { id: "moet", name: "Moët Brut", price: 160, cat: "Botellas" }, { id: "vodka", name: "Botella de vodka + 6 refrescos", price: 120, cat: "Botellas" },
  { id: "chupito", name: "Chupito", price: 4, cat: "Otros" }, { id: "refresco", name: "Refresco", price: 4, cat: "Otros" }, { id: "agua", name: "Agua", price: 3, cat: "Otros" }
];
