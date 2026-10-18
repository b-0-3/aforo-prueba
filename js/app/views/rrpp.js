// RRPP: equipo de relaciones públicas, sus enlaces, ventas y comisiones.
import { db, collection, doc, onSnapshot, updateDoc, setDoc, writeBatch, deleteField, serverTimestamp } from "../../firebase.js";
import { esc, eur, num, delegate, openSheet, setSheet, closeSheet, sheetBody, toast, copyText, shareOrCopy, rid, norm } from "../../ui.js";
import { confirmTap, errHtml, siteUrl } from "../common.js";

export const rrppLink = (orgId, code) => siteUrl("/eventos.html?o=" + encodeURIComponent(orgId) + "&rrpp=" + encodeURIComponent(code));

export default function (ctx, el) {
  let list = null, members = [], loadErr = null, editing = null;
  const offs = [];
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "rrpp"), s => { list = s.docs.map(d => Object.assign({ id: d.id }, d.data())); render(); }, e => { loadErr = e; render(); }));
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "members"), s => { members = s.docs.map(d => d.data()); render(); }, () => {}));

  const pending = r => Math.max(0, (Number(r.earned) || 0) - (Number(r.paid) || 0));

  function render() {
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    if (list === null) return;
    const sorted = list.slice().sort((a, b) => (b.soldTotal || 0) - (a.soldTotal || 0));
    const totalPend = sorted.reduce((a, r) => a + pending(r), 0);
    el.innerHTML = '<section class="page"><div class="ph"><div class="ph-t"><p class="eyebrow">' + sorted.length + ' personas · ' + eur(totalPend) + ' pendientes de pagar</p><h1 class="h1">RRPP</h1>' +
      '<p class="lead">Cada RRPP vende con su propio enlace. Sus ventas y su comisión se apuntan solas. Invítales a la app para que vean sus números y apunten su lista.</p></div>' +
      '<button class="btn btn-primary" data-act="new">Añadir RRPP</button></div>' +
      '<div class="card rrlist">' + (sorted.length ? sorted.map((r, i) => {
        const hasApp = members.some(m => m.rrppId === r.id);
        return '<div class="rr"><span class="rr-n mono">' + (i + 1) + '</span><div class="rr-who"><b>' + esc(r.name) + (hasApp ? ' <span class="chip chip-ok">Con app</span>' : '') + '</b>' +
          '<span class="small">Código <span class="mono">' + esc(r.code) + '</span> · ' + eur(r.perTicket || 0) + ' por entrada · ' + (r.tablePct || 0) + ' % de mesas</span></div>' +
          '<div class="rr-stats"><div class="rr-st"><span class="kpi-l">Entradas</span><b class="mono">' + num(r.soldTotal || 0) + '</b></div><div class="rr-st"><span class="kpi-l">Mesas</span><b class="mono">' + num(r.tablesCount || 0) + '</b></div><div class="rr-st"><span class="kpi-l">Pendiente</span><b class="mono">' + eur(pending(r)) + '</b></div></div>' +
          '<div class="rr-act"><button class="btn btn-sm" data-act="copy" data-id="' + r.id + '">Copiar enlace</button>' +
          (pending(r) > 0 ? '<button class="btn btn-sm" data-act="pay" data-id="' + r.id + '">Pagar ' + eur(pending(r)) + '</button>' : '') +
          '<button class="btn btn-sm" data-act="edit" data-id="' + r.id + '">Editar</button>' +
          (hasApp ? '' : '<button class="btn btn-sm" data-act="invite" data-id="' + r.id + '">Invitar a la app</button>') + '</div></div>';
      }).join("") : '<p class="small muted" style="padding:10px 0">Aún no tienes RRPP. Añade el primero y pásale su enlace.</p>') + '</div></section>';
  }

  function formHtml(err) {
    const r = editing;
    return '<form id="rrForm" class="form" novalidate><p class="eyebrow">' + (r.id ? 'Editar RRPP' : 'Nuevo RRPP') + '</p><h2 class="h2 sheet-t">' + esc(r.name || "RRPP") + '</h2>' +
      '<div class="grid2"><div class="field"><label for="rName">Nombre y apellido</label><input id="rName" required value="' + esc(r.name || "") + '" autocomplete="off"></div>' +
      '<div class="field"><label for="rCode">Código del enlace</label><input id="rCode" value="' + esc(r.code || "") + '" placeholder="Ej. ANA" autocomplete="off" autocapitalize="characters"' + (r.id && (r.soldTotal || 0) > 0 ? ' disabled' : '') + '></div></div>' +
      '<div class="grid2"><div class="field"><label for="rPer">Comisión por entrada (€)</label><input id="rPer" type="number" inputmode="decimal" min="0" step="0.25" value="' + esc(r.perTicket != null ? r.perTicket : 1.5) + '"></div>' +
      '<div class="field"><label for="rPct">Comisión de mesas VIP (% del mínimo)</label><input id="rPct" type="number" inputmode="numeric" min="0" max="50" value="' + esc(r.tablePct != null ? r.tablePct : 10) + '"></div></div>' +
      (r.id && (r.soldTotal || 0) > 0 ? '<p class="hint">El código no se puede cambiar porque ya tiene ventas. Si cambias la comisión, cuenta solo para las ventas nuevas.</p>' : '<p class="hint">El código va en su enlace. Solo letras y números, sin espacios.</p>') +
      (err ? '<p class="err">' + esc(err) + '</p>' : '') +
      '<button class="btn btn-primary btn-block" type="submit">' + (r.id ? 'Guardar' : 'Añadir y copiar su enlace') + '</button>' +
      (r.id && !(r.soldTotal > 0) && !(r.tablesCount > 0) ? '<button type="button" class="btn btn-danger btn-block" data-act="del">Borrar este RRPP</button>' : '') + '</form>';
  }

  async function saveForm() {
    const r = editing;
    const name = document.getElementById("rName").value.trim();
    const codeEl = document.getElementById("rCode");
    let code = norm(codeEl.value || name.split(" ")[0]).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    const perTicket = Math.max(0, Number(document.getElementById("rPer").value) || 0);
    const tablePct = Math.max(0, Math.min(50, Number(document.getElementById("rPct").value) || 0));
    if (!name) { setSheet(formHtml("Escribe el nombre.")); return; }
    if (!code) { setSheet(formHtml("Escribe un código.")); return; }
    if (!codeEl.disabled && list.some(x => x.code === code && x.id !== r.id)) { setSheet(formHtml("Ese código ya lo tiene " + list.find(x => x.code === code).name + ". Elige otro.")); return; }
    try {
      // El código, la comisión y el id se guardan también en la ficha pública del local (rrppCodes)
      // para que una compra con ?rrpp=CODIGO sepa a quién apuntarle la venta.
      const batch = writeBatch(db), orgRef = doc(db, "orgs", ctx.orgId);
      if (r.id) {
        const data = { name, perTicket, tablePct }; if (!codeEl.disabled) data.code = code;
        const finalCode = codeEl.disabled ? r.code : code;
        batch.update(doc(db, "orgs", ctx.orgId, "rrpp", r.id), data);
        const map = { ["rrppCodes." + finalCode]: { id: r.id, perTicket, tablePct } };
        if (r.code && r.code !== finalCode) map["rrppCodes." + r.code] = deleteField();
        batch.update(orgRef, map);
        await batch.commit();
        closeSheet(); toast("Guardado.");
      } else {
        const ref = doc(collection(db, "orgs", ctx.orgId, "rrpp"));
        batch.set(ref, { name, code, perTicket, tablePct, sold: {}, soldTotal: 0, earned: 0, paid: 0, tablesCount: 0, createdAt: serverTimestamp() });
        batch.update(orgRef, { ["rrppCodes." + code]: { id: ref.id, perTicket, tablePct } });
        await batch.commit();
        ctx.log(name + " se une al equipo de RRPP");
        closeSheet(); copyText(rrppLink(ctx.orgId, code), name.split(" ")[0] + " añadido. Su enlace está copiado.");
      }
    } catch (x) { console.error(x); setSheet(formHtml("No se pudo guardar. Inténtalo otra vez.")); }
  }

  async function invite(r) {
    const code = rid(20);
    openSheet('<div class="paying"><div class="spin"></div><p class="small">Creando invitación…</p></div>');
    try {
      await setDoc(doc(db, "invites", code), { orgId: ctx.orgId, orgName: ctx.org.name, role: "rrpp", rrppId: r.id, name: r.name, used: false, usedBy: null, createdBy: ctx.uid, createdAt: serverTimestamp() });
      const url = siteUrl("/app/unirse.html?c=" + code);
      setSheet('<p class="eyebrow">Invitación para ' + esc(r.name) + '</p><h2 class="h2 sheet-t">Pásale este enlace</h2><p class="small">Con él crea su usuario y entra directamente a su panel de RRPP. Sirve para una sola persona.</p>' +
        '<p class="mono linktext">' + esc(url) + '</p><div class="row"><button class="btn btn-primary" data-act="shareInv" data-url="' + esc(url) + '">Enviar</button><button class="btn" data-act="copyInv" data-url="' + esc(url) + '">Copiar</button></div>');
    } catch (x) { setSheet('<p class="err">No se pudo crear la invitación.</p>'); }
  }

  const onSubmit = ev => { if (ev.target.id === "rrForm") { ev.preventDefault(); saveForm(); } };
  sheetBody().addEventListener("submit", onSubmit);
  const offS = delegate(sheetBody(), {
    shareInv(d) { shareOrCopy("Únete a " + ctx.org.name + " en Aforo", d.url); },
    copyInv(d) { copyText(d.url, "Invitación copiada."); },
    del(d, b) {
      confirmTap(b, "¿Seguro? Toca otra vez", async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, "orgs", ctx.orgId, "rrpp", editing.id));
          batch.update(doc(db, "orgs", ctx.orgId), { ["rrppCodes." + editing.code]: deleteField() });
          await batch.commit(); closeSheet(); toast("RRPP borrado.");
        } catch (x) { toast("No se pudo borrar."); }
      });
    }
  });
  const offV = delegate(el, {
    new() { editing = {}; openSheet(formHtml()); },
    edit(d) { editing = list.find(x => x.id === d.id); if (editing) openSheet(formHtml()); },
    copy(d) { const r = list.find(x => x.id === d.id); if (r) copyText(rrppLink(ctx.orgId, r.code), "Enlace de " + r.name.split(" ")[0] + " copiado."); },
    invite(d) { const r = list.find(x => x.id === d.id); if (r) invite(r); },
    pay(d, b) {
      const r = list.find(x => x.id === d.id); if (!r) return;
      const amount = pending(r);
      confirmTap(b, "¿Le has pagado " + eur(amount) + "? Toca otra vez", async () => {
        try { await updateDoc(doc(db, "orgs", ctx.orgId, "rrpp", r.id), { paid: Number(r.earned) || 0 }); ctx.log("Comisión pagada a " + r.name + ": " + eur(amount)); toast("Apuntado: " + r.name + " está al día."); }
        catch (x) { toast("No se pudo guardar."); }
      });
    }
  });
  return () => { offs.forEach(f => f()); offV(); offS(); sheetBody().removeEventListener("submit", onSubmit); };
}
