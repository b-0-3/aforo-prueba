// Entradas: quién ha comprado cada evento. Buscar, cambiar el nombre, anular y descargar en Excel.
import { db, collection, doc, query, where, onSnapshot, runTransaction, serverTimestamp, increment } from "../../firebase.js";
import { esc, eur, num, fmtDay, fmtTime, delegate, openSheet, setSheet, closeSheet, sheetBody, toast, norm, downloadCsv } from "../../ui.js";
import { PAGOS } from "../../config.js";
import { watchOrgEvents, pickEvent, setPicked, evPicks, pastPicker, confirmTap, errHtml, noEventsHtml, kpi, keepInputs } from "../common.js";

const MAX_SHOWN = 150;

export default function (ctx, el) {
  let events = null, e = null, loadErr = null, list = null, team = [], filter = "", state = "todas", editing = null;
  const offs = []; let tOff = null;
  offs.push(watchOrgEvents(ctx, (l, er) => { events = l; loadErr = er || null; const prev = e && e.id; e = pickEvent(l); if ((e && e.id) !== prev) sub(); render(); }));
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "rrpp"), s => { team = s.docs.map(d => Object.assign({ id: d.id }, d.data())); }, () => {}));

  function sub() {
    if (tOff) tOff(); list = null;
    if (!e) return;
    tOff = onSnapshot(query(collection(db, "orgs", ctx.orgId, "tickets"), where("eventId", "==", e.id)), s => {
      list = s.docs.map(d => Object.assign({ code: d.id }, d.data({ serverTimestamps: "estimate" })))
        .sort((a, b) => (b.createdAt ? b.createdAt.toMillis() : 0) - (a.createdAt ? a.createdAt.toMillis() : 0));
      paintList();
    }, er => { loadErr = er; render(); });
  }

  const rrName = id => id ? ((team.find(r => r.id === id) || {}).name || "RRPP") : "";
  const status = t => t.voided ? ["Anulada", "bad"] : t.usedAt ? ["Dentro " + fmtTime(t.usedAt), "ok"] : ["Válida", ""];
  function filtered() {
    const f = norm(filter.trim());
    return (list || []).filter(t => {
      if (state === "dentro" && !(t.usedAt && !t.voided)) return false;
      if (state === "fuera" && (t.usedAt || t.voided)) return false;
      if (state === "anuladas" && !t.voided) return false;
      return !f || norm(t.buyerName).includes(f) || norm(t.email).includes(f) || norm(t.code).includes(f);
    });
  }

  function listHtml() {
    if (list === null) return '<div class="loading"><span class="spin spin-sm"></span>Cargando entradas…</div>';
    if (!list.length) return '<p class="small muted">Aún no se ha vendido ninguna entrada de este evento.</p>';
    const f = filtered();
    if (!f.length) return '<p class="small muted">Ninguna entrada coincide.</p>';
    return '<ul class="gl">' + f.slice(0, MAX_SHOWN).map(t => {
      const st = status(t);
      return '<li><div><b>' + esc(t.buyerName || "Sin nombre") + '</b><span class="small"><span class="mono">' + esc(t.code) + '</span> · ' + esc(t.tierName || "Entrada") + ' · ' + eur(t.price) + (t.rrppId ? ' · ' + esc(rrName(t.rrppId)) : '') + '</span>' +
        (t.email ? '<span class="small muted">' + esc(t.email) + '</span>' : '') + '</div>' +
        '<div class="gl-act"><span class="chip ' + (st[1] ? 'chip-' + st[1] : '') + '">' + st[0] + '</span><button class="btn btn-sm" data-act="open" data-id="' + esc(t.code) + '">Gestionar</button></div></li>';
    }).join("") + '</ul>' + (f.length > MAX_SHOWN ? '<p class="hint">Se muestran ' + MAX_SHOWN + ' de ' + f.length + '. Usa el buscador o descarga el Excel para verlas todas.</p>' : '');
  }
  function statsHtml() {
    const l = list || [], used = l.filter(t => t.usedAt && !t.voided).length, voided = l.filter(t => t.voided).length, valid = l.length - voided;
    return '<div class="kpis kpis-3">' + kpi("Entradas", num(valid), voided ? voided + " anuladas" : "vendidas online") +
      kpi("Dentro", num(used), valid ? Math.round(used / valid * 100) + " % de las vendidas" : "—", valid ? used / valid * 100 : 0) +
      kpi("Importe", eur(l.filter(t => !t.voided).reduce((a, t) => a + (Number(t.price) || 0), 0)), "sin gastos de gestión") + '</div>';
  }
  function paintList() {
    const box = el.querySelector("#tList"); if (box) box.innerHTML = listHtml();
    const st = el.querySelector("#tStats"); if (st) st.innerHTML = statsHtml();
  }

  function render() {
    if (events === null) return;
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    if (!e) { el.innerHTML = '<section class="page"><h1 class="h1">Entradas</h1>' + noEventsHtml(ctx) + '</section>'; return; }
    keepInputs(el, () => {
      el.innerHTML = '<section class="page"><div class="ph"><div class="ph-t"><p class="eyebrow">' + esc(e.name) + ' · ' + esc(fmtDay(e.date)) + '</p><h1 class="h1">Entradas</h1></div>' + evPicks(events, e.id) + '</div>' +
        '<div id="tStats">' + statsHtml() + '</div>' +
        (ctx.org.demo ? '<p class="hint">En la demo aquí solo salen las entradas que han comprado los visitantes. Las cifras del resumen incluyen ventas de ejemplo.</p>' : '') +
        '<div class="card"><div class="row" style="justify-content:space-between">' +
          '<div class="picks">' + [["todas", "Todas"], ["fuera", "Sin entrar"], ["dentro", "Dentro"], ["anuladas", "Anuladas"]].map(x => '<button class="pick" data-act="state" data-id="' + x[0] + '" aria-pressed="' + (state === x[0]) + '">' + x[1] + '</button>').join("") + '</div>' +
          '<button class="btn btn-sm" data-act="csv">Descargar Excel</button></div>' +
          '<div class="field"><label for="tSearch" class="sr">Buscar</label><input id="tSearch" type="search" placeholder="Buscar por nombre, email o código" autocomplete="off"></div>' +
          '<div id="tList">' + listHtml() + '</div></div></section>';
    });
  }

  /* ---------- gestionar una entrada ---------- */
  function sheetHtml(err) {
    const t = (list || []).find(x => x.code === editing); if (!t) return '<p>Esta entrada ya no existe.</p>';
    const st = status(t);
    return '<form id="tkForm" class="form" novalidate><p class="eyebrow">' + esc(e.name) + '</p><h2 class="h2 sheet-t mono">' + esc(t.code) + '</h2>' +
      '<p><span class="chip ' + (st[1] ? 'chip-' + st[1] : '') + '">' + st[0] + '</span></p>' +
      '<ul class="sum"><li><span>Tipo</span><span>' + esc(t.tierName || "Entrada") + '</span></li><li><span>Precio</span><span class="mono">' + eur(t.price) + '</span></li>' +
        '<li><span>Comprada</span><span>' + (t.createdAt ? esc(fmtDay(t.createdAt)) + ' ' + fmtTime(t.createdAt) : '—') + '</span></li>' +
        (t.rrppId ? '<li><span>RRPP</span><span>' + esc(rrName(t.rrppId)) + '</span></li>' : '') + (t.email ? '<li><span>Email</span><span>' + esc(t.email) + '</span></li>' : '') + '</ul>' +
      '<div class="field"><label for="tkName">Nombre en la entrada</label><input id="tkName" value="' + esc(t.buyerName || "") + '" autocomplete="off"' + (t.voided ? ' disabled' : '') + '></div>' +
      (err ? '<p class="err">' + esc(err) + '</p>' : '') +
      (t.voided ? '' : '<button class="btn btn-primary btn-block" type="submit">Guardar nombre</button>') +
      (t.voided
        ? '<button type="button" class="btn btn-block" data-act="unvoid">Volver a activarla</button>'
        : (t.usedAt ? '<p class="hint">Ya ha entrado: no se puede anular.</p>' : '<button type="button" class="btn btn-danger btn-block" data-act="void">Anular entrada</button>' +
           '<p class="hint">Al anularla, la puerta la rechaza y la plaza vuelve a quedar libre.' + (PAGOS === "prueba" ? '' : ' La devolución del dinero se hace desde tu panel de Stripe.') + '</p>')) +
      '</form>';
  }
  // Anular (+1) o reactivar (-1): marca la entrada y corrige ventas, ingresos y comisión del RRPP
  async function setVoid(t, voided) {
    await runTransaction(db, async tx => {
      const tref = doc(db, "orgs", ctx.orgId, "tickets", t.code), eref = doc(db, "events", e.id);
      const [ts, es] = [await tx.get(tref), await tx.get(eref)];
      const rref = t.rrppId ? doc(db, "orgs", ctx.orgId, "rrpp", t.rrppId) : null;
      const rs = rref ? await tx.get(rref) : null;
      const cur = ts.data();
      if (!!cur.voided === voided) return;
      if (voided && cur.usedAt) throw new Error("Esa entrada ya ha entrado.");
      const tiers = (es.data().tiers || []).map(x => Object.assign({}, x)), tier = tiers.find(x => x.id === cur.tierId);
      const d = voided ? -1 : 1;
      if (tier) {
        if (d > 0 && (tier.sold || 0) >= tier.qty) throw new Error("No quedan plazas libres de " + tier.name + " para reactivarla.");
        tier.sold = Math.max(0, (tier.sold || 0) + d);
      }
      tx.update(tref, voided ? { voided: true, voidedAt: serverTimestamp(), voidedBy: ctx.uid } : { voided: false });
      tx.update(eref, { tiers, soldTotal: increment(d), revenue: increment(d * (Number(cur.price) || 0)) });
      if (rs && rs.exists()) tx.update(rref, { ["sold." + e.id]: increment(d), soldTotal: increment(d), earned: increment(d * (Number(rs.data().perTicket) || 0)) });
    });
    ctx.log((voided ? "Entrada anulada: " : "Entrada reactivada: ") + t.code + " · " + (t.buyerName || ""));
  }

  const onSubmit = async ev => {
    if (ev.target.id !== "tkForm") return; ev.preventDefault();
    const t = (list || []).find(x => x.code === editing), name = sheetBody().querySelector("#tkName").value.trim();
    if (!t) return;
    if (!name) { setSheet(sheetHtml("Escribe un nombre.")); return; }
    try {
      await runTransaction(db, async tx => { tx.update(doc(db, "orgs", ctx.orgId, "tickets", t.code), { buyerName: name }); });
      ctx.log("Cambio de nombre en " + t.code + ": " + (t.buyerName || "") + " → " + name);
      closeSheet(); toast("Nombre cambiado.");
    } catch (x) { console.error(x); setSheet(sheetHtml("No se pudo guardar.")); }
  };
  sheetBody().addEventListener("submit", onSubmit);
  const onInput = ev => { if (ev.target.id === "tSearch") { filter = ev.target.value; paintList(); } };
  el.addEventListener("input", onInput);

  const actions = {
    pickEv(d) { setPicked(d.id); closeSheet(); e = events.find(x => x.id === d.id) || e; filter = ""; const s = el.querySelector("#tSearch"); if (s) s.value = ""; sub(); render(); },
    pastEv() { openSheet(pastPicker(events)); },
    state(d) { state = d.id; el.querySelectorAll('[data-act="state"]').forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === state))); paintList(); },
    open(d) { editing = d.id; openSheet(sheetHtml()); },
    csv() {
      if (!list || !list.length) { toast("No hay entradas que descargar."); return; }
      downloadCsv("Entradas " + e.name + " " + fmtDay(e.date), [["Código", "Nombre", "Email", "Tipo", "Precio", "RRPP", "Comprada", "Estado", "Hora de entrada"]]
        .concat(list.map(t => [t.code, t.buyerName || "", t.email || "", t.tierName || "", Number(t.price) || 0, rrName(t.rrppId), t.createdAt || "", t.voided ? "Anulada" : t.usedAt ? "Dentro" : "Válida", t.usedAt || ""])));
    }
  };
  const sheetActs = {
    pickEv: actions.pickEv,
    void(d, b) {
      const t = (list || []).find(x => x.code === editing); if (!t) return;
      confirmTap(b, "¿Anular? Toca otra vez", async () => {
        try { await setVoid(t, true); closeSheet(); toast("Entrada anulada."); } catch (x) { setSheet(sheetHtml(x.message || "No se pudo anular.")); }
      });
    },
    async unvoid(d, b) {
      const t = (list || []).find(x => x.code === editing); if (!t) return; b.disabled = true;
      try { await setVoid(t, false); closeSheet(); toast("Entrada activada otra vez."); } catch (x) { setSheet(sheetHtml(x.message || "No se pudo activar.")); }
    }
  };
  const offV = delegate(el, actions), offS = delegate(sheetBody(), sheetActs);
  return () => { offs.forEach(f => f()); if (tOff) tOff(); offV(); offS(); sheetBody().removeEventListener("submit", onSubmit); el.removeEventListener("input", onInput); };
}
