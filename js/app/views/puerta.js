// Puerta: escanear entradas con la cámara, lista de invitados y llegada de mesas.
import { db, collection, doc, query, where, onSnapshot, runTransaction, writeBatch, updateDoc, serverTimestamp, increment } from "../../firebase.js";
import { $, esc, num, fmtTime, fmtDay, delegate, openSheet, closeSheet, sheetBody, toast, beep, norm, drawQR, url } from "../../ui.js";
import { watchOrgEvents, pickEvent, setPicked, evPicks, pastPicker, errHtml, noEventsHtml, keepInputs } from "../common.js";

const LIB = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
function loadLib() {
  return new Promise((ok, ko) => {
    if (window.Html5Qrcode) return ok();
    const s = document.createElement("script"); s.src = LIB; s.onload = () => ok(); s.onerror = () => ko(new Error("No se pudo cargar el lector de QR. Revisa la conexión."));
    document.head.appendChild(s);
  });
}

export default function (ctx, el) {
  let events = null, e = null, loadErr = null, tab = "escanear", guests = [], res = [], team = [], filter = "";
  let shownId = null, scanner = null, camOn = false, busy = false, last = { code: "", at: 0 }, log = [], wake = null, vTimer = null;
  // Entradas del evento guardadas en el móvil: así la puerta sigue funcionando si se cae el wifi
  let tickets = new Map(), ticketsReady = false;
  const pendingUsed = new Set();
  const isOnline = () => navigator.onLine !== false;
  const est = d => d.data({ serverTimestamps: "estimate" });
  const offs = []; let evOffs = [];
  const verdict = $("#verdict");

  offs.push(watchOrgEvents(ctx, (list, er) => { events = list; loadErr = er || null; const prev = e && e.id; e = pickEvent(list); if ((e && e.id) !== prev) sub(); render(); }));
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "rrpp"), s => { team = s.docs.map(d => Object.assign({ id: d.id }, d.data())); }, () => {}));

  function sub() {
    evOffs.forEach(f => f()); evOffs = []; guests = []; res = []; log = []; tickets = new Map(); ticketsReady = false;
    if (!e) return;
    evOffs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "tickets"), where("eventId", "==", e.id)), s => {
      tickets = new Map(s.docs.map(d => [d.id, est(d)])); ticketsReady = true; offlineUi();
    }, () => {}));
    evOffs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "guests"), where("eventId", "==", e.id)), s => {
      guests = s.docs.map(d => Object.assign({ id: d.id }, est(d))).sort((a, b) => a.name.localeCompare(b.name, "es"));
      if (tab === "lista") renderPart(); else updateCounter();
    }, () => {}));
    evOffs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "reservations"), where("eventId", "==", e.id)), s => {
      res = s.docs.map(d => Object.assign({ id: d.id }, est(d))).sort((a, b) => a.tableId.localeCompare(b.tableId, "es", { numeric: true }));
      if (tab === "mesas") renderPart();
    }, () => {}));
  }

  function counterHtml() {
    const inside = e.inside || 0, cap = e.capacity || 0;
    return '<div class="counter-row"><div><span class="kpi-l">Dentro ahora</span><b class="counter-v">' + num(inside) + '<span> / ' + num(cap) + '</span></b></div>' +
      '<span class="small">' + num(e.soldTotal || 0) + ' entradas vendidas · ' + guests.length + ' en lista</span></div><div class="bar"><i style="width:' + (cap ? Math.min(100, inside / cap * 100) : 0) + '%"></i></div>';
  }
  function updateCounter() { const c = el.querySelector("#counter"); if (c) c.innerHTML = counterHtml(); }

  function render(force) {
    if (events === null) return;
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    if (!e) { stopCam(); shownId = null; el.innerHTML = '<section class="page narrow"><h1 class="h1">Puerta</h1>' + noEventsHtml(ctx) + '</section>'; return; }
    // Si ya se ve este evento, solo se actualiza el contador: no se corta la cámara ni se borra lo escrito
    if (!force && shownId === e.id && el.querySelector("#part")) { updateCounter(); return; }
    shownId = e.id;
    keepInputs(el, () => paintAll());
  }
  function paintAll() {
    el.innerHTML = '<section class="page narrow"><div class="page-head"><p class="eyebrow">Puerta · ' + esc(e.venueName || "") + ' · ' + esc(fmtDay(e.date)) + '</p><h1 class="h1">' + esc(e.name) + '</h1></div>' + evPicks(events, e.id) +
      '<div class="counter" id="counter">' + counterHtml() + '</div>' +
      '<div class="picks" role="tablist"><button class="pick" data-act="tab" data-id="escanear" aria-pressed="' + (tab === "escanear") + '">Escanear</button><button class="pick" data-act="tab" data-id="lista" aria-pressed="' + (tab === "lista") + '">Lista de invitados</button><button class="pick" data-act="tab" data-id="mesas" aria-pressed="' + (tab === "mesas") + '">Mesas VIP</button></div>' +
      '<div class="notice" id="offBar" hidden></div>' +
      '<div id="part"></div></section>';
    renderPart(); offlineUi();
  }
  function offlineUi() {
    const bar = el.querySelector("#offBar"), n = tickets.size;
    if (bar) {
      bar.hidden = isOnline();
      bar.innerHTML = '<b>Sin conexión.</b><p class="small">Puedes seguir escaneando: se comprueba con las ' + num(n) + ' entradas guardadas en este móvil y todo se sincroniza solo cuando vuelva el wifi.</p>';
    }
    const h = el.querySelector("#offReady");
    if (h) h.textContent = ticketsReady ? "✓ " + num(n) + " entradas guardadas en este móvil por si se va el wifi." : "Guardando las entradas en este móvil…";
  }
  const onNet = () => { offlineUi(); if (isOnline()) toast("Conexión recuperada. Sincronizando…"); };
  window.addEventListener("online", onNet); window.addEventListener("offline", onNet);

  function renderPart() {
    const box = el.querySelector("#part"); if (!box) return;
    if (tab === "lista" || tab === "mesas") { keepInputs(box, () => paintPart(box)); return; }
    paintPart(box);
  }
  function paintPart(box) {
    if (tab === "escanear") {
      box.innerHTML = '<div class="page" style="gap:12px"><div class="reader-box"><div id="reader"></div><p id="camMsg"' + (camOn ? ' hidden' : '') + '>Toca “Abrir cámara” y apunta al QR de la entrada</p></div>' +
        '<div class="row"><button class="btn ' + (camOn ? '' : 'btn-primary') + '" data-act="cam">' + (camOn ? 'Parar cámara' : 'Abrir cámara') + '</button><span class="small">Funciona con la cámara de cualquier móvil.</span></div>' +
        '<p class="hint" id="offReady"></p>' +
        '<form class="scan-in" id="manual" novalidate><label for="code" class="sr">Código de la entrada</label><input id="code" placeholder="O escribe el código: ' + esc(e.prefix || "ABC") + '-XXXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn" type="submit">Validar</button></form>' +
        (ctx.org.demo ? '<div class="card demo-qr"><div class="qr" data-qr="' + esc(url("evento.html?id=" + encodeURIComponent(e.id))) + '" role="img" aria-label="QR para comprar una entrada de prueba"></div>' +
          '<div><p class="eyebrow eyebrow-brass">Demo</p><b>¿No tienes entrada?</b><p class="small">Escanea este QR con el móvil, compra una entrada de prueba (no se cobra nada) y luego enséñale el QR de la entrada a esta cámara. También puedes escribir su código arriba.</p></div></div>' : '') +
        '<div class="card" id="scanLog"><div class="card-h"><h2 class="h2">Últimos escaneos</h2><span class="small">en este móvil</span></div>' + (log.length ? '<ul class="slog">' + log.slice(0, 12).map(l =>
          '<li><span class="mono small">' + fmtTime(l.at) + '</span><div><b>' + esc(l.who || "—") + '</b><span class="mono small">' + esc(l.code) + '</span></div><span class="chip chip-' + (l.ok ? 'ok' : 'bad') + '">' + (l.ok ? '✓ ' : '✕ ') + esc(l.title) + '</span></li>').join("") + '</ul>'
          : '<p class="small muted">Aún no has escaneado nada.</p>') + '</div></div>';
      drawQR(box, 120); offlineUi();
    } else if (tab === "lista") {
      const f = norm(filter), list = guests.filter(g => !f || norm(g.name).includes(f));
      box.innerHTML = '<div class="page" style="gap:12px"><div class="field"><label for="pSearch">Busca por nombre (' + guests.length + ' en la lista, ' + guests.filter(g => g.inAt).length + ' dentro)</label><input id="pSearch" type="search" placeholder="Escribe un nombre" value="' + esc(filter) + '" autocomplete="off"></div>' +
        '<div class="card" id="pList">' + listHtml(list, f) + '</div></div>';
    } else {
      box.innerHTML = '<div class="card"><div class="card-h"><h2 class="h2">Mesas reservadas</h2><span class="small">' + res.filter(r => r.arrivedAt).length + ' de ' + res.length + ' han llegado</span></div>' +
        (res.length ? '<ul class="rl">' + res.map(r => '<li><span class="tag-t">' + esc(r.tableId) + '</span><div><b>' + esc(r.name) + '</b><span class="small">' + r.people + ' personas</span></div>' +
          (r.arrivedAt ? '<span class="chip chip-ok">Llegó ' + fmtTime(r.arrivedAt) + '</span>' : '<button class="btn btn-sm btn-primary" data-act="arrive" data-id="' + r.id + '">Ha llegado</button>') + '</li>').join("") + '</ul>'
          : '<p class="small muted">No hay mesas reservadas para este evento.</p>') + '</div>';
    }
  }
  function listHtml(list, f) {
    if (!guests.length) return '<p class="small muted">La lista está vacía.</p>';
    if (!list.length) return '<p class="small muted">No hay nadie con ese nombre en la lista.</p>';
    const who = g => g.rrppId ? ((team.find(r => r.id === g.rrppId) || {}).name || "RRPP") : "Organización";
    return '<ul class="gl">' + list.slice(0, 80).map(g => '<li><div><b>' + esc(g.name) + '</b><span class="small">' + esc(g.type) + ' · ' + esc(who(g)) + '</span></div>' +
      (g.inAt ? '<span class="chip chip-ok">Dentro ' + fmtTime(g.inAt) + '</span>' : '<button class="btn btn-sm btn-primary" data-act="letIn" data-id="' + g.id + '">Dejar pasar</button>') + '</li>').join("") + '</ul>';
  }

  /* ---------- cámara ---------- */
  async function startCam() {
    const msg = el.querySelector("#camMsg");
    try {
      await loadLib();
      scanner = new window.Html5Qrcode("reader", { verbose: false });
      await scanner.start({ facingMode: "environment" },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * .7); return { width: s, height: s }; } },
        text => onCode(text), () => {});
      camOn = true; camUi();
      try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (x) { /* nada */ }
    } catch (x) {
      console.error(x); camOn = false; scanner = null; camUi();
      const t = String(x && (x.name || x.message || x));
      const m = /NotAllowed|Permission/i.test(t) ? "Has bloqueado la cámara. Permite el acceso en los ajustes del navegador y vuelve a intentarlo." : /NotFound|Requested device/i.test(t) ? "Este dispositivo no tiene cámara. Escribe el código a mano." : (x.message || "No se pudo abrir la cámara.");
      if (msg) { msg.hidden = false; msg.textContent = m; } else toast(m);
    }
  }
  // Cambia el botón y el mensaje sin tocar el vídeo
  function camUi() {
    const b = el.querySelector('[data-act="cam"]'), msg = el.querySelector("#camMsg");
    if (b) { b.disabled = false; b.textContent = camOn ? "Parar cámara" : "Abrir cámara"; b.classList.toggle("btn-primary", !camOn); }
    if (msg) { msg.hidden = camOn; if (!camOn) msg.textContent = "Toca “Abrir cámara” y apunta al QR de la entrada"; }
  }
  async function stopCam() {
    camOn = false;
    if (scanner) { try { await scanner.stop(); } catch (x) { /* ya parada */ } try { scanner.clear(); } catch (x) { /* nada */ } scanner = null; }
    if (wake) { try { await wake.release(); } catch (x) { /* nada */ } wake = null; }
  }
  function onCode(text) {
    const code = String(text || "").trim().toUpperCase();
    if (busy || !verdict.hidden) return;
    if (code === last.code && Date.now() - last.at < 3500) return;
    last = { code, at: Date.now() };
    validate(code);
  }

  /* ---------- validar ---------- */
  async function validate(raw) {
    const code = String(raw).trim().toUpperCase().replace(/^AFORO[:|]/, "").replace(/\s+/g, "");
    if (!code) return;
    if (!/^[A-Z0-9]{1,6}-[A-Z0-9]{4,8}$/.test(code)) { show({ ok: false, title: "No válida", msg: "Este QR no es una entrada de " + ctx.org.name + "." }, code); return; }
    busy = true;
    if (!isOnline()) { try { validateLocal(code); } finally { busy = false; } return; }
    try {
      const r = await withTimeout(runTransaction(db, async tx => {
        const tref = doc(db, "orgs", ctx.orgId, "tickets", code), ts = await tx.get(tref);
        if (!ts.exists()) return { state: "invalid" };
        const t = ts.data();
        if (t.eventId !== e.id) return { state: "other", t };
        if (t.voided) return { state: "voided", t };
        if (t.usedAt) return { state: "used", t };
        tx.update(tref, { usedAt: serverTimestamp(), usedBy: ctx.uid });
        tx.update(doc(db, "events", e.id), { inside: increment(1) });
        return { state: "ok", t };
      }), 7000);
      const t = r.t || {}, rp = t.rrppId ? team.find(x => x.id === t.rrppId) : null;
      if (r.state === "ok") show({ ok: true, title: "Adelante", who: t.buyerName, msg: (t.tierName || "Entrada") + (rp ? " · vía " + rp.name : "") }, code);
      else if (r.state === "voided") show({ ok: false, title: "Anulada", who: t.buyerName, msg: "Esta entrada se anuló desde el panel. No puede entrar con ella." }, code);
      else if (r.state === "used") show({ ok: false, title: "Ya está dentro", who: t.buyerName, msg: "Esta entrada se escaneó a las " + fmtTime(t.usedAt) + ". Puede ser una captura copiada." }, code);
      else if (r.state === "other") { const o = events.find(x => x.id === t.eventId); show({ ok: false, title: "Otro evento", who: t.buyerName, msg: "Esta entrada es para " + (o ? o.name + ", " + fmtDay(o.date) : "otro evento") + "." }, code); }
      else show({ ok: false, title: "No válida", msg: "Este código no existe. Puede ser una entrada falsa o estar mal escrita." }, code);
    } catch (x) {
      console.warn("Puerta: sin respuesta del servidor, uso la lista guardada", x);
      if (ticketsReady) validateLocal(code);
      else show({ ok: false, title: "Sin conexión", msg: "Aún no se habían guardado las entradas en este móvil. Busca conexión y vuelve a escanear." }, code);
    } finally { busy = false; }
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(Object.assign(new Error("timeout"), { code: "deadline-exceeded" })), ms))]);
  }
  // Sin conexión: se comprueba con las entradas guardadas y se apunta para sincronizar después
  function validateLocal(code) {
    const t = tickets.get(code), rp = t && t.rrppId ? team.find(x => x.id === t.rrppId) : null;
    if (!t) { show({ ok: false, title: "No está en la lista", msg: "Sin conexión: este código no está entre las entradas guardadas de este evento. Puede ser falsa, de otro evento o comprada hace un momento." }, code); return; }
    if (t.voided) { show({ ok: false, title: "Anulada", who: t.buyerName, msg: "Esta entrada se anuló desde el panel." }, code); return; }
    if (t.usedAt || pendingUsed.has(code)) { show({ ok: false, title: "Ya está dentro", who: t.buyerName, msg: t.usedAt ? "Esta entrada se escaneó a las " + fmtTime(t.usedAt) + "." : "Esta entrada ya se ha escaneado en este móvil." }, code); return; }
    pendingUsed.add(code);
    const b = writeBatch(db);
    b.update(doc(db, "orgs", ctx.orgId, "tickets", code), { usedAt: serverTimestamp(), usedBy: ctx.uid });
    b.update(doc(db, "events", e.id), { inside: increment(1) });
    b.commit().catch(err => { console.warn(err); toast("Al sincronizar: la entrada " + code + " ya constaba como usada en otra puerta."); });
    show({ ok: true, title: "Adelante", who: t.buyerName, msg: (t.tierName || "Entrada") + (rp ? " · vía " + rp.name : "") + " · sin conexión, se sincroniza al volver" }, code);
  }
  function show(v, code) {
    log.unshift({ at: new Date(), code, who: v.who || "", ok: v.ok, title: v.title });
    beep(v.ok);
    if (navigator.vibrate) { try { navigator.vibrate(v.ok ? 60 : [80, 60, 80]); } catch (x) { /* nada */ } }
    verdict.className = "verdict" + (v.ok ? "" : " bad");
    verdict.innerHTML = '<button class="v-in" data-vclose><span class="v-stamp">' + esc(v.title) + '</span>' + (v.who ? '<span class="v-who">' + esc(v.who) + '</span>' : '') + '<span class="v-msg">' + esc(v.msg) + '</span><span class="v-next">Toca para seguir</span></button>';
    verdict.hidden = false;
    clearTimeout(vTimer); vTimer = setTimeout(closeVerdict, v.ok ? 1800 : 4500);
  }
  function closeVerdict() {
    clearTimeout(vTimer); verdict.hidden = true;
    updateCounter();
    refreshLog();
    const i = el.querySelector("#code"); if (i && !camOn) i.focus();
  }
  function refreshLog() {
    const card = el.querySelector("#scanLog"); if (!card || tab !== "escanear") return;
    card.innerHTML = '<div class="card-h"><h2 class="h2">Últimos escaneos</h2><span class="small">en este móvil</span></div>' + (log.length ? '<ul class="slog">' + log.slice(0, 12).map(l =>
      '<li><span class="mono small">' + fmtTime(l.at) + '</span><div><b>' + esc(l.who || "—") + '</b><span class="mono small">' + esc(l.code) + '</span></div><span class="chip chip-' + (l.ok ? 'ok' : 'bad') + '">' + (l.ok ? '✓ ' : '✕ ') + esc(l.title) + '</span></li>').join("") + '</ul>' : '<p class="small muted">Aún no has escaneado nada.</p>');
  }
  const onVerdict = ev => { if (ev.target.closest("[data-vclose]")) closeVerdict(); };
  verdict.addEventListener("click", onVerdict);

  const onSubmit = ev => { if (ev.target.id === "manual") { ev.preventDefault(); const i = el.querySelector("#code"); if (i && i.value.trim()) { validate(i.value); i.value = ""; } } };
  const onInput = ev => { if (ev.target.id === "pSearch") { filter = ev.target.value; const box = el.querySelector("#pList"); if (box) box.innerHTML = listHtml(guests.filter(g => !norm(filter) || norm(g.name).includes(norm(filter))), filter); } };
  el.addEventListener("submit", onSubmit); el.addEventListener("input", onInput);

  const actions = {
    async pickEv(d) { setPicked(d.id); closeSheet(); await stopCam(); e = events.find(x => x.id === d.id) || e; filter = ""; const ps = el.querySelector("#pSearch"); if (ps) ps.value = ""; sub(); render(true); },
    pastEv() { openSheet(pastPicker(events)); },
    async tab(d) { if (d.id !== "escanear") await stopCam(); tab = d.id; render(true); },
    async cam() { if (camOn) { await stopCam(); camUi(); } else { const b = el.querySelector('[data-act="cam"]'); if (b) b.disabled = true; await startCam(); } },
    async letIn(d, b) {
      const g = guests.find(x => x.id === d.id); if (!g) return; b.disabled = true;
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, "orgs", ctx.orgId, "guests", g.id), { inAt: serverTimestamp(), inBy: ctx.uid });
        batch.update(doc(db, "events", e.id), { inside: increment(1) });
        const p = batch.commit();
        if (!isOnline()) {
          p.catch(err => { console.warn(err); toast("No se pudo sincronizar la entrada de " + g.name + "."); });
          g.inAt = new Date(); renderPart(); beep(true); toast(g.name + " está dentro (se sincroniza al volver)."); return;
        }
        await p;
        beep(true); toast(g.name + " está dentro.");
      } catch (x) { b.disabled = false; toast("No se pudo marcar. Revisa la conexión."); }
    },
    async arrive(d, b) {
      b.disabled = true;
      try {
        const p = updateDoc(doc(db, "orgs", ctx.orgId, "reservations", d.id), { arrivedAt: serverTimestamp() });
        if (!isOnline()) { p.catch(() => {}); const r = res.find(x => x.id === d.id); if (r) r.arrivedAt = new Date(); renderPart(); toast("Mesa marcada (se sincroniza al volver)."); return; }
        await p; toast("Mesa marcada como llegada.");
      }
      catch (x) { b.disabled = false; toast("No se pudo marcar."); }
    }
  };
  const offV = delegate(el, actions), offS = delegate(sheetBody(), { pickEv: actions.pickEv });

  return () => {
    stopCam(); clearTimeout(vTimer); verdict.hidden = true; verdict.removeEventListener("click", onVerdict);
    window.removeEventListener("online", onNet); window.removeEventListener("offline", onNet);
    offs.forEach(f => f()); evOffs.forEach(f => f()); offV(); offS();
    el.removeEventListener("submit", onSubmit); el.removeEventListener("input", onInput);
  };
}
