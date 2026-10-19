// Estructura del panel: comprueba quién ha entrado, carga su local y muestra
// solo las secciones de su rol. Cada sección vive en js/app/views/<nombre>.js
import {
  configured, auth, db, onAuthStateChanged, signOut, doc, getDoc, onSnapshot, addDoc, collection,
  serverTimestamp, notConfiguredHtml
} from "../firebase.js";
import { $, esc, toast, closeSheet, delegate, url } from "../ui.js";
import { createOrg, authError, ROLE_NAMES } from "./account.js";

const ADMIN = ["owner", "admin"];
const ROUTES = [
  { id: "resumen", label: "Resumen", roles: ADMIN },
  { id: "eventos", label: "Eventos", roles: ADMIN },
  { id: "entradas", label: "Entradas", roles: ADMIN },
  { id: "rrpp", label: "RRPP", roles: ADMIN },
  { id: "listas", label: "Listas", roles: ADMIN },
  { id: "mesas", label: "Mesas VIP", roles: ADMIN },
  { id: "puerta", label: "Puerta", roles: ADMIN.concat(["puerta"]) },
  { id: "barra", label: "Barra", roles: ADMIN.concat(["barra"]), when: c => c.org && (c.org.type === "local" || c.role === "barra") },
  { id: "mipanel", label: "Mi panel", roles: ["rrpp"] },
  { id: "equipo", label: "Equipo", roles: ADMIN },
  { id: "ajustes", label: "Ajustes", roles: ADMIN }
];

const view = $("#view");
const ctx = {
  db, auth, user: null, uid: null, orgId: null, org: null, member: null, role: null,
  isAdmin: () => ADMIN.includes(ctx.role),
  isOwner: () => ctx.role === "owner",
  go: r => { if (location.hash === "#" + r) route(); else location.hash = r; },
  log: (text, amount, kind) => addDoc(collection(db, "orgs", ctx.orgId, "activity"), { text, amount: amount || 0, kind: kind || "equipo", by: ctx.uid, createdAt: serverTimestamp() }).catch(() => {}),
  onOrg: fn => { orgListeners.add(fn); return () => orgListeners.delete(fn); }
};
const orgListeners = new Set();
let cleanup = null, routeToken = 0, started = false;

const allowed = () => ROUTES.filter(r => r.roles.includes(ctx.role) && (!r.when || r.when(ctx)));
const home = () => ({ puerta: "puerta", barra: "barra", rrpp: "mipanel" }[ctx.role] || "resumen");

function header() {
  $("#orgName").textContent = ctx.org ? ctx.org.name : "";
  $("#demoBar").hidden = !(ctx.org && ctx.org.demo);
  $("#logout").hidden = false;
  const site = $("#siteLink");
  if (ctx.org && ctx.isAdmin()) { site.hidden = false; site.href = url("eventos.html?o=" + encodeURIComponent(ctx.orgId)); }
  const cur = (location.hash.slice(1) || home()).split("?")[0];
  $("#tabs").innerHTML = allowed().map(r => '<a class="tab" href="#' + r.id + '"' + (r.id === cur ? ' aria-current="page"' : '') + '>' + r.label + '</a>').join("") +
    (ctx.role && !ctx.isAdmin() ? '<span class="tab" style="margin-left:auto;cursor:default">' + esc(ROLE_NAMES[ctx.role] || "") + '</span>' : '');
}

async function route() {
  if (!ctx.org) return;
  const name = (location.hash.slice(1) || home()).split("?")[0];
  const r = allowed().find(x => x.id === name);
  if (!r) { location.replace("#" + home()); return; }
  const token = ++routeToken;
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  closeSheet();
  header();
  view.innerHTML = '<div class="loading"><span class="spin spin-sm"></span>Cargando…</div>';
  window.scrollTo(0, 0);
  try {
    const mod = await import("./views/" + r.id + ".js");
    if (token !== routeToken) return;
    const c = await mod.default(ctx, view);
    if (token !== routeToken) { if (typeof c === "function") c(); return; }
    cleanup = typeof c === "function" ? c : null;
  } catch (e) {
    console.error(e);
    view.innerHTML = '<div class="notice"><b>No se ha podido abrir esta sección.</b><p class="small">' + esc(authError(e)) + '</p><button class="btn btn-sm" onclick="location.reload()">Recargar</button></div>';
  }
}

