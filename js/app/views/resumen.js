// Resumen: cómo va el evento elegido, en directo.
import { db, collection, query, where, orderBy, limit, onSnapshot, doc, runTransaction, updateDoc, Timestamp } from "../../firebase.js";
import { esc, eur, num, ucf, fmtLong, delegate, drawDailyChart, openSheet, closeSheet, sheetBody, copyText, toast, rid, toDate } from "../../ui.js";
import { PAGOS } from "../../config.js";
import { watchOrgEvents, pickEvent, setPicked, evPicks, pastPicker, kpi, feedHtml, noEventsHtml, errHtml, siteUrl } from "../common.js";

export default function (ctx, el) {
  let events = null, e = null, acts = [], res = [], guests = [], bar = null, loadErr = null;
  const offs = []; let evOffs = [];
  const isLocal = ctx.org.type === "local";

  offs.push(watchOrgEvents(ctx, (list, er) => {
    events = list; loadErr = er || null;
    const prev = e && e.id; e = pickEvent(list);
    if ((e && e.id) !== prev) subEvent();
    render();
  }));
  offs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "activity"), orderBy("createdAt", "desc"), limit(10)),
    s => { acts = s.docs.map(d => d.data()); const f = el.querySelector("#feed"); if (f) f.innerHTML = feedHtml(acts); }, () => {}));
  if (isLocal) {
    offs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "barSales"), where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - 12 * 3600e3)))),
      s => { bar = { total: s.docs.reduce((a, d) => a + (Number(d.data().total) || 0), 0), n: s.size }; render(); }, () => {}));
  }

  function subEvent() {
    evOffs.forEach(f => f()); evOffs = []; res = []; guests = [];
    if (!e) return;
    evOffs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "reservations"), where("eventId", "==", e.id)), s => { res = s.docs.map(d => d.data()); render(); }, () => {}));
    evOffs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "guests"), where("eventId", "==", e.id)), s => { guests = s.docs.map(d => d.data()); render(); }, () => {}));
  }

  function avisos() {
    const out = [];
    const tables = ctx.org.tables || [];
    if (!e.published) out.push('<li><span class="ic ic-warn">!</span><p>Este evento es un <b>borrador</b>: todavía no se puede comprar.</p><button class="btn btn-sm btn-primary" data-act="publish">Publicar ahora</button></li>');
    if (PAGOS !== "prueba" && ctx.isOwner() && !ctx.org.stripeReady) out.push('<li><span class="ic ic-warn">!</span><p>Aún no puedes cobrar: conecta tu cuenta de Stripe para que el dinero llegue a tu banco.</p><button class="btn btn-sm" data-act="go" data-id="ajustes">Conectar cobros</button></li>');
    (e.tiers || []).forEach(t => {
      const p = t.qty ? (t.sold || 0) / t.qty : 0;
      if (!t.hidden && p >= .75 && p < 1 && !t.nextDone) out.push('<li><span class="ic ic-warn">!</span><p>La <b>' + esc(t.name) + '</b> va al ' + Math.round(p * 100) + ' %. Prepara la siguiente fase para no cortar las ventas.</p><button class="btn btn-sm" data-act="nextPhase" data-id="' + esc(t.id) + '">Crear siguiente fase</button></li>');
    });
    const sp = (e.soldTotal || 0) / (e.capacity || 1);
    const days = Math.max(0, Math.ceil((toDate(e.date) - Date.now()) / 864e5));
    if (sp >= .5 && days > 0) out.push('<li><span class="ic ic-ok">↑</span><p>Llevas el ' + Math.round(sp * 100) + ' % del aforo vendido y faltan ' + days + ' día' + (days === 1 ? '' : 's') + '. Buen momento para que tus RRPP aprieten.</p><button class="btn btn-sm" data-act="copyMsg">Copiar mensaje para los RRPP</button></li>');
    const free = tables.filter(t => !(e.taken || []).includes(t.id)).length;
    if (tables.length && free > 0 && free <= 3) out.push('<li><span class="ic ic-warn">!</span><p>Quedan ' + free + ' mesas VIP libres.</p><button class="btn btn-sm" data-act="go" data-id="mesas">Ver mesas</button></li>');
    return out.length ? '<ul class="av">' + out.slice(0, 4).join("") + '</ul>' : '<p class="small muted">Todo en orden.</p>';
  }

  function render() {
    if (events === null) return;
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    if (!e) { el.innerHTML = '<section class="page"><div class="page-head"><p class="eyebrow">' + esc(ctx.org.name) + '</p><h1 class="h1">Resumen</h1></div>' + noEventsHtml(ctx) + '</section>'; return; }
    const tables = ctx.org.tables || [];
    const s = e.soldTotal || 0, cap = e.capacity || 0;
    const today = (e.daily || {})[new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())] || 0;
    const minSum = res.reduce((a, r) => a + (Number(r.min) || 0), 0), dep = res.reduce((a, r) => a + (Number(r.deposit) || 0), 0);
    const k4 = isLocal
      ? kpi("Barra (últimas 12 h)", eur(bar ? bar.total : 0), (bar ? bar.n : 0) + " cobros · incluye pedidos de mesa")
      : kpi("Lista de invitados", num(guests.length), guests.filter(g => g.inAt).length + " ya dentro");
    el.innerHTML = '<section class="page">' +
      '<div class="ph"><div class="ph-t"><p class="eyebrow">' + esc(ucf(fmtLong(e.date))) + ' · ' + esc(e.venueName || "") + '</p><h1 class="h1">' + esc(e.name) + '</h1></div>' + evPicks(events, e.id) + '</div>' +
      '<div class="kpis">' +
        kpi("Entradas vendidas", num(s) + '<span> / ' + num(cap) + '</span>', (cap ? Math.round(s / cap * 100) : 0) + ' % del aforo · ' + num(e.inside || 0) + ' dentro', cap ? s / cap * 100 : 0) +
        kpi("Ingresos por entradas", eur(e.revenue || 0), "Hoy: +" + num(today) + " entradas") +
        kpi("Mesas VIP", res.length + '<span> / ' + tables.length + '</span>', eur(minSum) + " en mínimos · " + eur(dep) + " de señal") +
        k4 +
      '</div>' +
      '<div class="pgrid">' +
        '<div class="card"><div class="card-h"><h2 class="h2">Ventas por día</h2><span class="small">Últimos 14 días · hoy en curso</span></div><div class="chart" id="chart"></div></div>' +
        '<div class="card"><div class="card-h"><h2 class="h2">Por tipo de entrada</h2></div>' + ((e.tiers || []).length ? (e.tiers || []).map(t => {
          const p = t.qty ? (t.sold || 0) / t.qty : 0;
          return '<div class="tb"><div class="tb-h"><b>' + esc(t.name) + '</b><span class="mono small">' + eur(t.price) + (t.hidden ? ' · oculta' : '') + '</span><span class="mono tb-n">' + num(t.sold || 0) + ' / ' + num(t.qty) + '</span></div><div class="bar' + (p >= 1 ? ' bar-full' : '') + '"><i style="width:' + Math.min(100, p * 100) + '%"></i></div></div>';
        }).join("") : '<p class="small muted">Sin tipos de entrada.</p>') + '</div>' +
        '<div class="card"><div class="card-h"><h2 class="h2">Avisos</h2></div>' + avisos() + '</div>' +
        '<div class="card"><div class="card-h"><h2 class="h2">Actividad</h2><span class="live">En directo</span></div><div id="feed">' + feedHtml(acts) + '</div></div>' +
      '</div></section>';
    drawDailyChart(el.querySelector("#chart"), e.daily || {});
  }

  const onResize = () => { const c = el.querySelector("#chart"); if (c && e) drawDailyChart(c, e.daily || {}); };
  window.addEventListener("resize", onResize);

  const actions = {
    pickEv(d) { setPicked(d.id); closeSheet(); e = (events || []).find(x => x.id === d.id) || e; subEvent(); render(); },
    pastEv() { openSheet(pastPicker(events)); },
    go(d) { ctx.go(d.id); },
    async publish(d, b) {
      b.disabled = true;
      try { await updateDoc(doc(db, "events", e.id), { published: true }); ctx.log("Evento publicado: " + e.name); toast("Publicado. Ya está a la venta."); }
      catch (x) { b.disabled = false; toast("No se pudo publicar."); }
    },
    async nextPhase(d, b) {
      b.disabled = true;
      try {
        const nm = await runTransaction(db, async tx => {
          const ref = doc(db, "events", e.id), s = await tx.get(ref), tiers = (s.data().tiers || []).map(t => Object.assign({}, t));
          const i = tiers.findIndex(t => t.id === d.id); if (i < 0) throw new Error("Esa entrada ya no existe.");
          const t = tiers[i], m = String(t.name).match(/(\d+)\s*ª\s*fase/i);
          const name = m ? (Number(m[1]) + 1) + "ª fase" : t.name + " (2)";
          t.nextDone = true;
          tiers.splice(i + 1, 0, { id: "t" + rid(6), name, price: Number(t.price) + 3, qty: 200, sold: 0 });
          tx.update(ref, { tiers });
          return name + " a " + eur(Number(t.price) + 3);
        });
        ctx.log("Nueva fase en " + e.name + ": " + nm);
        toast(nm + ", 200 entradas. Ya se ve en la web. Puedes cambiarla en Eventos.");
      } catch (x) { b.disabled = false; toast(x.message || "No se pudo crear la fase."); }
    },
    copyMsg() {
      const open = (e.tiers || []).filter(t => !t.hidden && (t.sold || 0) < t.qty);
      const txt = "🔥 " + e.name + " (" + fmtLong(e.date) + ") va al " + Math.round((e.soldTotal || 0) / (e.capacity || 1) * 100) + " % vendido." +
        (open.length ? " Ahora mismo: " + open[0].name + " a " + eur(open[0].price) + "." : "") +
        " Pasad vuestro enlace, que vuela: " + siteUrl("/evento.html?id=" + e.id) + "&rrpp=TU_CODIGO";
      copyText(txt, "Mensaje copiado. Pégalo en el grupo de RRPP.");
    }
  };
  const off1 = delegate(el, actions), off2 = delegate(sheetBody(), { pickEv: actions.pickEv });

  return () => { offs.forEach(f => f()); evOffs.forEach(f => f()); off1(); off2(); window.removeEventListener("resize", onResize); };
}
