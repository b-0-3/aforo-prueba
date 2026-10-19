// Mesas VIP: plano en directo y reservas por evento.
import { db, collection, doc, query, where, onSnapshot, updateDoc, writeBatch, serverTimestamp, arrayUnion, arrayRemove } from "../../firebase.js";
import { esc, eur, fmtTime, fmtDay, mapHtml, legend, delegate, openSheet, setSheet, closeSheet, sheetBody, toast, downloadCsv } from "../../ui.js";
import { watchOrgEvents, pickEvent, setPicked, evPicks, pastPicker, confirmTap, errHtml, noEventsHtml } from "../common.js";

export default function (ctx, el) {
  let events = null, e = null, res = [], team = [], loadErr = null, form = null;
  const offs = []; let rOff = null;
  offs.push(watchOrgEvents(ctx, (list, er) => { events = list; loadErr = er || null; const prev = e && e.id; e = pickEvent(list); if ((e && e.id) !== prev) sub(); render(); }));
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "rrpp"), s => { team = s.docs.map(d => Object.assign({ id: d.id }, d.data())); }, () => {}));
  offs.push(ctx.onOrg(() => render()));

  function sub() {
    if (rOff) rOff(); res = [];
    if (!e) return;
    rOff = onSnapshot(query(collection(db, "orgs", ctx.orgId, "reservations"), where("eventId", "==", e.id)), s => {
      res = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.tableId.localeCompare(b.tableId, "es", { numeric: true }));
      render();
    }, () => {});
  }
  const layout = () => ({ zones: ctx.org.zones || [], tables: ctx.org.tables || [] });

  function render() {
    if (events === null) return;
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    if (!e) { el.innerHTML = '<section class="page"><h1 class="h1">Mesas VIP</h1>' + noEventsHtml(ctx) + '</section>'; return; }
    const tables = ctx.org.tables || [];
    if (!tables.length) { el.innerHTML = '<section class="page"><h1 class="h1">Mesas VIP</h1><div class="card empty"><p><b>Aún no tienes mesas en el plano.</b></p><a class="btn btn-primary" href="#ajustes">Crear el plano</a></div></section>'; return; }
    const arrived = res.filter(r => r.arrivedAt).map(r => r.tableId);
    const minSum = res.reduce((a, r) => a + (Number(r.min) || 0), 0);
    el.innerHTML = '<section class="page"><div class="ph"><div class="ph-t"><p class="eyebrow">' + esc(e.name) + '</p><h1 class="h1">Mesas VIP</h1></div>' + evPicks(events, e.id) + '</div>' +
      (e.vipEnabled === false ? '<div class="notice"><b>La venta online de mesas está apagada para este evento.</b><p class="small">Puedes apuntar reservas a mano. Para venderlas online, actívalo en Eventos → Editar.</p></div>' : '') +
      '<div class="pgrid">' +
        '<div class="card"><div class="card-h"><h2 class="h2">Plano</h2><span class="small">Toca una mesa libre para apuntar una reserva por teléfono</span></div>' + mapHtml(layout(), { taken: e.taken || [], arrived, act: "table" }) + legend() + '</div>' +
        '<div class="card"><div class="card-h"><h2 class="h2">Reservas</h2><span class="small">' + res.length + ' de ' + tables.length + ' · ' + eur(minSum) + ' en mínimos</span><button class="linkbtn" data-act="csv">Descargar Excel</button></div>' +
        (res.length ? '<ul class="rl">' + res.map(r => {
          const rp = r.rrppId ? team.find(x => x.id === r.rrppId) : null;
          return '<li><span class="tag-t">' + esc(r.tableId) + '</span><div><b>' + esc(r.name) + '</b><span class="small">' + r.people + ' personas · mínimo ' + eur(r.min) + ' · ' + (r.deposit ? 'señal ' + eur(r.deposit) + ' pagada' : 'sin señal') + (rp ? ' · ' + esc(rp.name) : '') + '</span>' +
            (r.phone ? '<span class="small mono">' + esc(r.phone) + '</span>' : '') + '</div>' +
            '<div class="gl-act">' + (r.arrivedAt ? '<span class="chip chip-ok">Llegó ' + fmtTime(r.arrivedAt) + '</span>' : '<button class="btn btn-sm" data-act="arrive" data-id="' + r.id + '">Ha llegado</button>') +
            '<button class="icon-btn" data-act="cancel" data-id="' + r.id + '" aria-label="Cancelar reserva">×</button></div></li>';
        }).join("") + '</ul>' : '<p class="small muted">Aún no hay reservas para este evento.</p>') + '</div>' +
      '</div></section>';
  }

  function formHtml(err) {
    const t = (ctx.org.tables || []).find(x => x.id === form.table);
    return '<form id="resForm" class="form" novalidate><p class="eyebrow eyebrow-brass">Reserva a mano · ' + esc(e.name) + '</p><h2 class="h2 sheet-t">Mesa ' + esc(t.id) + '</h2>' +
      '<p class="small">Hasta ' + t.pax + ' personas · consumo mínimo ' + eur(t.min) + '</p>' +
      '<div class="grid2"><div class="field"><label for="mName">A nombre de</label><input id="mName" required autocomplete="off" value="' + esc(form.name || "") + '"></div>' +
      '<div class="field"><label for="mPeople">Personas</label><input id="mPeople" type="number" inputmode="numeric" min="1" max="' + t.pax + '" value="' + esc(form.people || Math.min(6, t.pax)) + '"></div></div>' +
      '<div class="grid2"><div class="field"><label for="mPhone">Teléfono</label><input id="mPhone" type="tel" autocomplete="off" value="' + esc(form.phone || "") + '"></div>' +
      '<div class="field"><label for="mRrpp">De parte de</label><select id="mRrpp"><option value="">' + esc(ctx.org.name) + '</option>' + team.map(r => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join("") + '</select></div></div>' +
      (err ? '<p class="err">' + esc(err) + '</p>' : '') + '<button class="btn btn-brass btn-block" type="submit">Guardar reserva</button></form>';
  }

  async function save() {
    const t = (ctx.org.tables || []).find(x => x.id === form.table);
    form.name = sheetBody().querySelector("#mName").value.trim();
    form.people = sheetBody().querySelector("#mPeople").value;
    form.phone = sheetBody().querySelector("#mPhone").value.trim();
    const rrppId = sheetBody().querySelector("#mRrpp").value || null;
    if (!form.name) { setSheet(formHtml("Escribe a nombre de quién va.")); return; }
    if ((e.taken || []).includes(t.id)) { setSheet(formHtml("Esa mesa se acaba de reservar.")); return; }
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "orgs", ctx.orgId, "reservations")), { eventId: e.id, tableId: t.id, name: form.name, people: Math.max(1, Math.min(t.pax, Math.floor(Number(form.people) || 1))), min: Number(t.min) || 0, deposit: 0, phone: form.phone, email: "", rrppId, source: "manual", orderId: null, arrivedAt: null, createdAt: serverTimestamp() });
      batch.update(doc(db, "events", e.id), { taken: arrayUnion(t.id) });
      await batch.commit();
      ctx.log("Mesa " + t.id + " reservada a mano · " + form.name);
      closeSheet(); toast("Mesa " + t.id + " reservada a nombre de " + form.name + ".");
    } catch (x) { console.error(x); setSheet(formHtml("No se pudo guardar.")); }
  }

  const onSubmit = ev => { if (ev.target.id === "resForm") { ev.preventDefault(); save(); } };
  sheetBody().addEventListener("submit", onSubmit);
  const actions = {
    csv() {
      if (!res.length) { toast("No hay reservas."); return; }
      const rn = id => id ? ((team.find(r => r.id === id) || {}).name || "") : "";
      downloadCsv("Mesas " + e.name + " " + fmtDay(e.date), [["Mesa", "Nombre", "Personas", "Teléfono", "Email", "Consumo mínimo", "Señal pagada", "RRPP", "Llegada"]]
        .concat(res.map(r => [r.tableId, r.name, r.people, r.phone || "", r.email || "", Number(r.min) || 0, Number(r.deposit) || 0, rn(r.rrppId), r.arrivedAt || ""])));
    },
    pickEv(d) { setPicked(d.id); closeSheet(); e = events.find(x => x.id === d.id) || e; sub(); render(); },
    pastEv() { openSheet(pastPicker(events)); },
    table(d) { form = { table: d.id }; openSheet(formHtml()); },
    async arrive(d, b) {
      b.disabled = true;
      try { await updateDoc(doc(db, "orgs", ctx.orgId, "reservations", d.id), { arrivedAt: serverTimestamp() }); }
      catch (x) { b.disabled = false; toast("No se pudo marcar."); }
    },
    cancel(d, b) {
      const r = res.find(x => x.id === d.id); if (!r) return;
      confirmTap(b, "¿Cancelar?", async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, "orgs", ctx.orgId, "reservations", r.id));
          batch.update(doc(db, "events", e.id), { taken: arrayRemove(r.tableId) });
          await batch.commit();
          ctx.log("Reserva cancelada: mesa " + r.tableId + " · " + r.name);
          toast(r.deposit ? "Cancelada. Si hay que devolver la señal, hazlo desde tu panel de Stripe." : "Reserva cancelada.");
        } catch (x) { toast("No se pudo cancelar."); }
      });
    }
  };
  const offV = delegate(el, actions), offS = delegate(sheetBody(), { pickEv: actions.pickEv });
  return () => { offs.forEach(f => f()); if (rOff) rOff(); offV(); offS(); sheetBody().removeEventListener("submit", onSubmit); };
}