function onboarding() {
  view.innerHTML = '<div class="auth" style="margin-top:0"><div class="page-head"><p class="eyebrow">Último paso</p><h1 class="h1">Crea tu local o promotora</h1><p class="lead">Tu usuario (' + esc(ctx.user.email) + ') todavía no pertenece a ningún equipo. Si te han invitado, abre el enlace que te pasaron. Si no, crea el tuyo:</p></div>' +
    '<form class="form" id="ob"><div class="field"><label for="obType">Tipo</label><select id="obType"><option value="local">Local o discoteca</option><option value="promotora">Promotora</option></select></div>' +
    '<div class="field"><label for="obOrg">Nombre</label><input id="obOrg" required></div><div class="field"><label for="obArea">Zona</label><input id="obArea" placeholder="Ej. Malasaña, Madrid"></div>' +
    '<p class="err" id="obErr" hidden></p><button class="btn btn-primary btn-block" type="submit">Crear</button></form></div>';
  $("#logout").hidden = false;
  $("#ob").addEventListener("submit", async ev => {
    ev.preventDefault();
    const orgName = $("#obOrg").value.trim(); if (!orgName) return;
    try { await createOrg(ctx.user, { name: ctx.user.displayName || "", orgName, type: $("#obType").value, area: $("#obArea").value.trim() }); location.reload(); }
    catch (e) { $("#obErr").textContent = authError(e); $("#obErr").hidden = false; }
  });
}

function start() {
  if (!configured) { view.innerHTML = notConfiguredHtml(); return; }
  $("#logout").addEventListener("click", async () => { await signOut(auth); location.replace(url("app/entrar.html")); });
  $("#demoExit").addEventListener("click", async () => { await signOut(auth); location.replace(url("index.html#demo")); });

  onAuthStateChanged(auth, async u => {
    if (!u) { location.replace(url("app/entrar.html")); return; }
    if (ctx.uid === u.uid) return;
    ctx.user = u; ctx.uid = u.uid;
    try {
      const us = await getDoc(doc(db, "users", u.uid));
      if (!us.exists() || !us.data().orgId) { onboarding(); return; }
      ctx.orgId = us.data().orgId;
      const ms = await getDoc(doc(db, "orgs", ctx.orgId, "members", u.uid));
      if (!ms.exists()) { onboarding(); return; }
      ctx.member = ms.data(); ctx.role = ctx.member.role;

      onSnapshot(doc(db, "orgs", ctx.orgId), s => {
        ctx.org = Object.assign({ id: s.id }, s.data());
        orgListeners.forEach(fn => { try { fn(ctx.org); } catch (e) { console.warn(e); } });
        if (!started) { started = true; route(); } else header();
      }, e => { view.innerHTML = '<div class="notice"><b>No se ha podido cargar tu cuenta.</b><p class="small">' + esc(authError(e)) + '</p></div>'; });

      // Si cambian tu rol o te sacan del equipo, el panel se adapta solo
      onSnapshot(doc(db, "orgs", ctx.orgId, "members", u.uid), s => {
        if (!s.exists()) { toast("Ya no formas parte de este equipo."); setTimeout(() => signOut(auth).then(() => location.replace(url("app/entrar.html"))), 1500); return; }
        const role = s.data().role; ctx.member = s.data();
        if (role !== ctx.role) { ctx.role = role; if (started) route(); }
      }, () => {});
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="notice"><b>No se ha podido cargar tu cuenta.</b><p class="small">' + esc(authError(e)) + '</p><button class="btn btn-sm" onclick="location.reload()">Reintentar</button></div>';
    }
  });
  window.addEventListener("hashchange", route);
}

start();
