// Piezas compartidas por las secciones del panel
import { db, collection, query, where, onSnapshot } from "../firebase.js";
import { esc, fmtDayNum, fmtTime, toDate, eur, url } from "../ui.js";
import { authError } from "./account.js";

export const byDate = (a, b) => toDate(a.date) - toDate(b.date);
export const isUpcoming = e => toDate(e.date).getTime() >= Date.now() - 8 * 3600e3;

// Escucha en directo los eventos del local/promotora
export function watchOrgEvents(ctx, cb) {
  return onSnapshot(query(collection(db, "events"), where("orgId", "==", ctx.orgId)),
    s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort(byDate)),
    e => { console.error(e); cb([], e); });
}

// Evento elegido (se recuerda al cambiar de sección)
const KEY = "aforo-ev";
export function pickEvent(list) {
  let id = null;
  try { id = sessionStorage.getItem(KEY); } catch (e) { /* nada */ }
  let e = list.find(x => x.id === id);
  if (!e) e = list.find(isUpcoming) || list[list.length - 1] || null;
  if (e) setPicked(e.id);
  return e;
}
export function setPicked(id) { try { sessionStorage.setItem(KEY, id); } catch (e) { /* nada */ } }

// Botones para cambiar de evento: próximos + el elegido
export function evPicks(list, cur, act) {
  const shown = list.filter(e => isUpcoming(e) || e.id === cur);
  const past = list.length - shown.length;
  return '<div class="picks">' + shown.map(e => '<button class="pick" data-act="' + (act || "pickEv") + '" data-id="' + esc(e.id) + '" aria-pressed="' + (cur === e.id) + '">' + esc(e.name) + ' <span class="mono">' + esc(fmtDayNum(e.date)) + '</span></button>').join("") +
    (past ? '<button class="pick" data-act="pastEv">Pasados (' + past + ')</button>' : '') + '</div>';
}
export function pastPicker(list, act) {
  const past = list.filter(e => !isUpcoming(e)).reverse();
  return '<h2 class="h2 sheet-t">Eventos pasados</h2><ul class="gl">' + past.map(e =>
    '<li><div><b>' + esc(e.name) + '</b><span class="small">' + esc(fmtDayNum(e.date)) + ' · ' + (e.soldTotal || 0) + ' entradas</span></div><button class="btn btn-sm" data-act="' + (act || "pickEv") + '" data-id="' + esc(e.id) + '">Ver</button></li>').join("") + '</ul>';
}

export function kpi(l, v, s, pct) {
  return '<div class="kpi"><p class="kpi-l">' + l + '</p><p class="kpi-v">' + v + '</p>' +
    (pct != null ? '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>' : '') +
    '<p class="kpi-s">' + s + '</p></div>';
}

export function feedHtml(list) {
  if (!list.length) return '<p class="small muted">Aún no hay movimiento. Aquí verás cada venta, reserva y cobro al momento.</p>';
  return '<ul class="feed">' + list.map(x => '<li><span class="mono t">' + (x.createdAt ? fmtTime(x.createdAt) : "ahora") + '</span><span>' + esc(x.text) + '</span><span class="mono amt">' + (x.amount ? "+" + eur(x.amount) : "") + '</span></li>').join("") + '</ul>';
}

// Botón que pide confirmación con un segundo toque (los navegadores bloquean confirm() en apps)
export function confirmTap(btn, label, fn) {
  if (btn.dataset.armed === "1") { btn.dataset.armed = ""; fn(); return; }
  const old = btn.textContent;
  btn.dataset.armed = "1"; btn.textContent = label || "¿Seguro? Toca otra vez";
  setTimeout(() => { if (btn.isConnected && btn.dataset.armed === "1") { btn.dataset.armed = ""; btn.textContent = old; } }, 3500);
}

// Vuelve a pintar una sección sin perder lo que el usuario estaba escribiendo
export function keepInputs(el, paint) {
  const vals = {};
  el.querySelectorAll("input[id],select[id],textarea[id]").forEach(i => { vals[i.id] = i.type === "checkbox" ? i.checked : i.value; });
  const a = document.activeElement, fid = a && el.contains(a) && a.id ? a.id : null;
  let s0 = null, s1 = null;
  try { if (fid) { s0 = a.selectionStart; s1 = a.selectionEnd; } } catch (e) { /* nada */ }
  paint();
  Object.keys(vals).forEach(id => {
    const i = document.getElementById(id); if (!i || !el.contains(i)) return;
    if (i.type === "checkbox") i.checked = vals[id];
    else if (i.tagName === "SELECT") { if (Array.from(i.options).some(o => o.value === vals[id])) i.value = vals[id]; }
    else i.value = vals[id];
  });
  if (fid) { const i = document.getElementById(fid); if (i && el.contains(i)) { i.focus(); try { if (s0 != null) i.setSelectionRange(s0, s1); } catch (e) { /* nada */ } } }
}

export const errHtml = e => '<div class="notice"><b>Algo ha fallado.</b><p class="small">' + esc(authError(e)) + '</p></div>';

export const noEventsHtml = (ctx) => '<div class="card empty"><p><b>Aún no tienes eventos.</b></p><p class="small">Crea el primero y ponlo a la venta en un minuto.</p>' +
  (ctx.isAdmin() ? '<a class="btn btn-primary" href="#eventos">Crear evento</a>' : '') + '</div>';

export const siteUrl = path => url(path);
