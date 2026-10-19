// Listas de invitados por evento.
import { db, collection, doc, query, where, onSnapshot, addDoc, deleteDoc, writeBatch, serverTimestamp } from "../../firebase.js";
import { esc, fmtTime, fmtDay, delegate, openSheet, closeSheet, sheetBody, toast, norm, downloadCsv } from "../../ui.js";
import { watchOrgEvents, pickEvent, setPicked, evPicks, pastPicker, confirmTap, errHtml, noEventsHtml, keepInputs } from "../common.js";

const TYPES = ["Gratis antes de 1:30", "Consumición incluida", "Invitación VIP", "Precio reducido"];

export default function (ctx, el) {
  let events = null, e = null, guests = [], team = [], loadErr = null, filter = "", bulk = false;
  const offs = []; let gOff = null;
  offs.push(watchOrgEvents(ctx, (list, er) => { events = list; loadErr = er || null; const prev = e && e.id; e = pickEvent(list); if ((e && e.id) !== prev) sub(); render(); }));
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "rrpp"), s => { team = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.name.localeCompare(b.name)); render(); }, () => {}));

  function sub() {
    if (gOff) gOff(); guests = [];
    if (!e) return;
    gOff = onSnapshot(query(collection(db, "orgs", ctx.orgId, "guests"), where("eventId", "==", e.id)), s => {
      guests = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.name.localeCompare(b.name, "es"));
      renderList();
    }, () => {});
  }
  const who = g => g.rrppId ? ((team.find(r => r.id === g.rrppId) || {}).name || "RRPP") : (ctx.org.type === "local" ? "El local" : "La promotora");

  function listHtml() {
    const f = norm(filter);
    const shown = guests.filter(g => !f || norm(g.name).includes(f));
    if (!guests.length) return '<p class="small muted">La lista está vacía. Añade nombres aquí o deja que tus RRPP los apunten desde su app.</p>';
    if (!shown.length) return '<p class="small muted">Nadie con ese nombre.</p>';
    return '<ul class="gl">' + shown.map(g => '<li><div><b>' + esc(g.name) + '</b><span class="small">' + esc(g.type) + ' · ' + esc(who(g)) + '</span></div><div class="gl-act">' +
      (g.inAt ? '<span class="chip chip-ok">Dentro ' + fmtTime(g.inAt) + '</span>' : '<span class="chip">Pendiente</span><button class="icon-btn" data-act="del" data-id="' + g.id + '" aria-label="Quitar de la lista">×</button>') + '</div></li>').join("") + '</ul>';
  }
  function renderList() {
    const box = el.querySelector("#gList"); if (!box) { render(); return; }
    box.innerHTML = listHtml();
    const c = el.querySelector("#gCount"); if (c) c.textContent = guests.length + " nombres · " + guests.filter(g => g.inAt).length + " dentro";
  }

  function render() {
    if (events === null) return;
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    if (!e) { el.innerHTML = '<section class="page"><h1 class="h1">Listas</h1>' + noEventsHtml(ctx) + '</section>'; return; }
    keepInputs(el, () => paint());
  }
  function paint() {
    const opts = '<option value="">' + (ctx.org.type === "local" ? "El local" : "La promotora") + '</option>' + team.map(r => '<option value="' + r.id + '">' + esc(r.name) + '</option>').join("");
    el.innerHTML = '<section class="page"><div class="ph"><div class="ph-t"><p class="eyebrow">' + esc(e.name) + '</p><h1 class="h1">Listas de invitados</h1></div>' + evPicks(events, e.id) + '</div>' +
      '<div class="pgrid">' +
        '<div class="card"><div class="card-h"><h2 class="h2">Lista</h2><span class="small" id="gCount">' + guests.length + ' nombres · ' + guests.filter(g => g.inAt).length + ' dentro</span><button class="linkbtn" data-act="csv">Descargar Excel</button></div>' +
        '<div class="field"><label for="gSearch" class="sr">Buscar</label><input id="gSearch" type="search" placeholder="Buscar un nombre" value="' + esc(filter) + '" autocomplete="off"></div><div id="gList">' + listHtml() + '</div></div>' +
        '<form class="card" id="gForm" novalidate><div class="card-h"><h2 class="h2">Añadir</h2><button type="button" class="linkbtn" data-act="bulk">' + (bulk ? 'Añadir de uno en uno' : 'Pegar varios nombres') + '</button></div>' +
          (bulk ? '<div class="field"><label for="gBulk">Un nombre por línea</label><textarea id="gBulk" rows="7" placeholder="Carmen López\nJavi Ruiz\n…"></textarea></div>'
                : '<div class="field"><label for="gName">Nombre y apellido</label><input id="gName" placeholder="Ej. Carmen López" autocomplete="off"></div>') +
          '<div class="field"><label for="gType">Tipo</label><select id="gType">' + TYPES.map(t => '<option>' + t + '</option>').join("") + '</select></div>' +
          '<div class="field"><label for="gRrpp">De parte de</label><select id="gRrpp">' + opts + '</select></div>' +
          '<button class="btn btn-primary" type="submit">Añadir a la lista</button><p class="hint">En la puerta los encuentran buscando el nombre y los marcan como dentro.</p></form>' +
      '</div></section>';
  }

  async function add() {
    const type = el.querySelector("#gType").value, rrppId = el.querySelector("#gRrpp").value || null;
    const names = bulk
      ? el.querySelector("#gBulk").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 300)
      : [el.querySelector("#gName").value.trim()].filter(Boolean);
    if (!names.length) return;
    try {
      // En grupos de 8: Firebase limita cuántas comprobaciones de seguridad hace por envío
      for (let i = 0; i < names.length; i += 8) {
        const batch = writeBatch(db);
        names.slice(i, i + 8).forEach(name => batch.set(doc(collection(db, "orgs", ctx.orgId, "guests")), { eventId: e.id, name, type, rrppId, addedBy: ctx.uid, inAt: null, createdAt: serverTimestamp() }));
        await batch.commit();
      }
      ctx.log(names.length === 1 ? names[0] + " añadido a la lista de " + e.name : names.length + " nombres añadidos a la lista de " + e.name);
      toast(names.length === 1 ? names[0] + " está en la lista." : names.length + " nombres añadidos.");
      const i = el.querySelector(bulk ? "#gBulk" : "#gName"); if (i) { i.value = ""; i.focus(); }
    } catch (x) { console.error(x); toast("No se pudo añadir."); }
  }

  const onSubmit = ev => { if (ev.target.id === "gForm") { ev.preventDefault(); add(); } };
  const onInput = ev => { if (ev.target.id === "gSearch") { filter = ev.target.value; renderList(); } };
  el.addEventListener("submit", onSubmit); el.addEventListener("input", onInput);
  const actions = {
    csv() {
      if (!guests.length) { toast("La lista está vacía."); return; }
      downloadCsv("Lista " + e.name + " " + fmtDay(e.date), [["Nombre", "Tipo", "De parte de", "Hora de entrada"]].concat(guests.map(g => [g.name, g.type, who(g), g.inAt || ""])));
    },
    pickEv(d) { setPicked(d.id); closeSheet(); e = events.find(x => x.id === d.id) || e; filter = ""; sub(); const s = el.querySelector("#gSearch"); if (s) s.value = ""; render(); },
    pastEv() { openSheet(pastPicker(events)); },
    bulk() { bulk = !bulk; paint(); },
    del(d, b) { confirmTap(b, "¿Quitar?", async () => { try { await deleteDoc(doc(db, "orgs", ctx.orgId, "guests", d.id)); } catch (x) { toast("No se pudo quitar."); } }); }
  };
  const offV = delegate(el, actions), offS = delegate(sheetBody(), { pickEv: actions.pickEv });
  return () => { offs.forEach(f => f()); if (gOff) gOff(); offV(); offS(); el.removeEventListener("submit", onSubmit); el.removeEventListener("input", onInput); };
}
