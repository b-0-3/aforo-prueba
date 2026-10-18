// Equipo: quién tiene acceso y con qué rol. Invitaciones por enlace.
import { db, collection, doc, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp } from "../../firebase.js";
import { esc, delegate, openSheet, setSheet, closeSheet, sheetBody, toast, copyText, shareOrCopy, rid, ago } from "../../ui.js";
import { ROLE_NAMES } from "../account.js";
import { confirmTap, errHtml, siteUrl } from "../common.js";

const ROLE_HELP = {
  admin: "Encargado: todo menos los cobros de Stripe.",
  puerta: "Puerta: escanea entradas y deja pasar a la lista.",
  barra: "Barra: cobra y ve los pedidos de mesa.",
  rrpp: "RRPP: su enlace, sus ventas y su lista."
};

export default function (ctx, el) {
  let members = null, invites = [], team = [], loadErr = null, form = { role: "puerta" };
  const offs = [];
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "members"), s => { members = s.docs.map(d => Object.assign({ uid: d.id }, d.data())); render(); }, e => { loadErr = e; render(); }));
  offs.push(onSnapshot(query(collection(db, "invites"), where("orgId", "==", ctx.orgId), where("used", "==", false)), s => { invites = s.docs.map(d => Object.assign({ code: d.id }, d.data())); render(); }, () => {}));
  offs.push(onSnapshot(collection(db, "orgs", ctx.orgId, "rrpp"), s => { team = s.docs.map(d => Object.assign({ id: d.id }, d.data())); }, () => {}));

  function render() {
    if (loadErr) { el.innerHTML = errHtml(loadErr); return; }
    if (members === null) return;
    const order = { owner: 0, admin: 1, puerta: 2, barra: 3, rrpp: 4 };
    const list = members.slice().sort((a, b) => (order[a.role] - order[b.role]) || String(a.name).localeCompare(String(b.name)));
    el.innerHTML = '<section class="page narrow"><div class="ph"><div class="ph-t"><p class="eyebrow">' + esc(ctx.org.name) + '</p><h1 class="h1">Equipo</h1><p class="lead">Invita a tu gente con un enlace. Cada uno ve solo lo que necesita para su trabajo.</p></div><button class="btn btn-primary" data-act="new">Invitar</button></div>' +
      '<div class="card"><div class="card-h"><h2 class="h2">Con acceso</h2><span class="small">' + list.length + ' personas</span></div><ul class="gl">' + list.map(m => {
        const me = m.uid === ctx.uid, canEdit = m.role !== "owner" && !me && (ctx.isOwner() || m.role !== "admin");
        const rp = m.rrppId ? team.find(r => r.id === m.rrppId) : null;
        return '<li><div><b>' + esc(m.name || m.email) + (me ? ' <span class="chip">Tú</span>' : '') + '</b><span class="small">' + esc(m.email || "") + (rp ? ' · ficha RRPP: ' + esc(rp.name) : '') + '</span></div><div class="gl-act">' +
          (canEdit && m.role !== "rrpp"
            ? '<label class="sr" for="role-' + m.uid + '">Rol</label><select id="role-' + m.uid + '" data-uid="' + m.uid + '" style="min-height:36px;padding:6px 8px;width:auto">' + ["admin", "puerta", "barra"].map(r => '<option value="' + r + '"' + (m.role === r ? ' selected' : '') + '>' + ROLE_NAMES[r] + '</option>').join("") + '</select>'
            : '<span class="chip ' + (m.role === "owner" ? 'chip-rope' : '') + '">' + esc(ROLE_NAMES[m.role] || m.role) + '</span>') +
          (canEdit ? '<button class="icon-btn" data-act="remove" data-id="' + m.uid + '" aria-label="Quitar acceso">×</button>' : '') + '</div></li>';
      }).join("") + '</ul></div>' +
      (invites.length ? '<div class="card"><div class="card-h"><h2 class="h2">Invitaciones sin usar</h2></div><ul class="gl">' + invites.map(i =>
        '<li><div><b>' + esc(i.name || "Sin nombre") + '</b><span class="small">' + esc(ROLE_NAMES[i.role] || i.role) + (i.createdAt ? ' · creada ' + esc(ago(i.createdAt)) : '') + '</span></div><div class="gl-act"><button class="btn btn-sm" data-act="copyInv" data-id="' + i.code + '">Copiar enlace</button><button class="icon-btn" data-act="delInv" data-id="' + i.code + '" aria-label="Borrar invitación">×</button></div></li>').join("") + '</ul></div>' : '') +
      '</section>';
  }

  function formHtml(err) {
    return '<form id="invForm" class="form" novalidate><p class="eyebrow">Invitar al equipo</p><h2 class="h2 sheet-t">Nueva invitación</h2>' +
      '<div class="field"><label for="iName">¿Para quién? (para que lo reconozcas)</label><input id="iName" value="' + esc(form.name || "") + '" placeholder="Ej. Dani (portero)" autocomplete="off"></div>' +
      '<div class="field"><span class="lbl">Rol</span><div class="picks">' + ["puerta", "barra", "rrpp", "admin"].map(r => '<button type="button" class="pick" data-act="role" data-id="' + r + '" aria-pressed="' + (form.role === r) + '">' + ROLE_NAMES[r] + '</button>').join("") + '</div><p class="hint">' + esc(ROLE_HELP[form.role]) + '</p></div>' +
      (form.role === "rrpp" ? '<div class="field"><label for="iRrpp">Su ficha de RRPP</label><select id="iRrpp">' + (team.length ? team.map(r => '<option value="' + r.id + '">' + esc(r.name) + ' · ' + esc(r.code) + '</option>').join("") : '<option value="">Primero crea la ficha en RRPP</option>') + '</select></div>' : '') +
      (err ? '<p class="err">' + esc(err) + '</p>' : '') + '<button class="btn btn-primary btn-block" type="submit">Crear enlace de invitación</button></form>';
  }

  async function create() {
    form.name = sheetBody().querySelector("#iName").value.trim();
    const rrppId = form.role === "rrpp" ? (sheetBody().querySelector("#iRrpp") || {}).value || null : null;
    if (form.role === "rrpp" && !rrppId) { setSheet(formHtml("Crea antes su ficha en la sección RRPP.")); return; }
    if (form.role === "admin" && !ctx.isOwner()) { setSheet(formHtml("Solo el dueño puede invitar encargados.")); return; }
    const code = rid(20);
    try {
      await setDoc(doc(db, "invites", code), { orgId: ctx.orgId, orgName: ctx.org.name, role: form.role, rrppId, name: form.name || (rrppId ? (team.find(r => r.id === rrppId) || {}).name : ""), used: false, usedBy: null, createdBy: ctx.uid, createdAt: serverTimestamp() });
      const url = siteUrl("/app/unirse.html?c=" + code);
      setSheet('<p class="eyebrow">Invitación · ' + esc(ROLE_NAMES[form.role]) + '</p><h2 class="h2 sheet-t">Pásale este enlace</h2><p class="small">Con él crea su usuario y entra directo a lo suyo. Sirve para una sola persona.</p>' +
        '<p class="mono linktext">' + esc(url) + '</p><div class="row"><button class="btn btn-primary" data-act="shareUrl" data-url="' + esc(url) + '">Enviar</button><button class="btn" data-act="copyUrl" data-url="' + esc(url) + '">Copiar</button></div>');
    } catch (x) { console.error(x); setSheet(formHtml("No se pudo crear la invitación.")); }
  }

  const onSubmit = ev => { if (ev.target.id === "invForm") { ev.preventDefault(); create(); } };
  sheetBody().addEventListener("submit", onSubmit);
  const onChange = async ev => {
    const s = ev.target; if (!s.dataset || !s.dataset.uid) return;
    try { await updateDoc(doc(db, "orgs", ctx.orgId, "members", s.dataset.uid), { role: s.value }); toast("Rol cambiado a " + ROLE_NAMES[s.value] + "."); }
    catch (x) { toast("No se pudo cambiar el rol."); render(); }
  };
  el.addEventListener("change", onChange);
  const offS = delegate(sheetBody(), {
    role(d) { form.name = (sheetBody().querySelector("#iName") || {}).value || form.name; form.role = d.id; setSheet(formHtml()); },
    shareUrl(d) { shareOrCopy("Únete a " + ctx.org.name + " en Aforo", d.url); },
    copyUrl(d) { copyText(d.url, "Invitación copiada."); }
  });
  const offV = delegate(el, {
    new() { form = { role: "puerta" }; openSheet(formHtml()); },
    copyInv(d) { copyText(siteUrl("/app/unirse.html?c=" + d.id), "Invitación copiada."); },
    delInv(d, b) { confirmTap(b, "¿Borrar?", async () => { try { await deleteDoc(doc(db, "invites", d.id)); } catch (x) { toast("No se pudo borrar."); } }); },
    remove(d, b) {
      const m = members.find(x => x.uid === d.id);
      confirmTap(b, "¿Quitar?", async () => {
        try { await deleteDoc(doc(db, "orgs", ctx.orgId, "members", d.id)); ctx.log("Acceso quitado a " + (m ? m.name || m.email : "")); toast("Acceso quitado."); }
        catch (x) { toast("No se pudo quitar."); }
      });
    }
  });
  return () => { offs.forEach(f => f()); offV(); offS(); sheetBody().removeEventListener("submit", onSubmit); el.removeEventListener("change", onChange); };
}
