// Mi panel (RRPP): su enlace, sus ventas, su comisión, el ranking y su lista.
import { db, collection, doc, query, where, onSnapshot, addDoc, deleteDoc, serverTimestamp } from "../../firebase.js";
import { esc, eur, num, fmtDay, fmtTime, delegate, toast, copyText, shareOrCopy } from "../../ui.js";
import { watchOrgEvents, pickEvent, setPicked, evPicks, isUpcoming, kpi, confirmTap, siteUrl, keepInputs } from "../common.js";

export default function (ctx, el) {
  const rid = ctx.member.rrppId;
  if (!rid) {
    el.innerHTML = '<section class="page narrow"><h1 class="h1">Mi panel</h1><div class="notice"><b>Tu usuario no está unido a ninguna ficha de RRPP.</b><p class="small">Pide a tu encargado que te invite desde la sección RRPP → “Invitar a la app”.</p></div></section>';
    return () => {};
  }
  let me = null, team = [], events = null, e = null, guests = [], missing = false;
  const offs = []; let gOff = null;
  offs.push(onSnapshot(doc(db, "orgs", ctx.orgId, "rrpp", rid), s => { if (!s.exists()) { missing = true; me = null; } else me = Object.assign({ id: s.id }, s.data()); render(); }, () => {}));
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "rrpp"), s => { team = s.docs.map(d => Object.assign({ id: d.id }, d.data())); render(); }, () => {}));
  offs.push(watchOrgEvents(ctx, list => { events = list; const prev = e && e.id; e = pickEvent(list.filter(isUpcoming)) || null; if ((e && e.id) !== prev) sub(); render(); }));

  function sub() {
    if (gOff) gOff(); guests = [];
    if (!e) return;
    gOff = onSnapshot(query(collection(db, "orgs", ctx.orgId, "guests"), where("eventId", "==", e.id)), s => {
      guests = s.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(g => g.rrppId === rid).sort((a, b) => a.name.localeCompare(b.name, "es"));
      const box = el.querySelector("#myList"); if (box) box.innerHTML = listHtml(); else render();
    }, () => {});
  }
  const link = () => siteUrl("/eventos.html?o=" + encodeURIComponent(ctx.orgId) + "&rrpp=" + encodeURIComponent(me.code));
  const evLink = ev => siteUrl("/evento.html?id=" + encodeURIComponent(ev.id) + "&rrpp=" + encodeURIComponent(me.code));
  const listHtml = () => guests.length ? '<ul class="gl">' + guests.map(g => '<li><div><b>' + esc(g.name) + '</b><span class="small">' + esc(g.type) + '</span></div><div class="gl-act">' +
    (g.inAt ? '<span class="chip chip-ok">Dentro ' + fmtTime(g.inAt) + '</span>' : '<span class="chip">Pendiente</span><button class="icon-btn" data-act="del" data-id="' + g.id + '" aria-label="Quitar">×</button>') + '</div></li>').join("") + '</ul>'
    : '<p class="small muted">Aún no has apuntado a nadie en este evento.</p>';

  function render() {
    if (missing) { el.innerHTML = '<section class="page narrow"><h1 class="h1">Mi panel</h1><div class="notice"><b>Tu ficha de RRPP ya no existe.</b><p class="small">Habla con tu encargado.</p></div></section>'; return; }
    if (!me || events === null) return;
    const earned = Number(me.earned) || 0, pending = Math.max(0, earned - (Number(me.paid) || 0));
    const rank = team.slice().sort((a, b) => (b.soldTotal || 0) - (a.soldTotal || 0));
    const pos = rank.findIndex(r => r.id === rid) + 1;
    const up = events.filter(isUpcoming);
    keepInputs(el, () => { el.innerHTML = '<section class="page narrow"><header class="page-head"><p class="eyebrow">' + esc(ctx.org.name) + ' · RRPP</p><h1 class="h1">Hola, ' + esc(String(me.name).split(" ")[0]) + '</h1></header>' +
      '<div class="card"><p class="kpi-l">Tu enlace de venta</p><p class="mono linktext">' + esc(link()) + '</p><div class="row"><button class="btn btn-primary btn-sm" data-act="share">Compartir enlace</button><button class="btn btn-sm" data-act="copy">Copiar</button><span class="small">Quien compre desde aquí cuenta para ti durante 7 días.</span></div></div>' +
      '<div class="kpis kpis-3">' + kpi("Entradas vendidas", num(me.soldTotal || 0), (me.tablesCount || 0) + " mesas VIP") + kpi("Comisión ganada", eur(earned), eur(me.perTicket || 0) + " por entrada + " + (me.tablePct || 0) + " % de mesas") + kpi("Pendiente de cobrar", eur(pending), pending > 0 ? "Te lo paga " + esc(ctx.org.name) : "Estás al día") + '</div>' +
      '<div class="card"><div class="card-h"><h2 class="h2">Ranking del equipo</h2><span class="small">Vas ' + pos + 'º de ' + rank.length + '</span></div><ol class="rank">' + rank.map((r, i) => '<li class="' + (r.id === rid ? 'me' : '') + '"><span class="mono">' + (i + 1) + '</span><span>' + esc(r.name) + '</span><span class="mono">' + num(r.soldTotal || 0) + '</span></li>').join("") + '</ol></div>' +
      (e ? '<div class="card"><div class="card-h"><h2 class="h2">Tu lista</h2><span class="small">' + guests.length + ' nombres · ' + guests.filter(g => g.inAt).length + ' dentro</span></div>' + evPicks(up, e.id) +
        '<form class="inline-form" id="rgForm" novalidate><label for="rgName" class="sr">Nombre</label><input id="rgName" placeholder="Nombre y apellido" autocomplete="off"><label for="rgType" class="sr">Tipo</label><select id="rgType"><option>Gratis antes de 1:30</option><option>Consumición incluida</option></select><button class="btn btn-primary" type="submit">Apuntar</button></form>' +
        '<div id="myList">' + listHtml() + '</div></div>' : '<div class="card empty"><p><b>No hay eventos próximos.</b></p></div>') +
      (up.length ? '<div class="card"><div class="card-h"><h2 class="h2">Enlaces por evento</h2></div><ul class="gl">' + up.map(ev => {
        const n = (me.sold || {})[ev.id] || 0;
        return '<li><div><b>' + esc(ev.name) + '</b><span class="small">' + esc(fmtDay(ev.date)) + ' · llevas ' + n + ' entrada' + (n === 1 ? '' : 's') + '</span></div><button class="btn btn-sm" data-act="evLink" data-id="' + ev.id + '">Copiar enlace</button></li>';
      }).join("") + '</ul></div>' : '') +
      '</section>'; });
  }

  async function addGuest() {
    const i = el.querySelector("#rgName"), name = i.value.trim(); if (!name || !e) return;
    try {
      await addDoc(collection(db, "orgs", ctx.orgId, "guests"), { eventId: e.id, name, type: el.querySelector("#rgType").value, rrppId: rid, addedBy: ctx.uid, inAt: null, createdAt: serverTimestamp() });
      ctx.log(String(me.name).split(" ")[0] + " apunta a " + name + " en su lista");
      i.value = ""; i.focus(); toast(name + " apuntado en tu lista.");
    } catch (x) { console.error(x); toast("No se pudo apuntar."); }
  }
  const onSubmit = ev => { if (ev.target.id === "rgForm") { ev.preventDefault(); addGuest(); } };
  el.addEventListener("submit", onSubmit);
  const offV = delegate(el, {
    share() { shareOrCopy("Entradas " + ctx.org.name, link()); },
    copy() { copyText(link(), "Enlace copiado."); },
    evLink(d) { const ev = events.find(x => x.id === d.id); if (ev) copyText(evLink(ev), "Enlace de " + ev.name + " copiado."); },
    pickEv(d) { setPicked(d.id); e = events.find(x => x.id === d.id) || e; sub(); render(); },
    del(d, b) { confirmTap(b, "¿Quitar?", async () => { try { await deleteDoc(doc(db, "orgs", ctx.orgId, "guests", d.id)); } catch (x) { toast("No se pudo quitar."); } }); }
  });
  return () => { offs.forEach(f => f()); if (gOff) gOff(); offV(); el.removeEventListener("submit", onSubmit); };
}
