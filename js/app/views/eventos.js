// Eventos: crear, editar, publicar y compartir.
import { db, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, runTransaction, onSnapshot, serverTimestamp, Timestamp } from "../../firebase.js";
import { esc, eur, num, fmtDay, flyer, evStatus, delegate, openSheet, setSheet, closeSheet, sheetBody, toast, copyText, rid, toDate, HUES, dayKey, compressImage } from "../../ui.js";
import { watchOrgEvents, isUpcoming, confirmTap, errHtml, siteUrl } from "../common.js";

export default function (ctx, el) {
  let events = null, loadErr = null, showPast = false, draft = null, codesEv = null, codes = [], codesOff = null, codeForm = { type: "pct" };
  const off = watchOrgEvents(ctx, (list, er) => { events = list; loadErr = er || null; render(); });

  function render() {
    if (events === null) return;
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    const up = events.filter(isUpcoming), past = events.filter(e => !isUpcoming(e)).reverse();
    const list = showPast ? past : up;
    el.innerHTML = '<section class="page"><div class="ph"><div class="ph-t"><p class="eyebrow">' + esc(ctx.org.name) + '</p><h1 class="h1">Eventos</h1></div><button class="btn btn-primary" data-act="new">Crear evento</button></div>' +
      '<div class="picks"><button class="pick" data-act="tab" data-id="up" aria-pressed="' + !showPast + '">Próximos (' + up.length + ')</button><button class="pick" data-act="tab" data-id="past" aria-pressed="' + showPast + '">Pasados (' + past.length + ')</button></div>' +
      (list.length ? '<div class="evlist">' + list.map(row).join("") + '</div>'
        : '<div class="card empty"><p><b>' + (showPast ? 'Aún no hay eventos pasados.' : 'No tienes eventos próximos.') + '</b></p>' + (showPast ? '' : '<button class="btn btn-primary" data-act="new">Crear evento</button>') + '</div>') +
      '</section>';
  }

  function row(e) {
    const st = evStatus(e), s = e.soldTotal || 0;
    return '<div class="card" style="gap:10px"><div class="evrow" style="border:0;padding:0;background:none;cursor:default">' + flyer(e, "mini") +
      '<div class="evrow-t"><span class="evrow-name">' + esc(e.name) + '</span><span class="small">' + esc(fmtDay(e.date)) + ' · ' + esc(e.venueName || "") + ' · ' + eur(e.revenue || 0) + '</span></div>' +
      '<div class="evrow-sales"><span class="small mono">' + num(s) + ' / ' + num(e.capacity) + ' entradas</span><div class="bar"><i style="width:' + Math.min(100, s / (e.capacity || 1) * 100) + '%"></i></div></div>' +
      '<span class="chip ' + (st[1] ? 'chip-' + st[1] : '') + ' evrow-chip">' + st[0] + '</span></div>' +
      '<div class="row"><button class="btn btn-sm" data-act="edit" data-id="' + e.id + '">Editar</button>' +
      '<button class="btn btn-sm" data-act="toggle" data-id="' + e.id + '">' + (e.published ? 'Quitar de la venta' : 'Publicar') + '</button>' +
      '<button class="btn btn-sm" data-act="link" data-id="' + e.id + '">Copiar enlace</button>' +
      '<button class="btn btn-sm" data-act="codes" data-id="' + e.id + '">Descuentos</button>' +
      '<a class="btn btn-sm" href="' + esc(siteUrl("/evento.html?id=" + encodeURIComponent(e.id))) + '" target="_blank" rel="noopener">Ver en la web</a>' +
      (s === 0 ? '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + e.id + '">Borrar</button>'
        : isUpcoming(e) ? (e.cancelled ? '<button class="btn btn-sm" data-act="uncancel" data-id="' + e.id + '">Quitar cancelación</button>' : '<button class="btn btn-sm btn-danger" data-act="cancel" data-id="' + e.id + '">Cancelar evento</button>') : '') + '</div>' +
      (e.cancelled ? '<p class="small" style="color:var(--bad)">Cancelado. Ya no se vende y los compradores lo ven en su entrada.' + ' Para devolver el dinero, anula las entradas en «Entradas».</p>' : '') + '</div>';
  }

  /* ---------- editor ---------- */
  function newDraft() {
    const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); // próximo sábado
    return {
      id: null, name: "", date: dayKey(d), time: "23:30", endTime: "06:00",
      venueName: ctx.org.venueName || (ctx.org.type === "local" ? ctx.org.name : ""), area: ctx.org.area || "",
      capacity: ctx.org.type === "local" ? 500 : 800, genre: "", lineup: "", description: "", hue: HUES[(events || []).length % HUES.length],
      vipEnabled: (ctx.org.tables || []).length > 0, published: true, poster: "",
      tiers: [{ id: "t" + rid(6), name: "1ª fase", price: 12, qty: 200, sold: 0 }, { id: "t" + rid(6), name: "2ª fase", price: 15, qty: 300, sold: 0 }]
    };
  }
  function draftFrom(e) {
    const dt = toDate(e.date);
    return {
      id: e.id, name: e.name, date: dayKey(dt),
      time: new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(dt),
      endTime: e.endTime || "", venueName: e.venueName || "", area: e.area || "", capacity: e.capacity || 0, genre: e.genre || "",
      lineup: (e.lineup || []).join(", "), description: e.description || "", hue: e.hue || 346, vipEnabled: e.vipEnabled !== false, published: !!e.published, poster: e.poster || "",
      tiers: (e.tiers || []).map(t => Object.assign({}, t))
    };
  }
  function editorHtml(err) {
    const d = draft;
    return '<form id="evForm" class="form" novalidate><p class="eyebrow">' + (d.id ? 'Editar evento' : 'Nuevo evento') + '</p><h2 class="h2 sheet-t">' + esc(d.name || "Sin nombre") + '</h2>' +
      '<div class="field"><label for="eName">Nombre del evento</label><input id="eName" required value="' + esc(d.name) + '" placeholder="Ej. Noche Remember" autocomplete="off"></div>' +
      '<div class="grid2"><div class="field"><label for="eDate">Fecha</label><input id="eDate" type="date" required value="' + esc(d.date) + '"></div>' +
      '<div class="grid2"><div class="field"><label for="eTime">Abre</label><input id="eTime" type="time" required value="' + esc(d.time) + '"></div><div class="field"><label for="eEnd">Cierra</label><input id="eEnd" type="time" value="' + esc(d.endTime) + '"></div></div></div>' +
      '<div class="grid2"><div class="field"><label for="eVenue">Sala</label><input id="eVenue" value="' + esc(d.venueName) + '" placeholder="Nombre de la sala"></div><div class="field"><label for="eArea">Zona</label><input id="eArea" value="' + esc(d.area) + '" placeholder="Ej. Malasaña, Madrid"></div></div>' +
      '<div class="grid2"><div class="field"><label for="eCap">Aforo</label><input id="eCap" type="number" inputmode="numeric" min="1" value="' + esc(d.capacity) + '"></div><div class="field"><label for="eGenre">Música</label><input id="eGenre" value="' + esc(d.genre) + '" placeholder="Ej. House y techno"></div></div>' +
      '<div class="field"><label for="eLineup">Line-up (separado por comas)</label><input id="eLineup" value="' + esc(d.lineup) + '" placeholder="Ej. DJ Uno, DJ Dos"></div>' +
      '<div class="field"><label for="eDesc">Descripción (opcional)</label><textarea id="eDesc" placeholder="Edad mínima, dress code, normas…">' + esc(d.description) + '</textarea></div>' +
      '<div class="field"><span class="lbl">Cartel</span>' + (d.poster
        ? '<div class="poster-ed"><img src="' + esc(d.poster) + '" alt="Cartel"><div class="row"><label class="btn btn-sm" for="ePoster">Cambiar foto</label><button type="button" class="btn btn-sm btn-danger" data-act="noPoster">Quitar foto</button></div></div>'
        : '<label class="btn btn-sm" for="ePoster" style="align-self:flex-start">Subir foto del cartel</label><p class="hint">Opcional. Si no subes ninguna, se hace un cartel con el nombre y el color.</p>') +
        '<input id="ePoster" type="file" accept="image/*" class="sr"></div>' +
      '<div class="field"><span class="lbl">Color' + (d.poster ? ' (si quitas la foto)' : ' del cartel') + '</span><div class="row">' + HUES.map(h => '<button type="button" class="swatch" style="--h:' + h + '" data-act="hue" data-id="' + h + '" aria-pressed="' + (Number(d.hue) === h) + '" aria-label="Color ' + h + '"></button>').join("") + '</div></div>' +
      '<div class="field"><span class="lbl">Tipos de entrada · nombre, precio (€) y cantidad</span><div class="ed">' + d.tiers.map((t, i) =>
        '<div class="grid3"><label class="sr" for="tn' + i + '">Nombre</label><input id="tn' + i + '" value="' + esc(t.name) + '" placeholder="Ej. Con copa">' +
        '<label class="sr" for="tp' + i + '">Precio</label><input id="tp' + i + '" type="number" inputmode="decimal" min="0" step="0.5" value="' + esc(t.price) + '">' +
        '<label class="sr" for="tq' + i + '">Cantidad</label><input id="tq' + i + '" type="number" inputmode="numeric" min="' + (t.sold || 0) + '" value="' + esc(t.qty) + '">' +
        ((t.sold || 0) > 0
          ? '<label class="check small" title="Ocultar de la web"><input type="checkbox" id="th' + i + '"' + (t.hidden ? ' checked' : '') + '>Ocultar</label>'
          : '<button type="button" class="icon-btn" data-act="delTier" data-id="' + i + '" aria-label="Quitar esta entrada">×</button>') + '</div>' +
        ((t.sold || 0) > 0 ? '<p class="hint">' + t.sold + ' vendidas: no puedes bajar de ahí.</p>' : '')).join("") +
      '<button type="button" class="btn btn-sm" data-act="addTier" style="align-self:flex-start">+ Añadir tipo de entrada</button></div></div>' +
      ((ctx.org.tables || []).length ? '<label class="check"><input type="checkbox" id="eVip"' + (d.vipEnabled ? ' checked' : '') + '> Vender mesas VIP online con señal</label>' : '') +
      '<label class="check"><input type="checkbox" id="ePub"' + (d.published ? ' checked' : '') + '> Publicado (se puede comprar)</label>' +
      (err ? '<p class="err">' + esc(err) + '</p>' : '') +
      '<button class="btn btn-primary btn-block" type="submit">' + (d.id ? 'Guardar cambios' : 'Crear evento') + '</button></form>';
  }
  function collect() {
    const v = id => { const x = document.getElementById(id); return x ? x.value : ""; };
    const c = id => { const x = document.getElementById(id); return x ? x.checked : false; };
    if (!document.getElementById("evForm")) return;
    Object.assign(draft, { name: v("eName").trim(), date: v("eDate"), time: v("eTime"), endTime: v("eEnd"), venueName: v("eVenue").trim(), area: v("eArea").trim(), capacity: v("eCap"), genre: v("eGenre").trim(), lineup: v("eLineup"), description: v("eDesc").trim(), published: c("ePub") });
    if (document.getElementById("eVip")) draft.vipEnabled = c("eVip");
    draft.tiers.forEach((t, i) => { t.name = v("tn" + i).trim(); t.price = v("tp" + i); t.qty = v("tq" + i); if (document.getElementById("th" + i)) t.hidden = c("th" + i); });
  }
  function openEditor(d) { draft = d; openSheet(editorHtml()); }

  async function save() {
    collect();
    const d = draft;
    const tiers = d.tiers.filter(t => t.name || (t.sold || 0) > 0).map(t => ({
      id: t.id, name: t.name || "Entrada", price: Math.max(0, Math.round(Number(t.price) * 100) / 100), qty: Math.max(t.sold || 0, Math.floor(Number(t.qty) || 0)),
      sold: t.sold || 0, hidden: !!t.hidden, note: t.note || "", nextDone: !!t.nextDone
    }));
    const cap = Math.floor(Number(d.capacity));
    let err = null;
    if (!d.name) err = "Ponle nombre al evento.";
    else if (!d.date || !d.time) err = "Elige fecha y hora.";
    else if (!(cap > 0)) err = "El aforo tiene que ser un número mayor que 0.";
    else if (!tiers.length || tiers.some(t => !(t.qty > 0) || isNaN(t.price))) err = "Revisa los tipos de entrada: cada uno necesita precio y cantidad.";
    if (err) { setSheet(editorHtml(err)); return; }
    const [y, m, dd] = d.date.split("-").map(Number), [h, mi] = d.time.split(":").map(Number);
    const date = Timestamp.fromDate(new Date(y, m - 1, dd, h, mi));
    const lineup = d.lineup.split(",").map(s => s.trim()).filter(Boolean).slice(0, 8);
    const data = { name: d.name, date, endTime: d.endTime || "", venueName: d.venueName, area: d.area, capacity: cap, genre: d.genre, lineup, description: d.description, hue: Number(d.hue) || 346, vipEnabled: !!d.vipEnabled, published: !!d.published, poster: d.poster || "" };
    setSheet('<div class="paying"><div class="spin"></div><p class="small">Guardando…</p></div>');
    try {
      if (!d.id) {
        const prefix = (d.name.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase() + "AFO").slice(0, 3);
        const ref = await addDoc(collection(db, "events"), Object.assign(data, { orgId: ctx.orgId, orgName: ctx.org.name, prefix, tiers, soldTotal: 0, revenue: 0, inside: 0, daily: {}, taken: [], createdAt: serverTimestamp() }));
        ctx.log("Evento creado: " + d.name);
        closeSheet();
        toast(data.published ? "Evento publicado. Ya se puede comprar." : "Guardado como borrador.");
        if (data.published) copyText(siteUrl("/evento.html?id=" + ref.id), "Evento publicado. Enlace copiado para compartir.");
      } else {
        await runTransaction(db, async tx => {
          const ref = doc(db, "events", d.id), s = await tx.get(ref), cur = s.data();
          // Mantenemos las ventas reales (pueden haber entrado mientras editabas)
          const merged = tiers.map(t => { const c = (cur.tiers || []).find(x => x.id === t.id); const sold = c ? (c.sold || 0) : 0; return Object.assign({}, t, { sold, qty: Math.max(sold, t.qty) }); });
          (cur.tiers || []).forEach(c => { if ((c.sold || 0) > 0 && !merged.some(t => t.id === c.id)) merged.push(Object.assign({}, c, { hidden: true })); });
          tx.update(ref, Object.assign(data, { tiers: merged }));
        });
        ctx.log("Evento editado: " + d.name);
        closeSheet(); toast("Cambios guardados.");
      }
    } catch (x) { console.error(x); setSheet(editorHtml("No se pudo guardar: " + (x.message || "inténtalo otra vez."))); }
  }

  const sheetActs = {
    hue(d) { collect(); draft.hue = Number(d.id); setSheet(editorHtml()); },
    addTier() { collect(); draft.tiers.push({ id: "t" + rid(6), name: "", price: draft.tiers.length ? Number(draft.tiers[draft.tiers.length - 1].price) + 3 : 10, qty: 100, sold: 0 }); setSheet(editorHtml()); },
    delTier(d) { collect(); draft.tiers.splice(Number(d.id), 1); setSheet(editorHtml()); },
    noPoster() { collect(); draft.poster = ""; setSheet(editorHtml()); },
    codeType(d) { codeForm = readCodeForm(); codeForm.type = d.id; setSheet(codesHtml()); },
    async codeToggle(d, b) {
      const c = codes.find(x => x.id === d.id); if (!c) return; b.disabled = true;
      try { await updateDoc(doc(db, "events", codesEv.id, "codes", c.id), { active: !c.active }); } catch (x) { b.disabled = false; toast("No se pudo cambiar."); }
    },
    codeDel(d, b) {
      confirmTap(b, "¿Borrar?", async () => { try { await deleteDoc(doc(db, "events", codesEv.id, "codes", d.id)); } catch (x) { toast("No se pudo borrar."); } });
    },
    codeCopy(d) { copyText(siteUrl("/evento.html?id=" + encodeURIComponent(codesEv.id) + "&codigo=" + encodeURIComponent(d.id)), "Enlace con el código " + d.id + " copiado."); }
  };

  /* ---------- foto del cartel ---------- */
  const onFile = async ev => {
    if (ev.target.id !== "ePoster" || !ev.target.files || !ev.target.files[0]) return;
    collect();
    const f = ev.target.files[0];
    setSheet('<div class="paying"><div class="spin"></div><p class="small">Preparando la foto…</p></div>');
    try { draft.poster = await compressImage(f, 900, 220); setSheet(editorHtml()); }
    catch (x) { setSheet(editorHtml(x.message)); }
  };
  sheetBody().addEventListener("change", onFile);

  /* ---------- códigos de descuento ---------- */
  const codeLabel = c => (c.type === "eur" ? eur(c.value) + " menos por entrada" : c.value + " % de descuento");
  function codesHtml(err) {
    const e = codesEv;
    return '<p class="eyebrow">' + esc(e.name) + '</p><h2 class="h2 sheet-t">Códigos de descuento</h2>' +
      '<p class="small">El cliente lo escribe al comprar, o le pasas un enlace que ya lo trae puesto.</p>' +
      (codes.length ? '<ul class="gl">' + codes.map(c => '<li><div><b class="mono">' + esc(c.id) + '</b><span class="small">' + esc(codeLabel(c)) + ' · ' + (c.used || 0) + (c.max ? ' de ' + c.max : '') + ' usos' + (c.active ? '' : ' · <b>pausado</b>') + '</span></div>' +
        '<div class="gl-act"><button class="btn btn-sm" data-act="codeCopy" data-id="' + esc(c.id) + '">Enlace</button><button class="btn btn-sm" data-act="codeToggle" data-id="' + esc(c.id) + '">' + (c.active ? 'Pausar' : 'Activar') + '</button>' +
        ((c.used || 0) ? '' : '<button class="icon-btn" data-act="codeDel" data-id="' + esc(c.id) + '" aria-label="Borrar código">×</button>') + '</div></li>').join("") + '</ul>'
        : '<p class="small muted">Este evento aún no tiene códigos.</p>') +
      '<form id="codeForm" class="form" novalidate><h3 class="h2" style="font-size:1rem">Nuevo código</h3>' +
      '<div class="grid2"><div class="field"><label for="cCode">Código</label><input id="cCode" value="' + esc(codeForm.code || "") + '" placeholder="Ej. CUMPLE10" autocapitalize="characters" autocomplete="off"></div>' +
      '<div class="field"><span class="lbl">Tipo</span><div class="seg" role="group"><button type="button" data-act="codeType" data-id="pct" aria-pressed="' + (codeForm.type === "pct") + '">%</button><button type="button" data-act="codeType" data-id="eur" aria-pressed="' + (codeForm.type === "eur") + '">€ por entrada</button></div></div></div>' +
      '<div class="grid2"><div class="field"><label for="cValue">' + (codeForm.type === "eur" ? "Euros menos por entrada" : "Porcentaje de descuento") + '</label><input id="cValue" type="number" inputmode="decimal" min="0" step="' + (codeForm.type === "eur" ? "0.5" : "1") + '" value="' + esc(codeForm.value || (codeForm.type === "eur" ? 2 : 10)) + '"></div>' +
      '<div class="field"><label for="cMax">Usos máximos (0 = sin límite)</label><input id="cMax" type="number" inputmode="numeric" min="0" value="' + esc(codeForm.max != null ? codeForm.max : 50) + '"></div></div>' +
      (err ? '<p class="err">' + esc(err) + '</p>' : '') + '<button class="btn btn-primary" type="submit">Crear código</button></form>';
  }
  function readCodeForm() {
    const v = id => { const x = sheetBody().querySelector("#" + id); return x ? x.value : ""; };
    return { code: v("cCode"), value: v("cValue"), max: v("cMax"), type: codeForm.type };
  }
  async function createCode() {
    codeForm = readCodeForm();
    const id = String(codeForm.code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20), value = Math.round(Number(codeForm.value) * 100) / 100, max = Math.max(0, Math.floor(Number(codeForm.max) || 0));
    if (id.length < 3) { setSheet(codesHtml("El código necesita al menos 3 letras o números.")); return; }
    if (!(value > 0) || (codeForm.type === "pct" && value > 100)) { setSheet(codesHtml(codeForm.type === "pct" ? "El porcentaje tiene que estar entre 1 y 100." : "Pon cuántos euros de descuento.")); return; }
    if (codes.some(c => c.id === id)) { setSheet(codesHtml("Ese código ya existe en este evento.")); return; }
    try {
      await setDoc(doc(db, "events", codesEv.id, "codes", id), { type: codeForm.type, value, max, used: 0, active: true, createdAt: serverTimestamp() });
      ctx.log("Código de descuento " + id + " en " + codesEv.name);
      codeForm = { type: codeForm.type }; toast("Código " + id + " creado.");
    } catch (x) { console.error(x); setSheet(codesHtml("No se pudo crear el código.")); }
  }
  function openCodes(e) {
    codesEv = e; codes = []; codeForm = { type: "pct" };
    openSheet(codesHtml(), () => { if (codesOff) codesOff(); codesOff = null; codesEv = null; });
    codesOff = onSnapshot(collection(db, "events", e.id, "codes"), s => {
      codes = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.id.localeCompare(b.id));
      if (codesEv) { codeForm = readCodeForm(); setSheet(codesHtml()); }
    }, () => {});
  }
  const onSubmit = ev => {
    if (ev.target.id === "evForm") { ev.preventDefault(); save(); }
    if (ev.target.id === "codeForm") { ev.preventDefault(); createCode(); }
  };
  sheetBody().addEventListener("submit", onSubmit);

  const offV = delegate(el, {
    tab(d) { showPast = d.id === "past"; render(); },
    new() { openEditor(newDraft()); },
    edit(d) { const e = events.find(x => x.id === d.id); if (e) openEditor(draftFrom(e)); },
    async toggle(d, b) {
      const e = events.find(x => x.id === d.id); if (!e) return; b.disabled = true;
      try { await updateDoc(doc(db, "events", e.id), { published: !e.published }); ctx.log((e.published ? "Evento quitado de la venta: " : "Evento publicado: ") + e.name); toast(e.published ? "Quitado de la venta." : "Publicado. Ya se puede comprar."); }
      catch (x) { b.disabled = false; toast("No se pudo cambiar."); }
    },
    link(d) { copyText(siteUrl("/evento.html?id=" + d.id), "Enlace del evento copiado."); },
    codes(d) { const e = events.find(x => x.id === d.id); if (e) openCodes(e); },
    cancel(d, b) {
      const e = events.find(x => x.id === d.id); if (!e) return;
      confirmTap(b, "¿Cancelar " + e.name + "? Toca otra vez", async () => {
        try { await updateDoc(doc(db, "events", e.id), { cancelled: true, cancelledAt: serverTimestamp() }); ctx.log("Evento cancelado: " + e.name); toast("Evento cancelado. Ya no se vende."); }
        catch (x) { toast("No se pudo cancelar."); }
      });
    },
    async uncancel(d, b) {
      const e = events.find(x => x.id === d.id); if (!e) return; b.disabled = true;
      try { await updateDoc(doc(db, "events", e.id), { cancelled: false }); ctx.log("Cancelación quitada: " + e.name); toast("Vuelve a estar a la venta."); }
      catch (x) { b.disabled = false; toast("No se pudo cambiar."); }
    },
    del(d, b) {
      confirmTap(b, "¿Borrar? Toca otra vez", async () => {
        try { await deleteDoc(doc(db, "events", d.id)); toast("Evento borrado."); } catch (x) { toast("No se pudo borrar: ya tiene ventas."); }
      });
    }
  });
  const offS = delegate(sheetBody(), sheetActs);

  return () => { off(); offV(); offS(); if (codesOff) codesOff(); sheetBody().removeEventListener("submit", onSubmit); sheetBody().removeEventListener("change", onFile); };
}
