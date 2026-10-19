// ============================================================
//  DEMO COMPARTIDA ("Sala Demo")
//  La web se prepara sola: el primer navegador que entra crea la Sala Demo
//  con eventos, RRPP, listas, mesas y ventas de ejemplo, y las cuentas
//  demo de dueño, puerta, barra y RRPP. Cuando un evento de ejemplo pasa,
//  se vuelve a poner en las próximas semanas.
//
//  Si algún día alguien la rompe: sube VERSION en 1 y se vuelve a montar.
// ============================================================
import {
  configured, auth, secondary, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile,
  doc, getDoc, getDocs, updateDoc, collection, query, where, writeBatch, serverTimestamp, Timestamp
} from "./firebase.js";
import { DEFAULT_LAYOUTS, DEFAULT_PRODUCTS, dayKey, toDate, rid, url } from "./ui.js";

export const DEMO_ORG = "demo";
const VERSION = 2;
const PASS = "aforo-demo-2026";
export const DEMO_ACCOUNTS = {
  owner: { email: "demo.dueno@example.com", name: "Dueño Demo", role: "owner", go: "#resumen" },
  puerta: { email: "demo.puerta@example.com", name: "Portero Demo", role: "puerta", go: "#puerta" },
  barra: { email: "demo.barra@example.com", name: "Camarero Demo", role: "barra", go: "#barra" },
  rrpp: { email: "demo.rrpp@example.com", name: "Ana Medina", role: "rrpp", go: "#mipanel", rrppId: "demo-ana" }
};

/* ---------- contenido de ejemplo ---------- */
function nextDow(dow, weeks, h, m) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + ((dow - t.getDay() + 7) % 7) + 7 * weeks);
  t.setHours(h, m, 0, 0);
  if (t.getTime() < Date.now() - 6 * 3600e3) t.setDate(t.getDate() + 7);
  return t;
}
function history(vals) { const o = {}; vals.forEach((v, i) => { o[dayKey(new Date(Date.now() - (vals.length - 1 - i) * 864e5))] = v; }); return o; }

const EVENTS = [
  {
    id: "demo-e1", when: () => nextDow(6, 0, 23, 30), name: "Noche Demo", genre: "House y tech house", endTime: "06:00", hue: 346, prefix: "DEM", capacity: 750,
    lineup: ["Lía Corvo", "Dani Mares b2b Oké", "Residente: Vera N."],
    description: "Evento de ejemplo para probar Aforo. Compra una entrada (no se cobra nada) y luego escanéala en la puerta.",
    tiers: [{ id: "t1", name: "1ª fase", price: 12, qty: 200, sold: 200 }, { id: "t2", name: "2ª fase", price: 15, qty: 400, sold: 214 }, { id: "t3", name: "Con copa", price: 22, qty: 150, sold: 63, note: "Incluye una copa" }],
    daily: [9, 12, 8, 15, 17, 14, 22, 27, 23, 31, 36, 34, 45, 14],
    guests: [["Paula Gómez", "Gratis antes de 1:30", "demo-ana"], ["Irene Sáez", "Gratis antes de 1:30", "demo-ana"], ["Hugo Martín", "Consumición incluida", "demo-ana"], ["Álvaro Ruiz", "Gratis antes de 1:30", "demo-carlos"], ["Nerea Castillo", "Consumición incluida", "demo-carlos"], ["Marta Iglesias", "Gratis antes de 1:30", "demo-lucia"], ["Daniel Ortega", "Gratis antes de 1:30", "demo-lucia"], ["Laura Pons", "Invitación VIP", null]],
    res: [["R1", "Grupo Javier T.", 9, 600, 180, "demo-ana"], ["V2", "Cumple de Alba", 6, 300, 90, "demo-carlos"], ["V5", "Andrés Moya", 5, 300, 90, "demo-lucia"]]
  },
  {
    id: "demo-e2", when: () => nextDow(5, 0, 23, 59), name: "Viernes Urbano", genre: "Urbano y reggaetón", endTime: "05:30", hue: 22, prefix: "URB", capacity: 600,
    lineup: ["DJ Kala", "Rubén Sound", "MC Nuria"],
    description: "Evento de ejemplo para probar Aforo. No se cobra nada.",
    tiers: [{ id: "t1", name: "Anticipada", price: 10, qty: 300, sold: 142 }, { id: "t2", name: "Con copa", price: 18, qty: 150, sold: 51, note: "Incluye una copa" }],
    daily: [3, 5, 4, 6, 8, 7, 9, 12, 10, 14, 16, 15, 20, 6],
    guests: [["Lola Serrano", "Gratis antes de 1:30", "demo-carlos"], ["Iván Prieto", "Consumición incluida", "demo-ana"]],
    res: [["V1", "Rubén C.", 6, 300, 90, "demo-carlos"]]
  },
  {
    id: "demo-e3", when: () => nextDow(6, 2, 23, 0), name: "Remember 90s", genre: "Remember y clásicos", endTime: "06:00", hue: 205, prefix: "REM", capacity: 900,
    lineup: ["Toni Peret", "DJ Neil", "Residentes Aforo"],
    description: "Evento de ejemplo para probar Aforo. No se cobra nada.",
    tiers: [{ id: "t1", name: "Early", price: 14, qty: 300, sold: 37 }, { id: "t2", name: "2ª fase", price: 18, qty: 500, sold: 0 }],
    daily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 9, 15, 9],
    guests: [], res: []
  }
];
const RRPP = [
  { id: "demo-ana", name: "Ana Medina", code: "ANA", perTicket: 1.5, tablePct: 10, sold: { "demo-e1": 64, "demo-e2": 20 }, tablesCount: 1, paid: 60 },
  { id: "demo-carlos", name: "Carlos León", code: "CARLOS", perTicket: 1.5, tablePct: 10, sold: { "demo-e1": 51, "demo-e2": 30 }, tablesCount: 2, paid: 0 },
  { id: "demo-lucia", name: "Lucía Prado", code: "LUCIA", perTicket: 1, tablePct: 5, sold: { "demo-e1": 38 }, tablesCount: 1, paid: 0 }
];

function eventDoc(ev) {
  const soldTotal = ev.tiers.reduce((a, t) => a + t.sold, 0), revenue = ev.tiers.reduce((a, t) => a + t.sold * t.price, 0);
  return {
    orgId: DEMO_ORG, orgName: "Sala Demo", name: ev.name, date: Timestamp.fromDate(ev.when()), endTime: ev.endTime, venueName: "Sala Demo", area: "Malasaña, Madrid",
    capacity: ev.capacity, genre: ev.genre, lineup: ev.lineup, description: ev.description, hue: ev.hue, prefix: ev.prefix, vipEnabled: true, published: true,
    tiers: ev.tiers.map(t => Object.assign({}, t)), soldTotal, revenue, inside: 0, daily: history(ev.daily), taken: ev.res.map(r => r[0]), demo: true
  };
}

/* ---------- escribir en grupos pequeños (Firebase limita las comprobaciones por envío) ---------- */
async function commit(db, ops, size = 8) {
  for (let i = 0; i < ops.length; i += size) {
    const b = writeBatch(db);
    ops.slice(i, i + size).forEach(fn => fn(b));
    await b.commit();
  }
}

// Pone un evento de ejemplo (y sus listas y mesas) como nuevo
// Códigos de descuento de ejemplo para probar
const CODES = { "demo-e1": { DEMO10: { type: "pct", value: 10 } }, "demo-e2": { "2EUROS": { type: "eur", value: 2 } } };
export const DEMO_CODE = "DEMO10";

function eventOps(db, ev) {
  const ops = [b => b.set(doc(db, "events", ev.id), eventDoc(ev))];
  Object.entries(CODES[ev.id] || {}).forEach(([code, c]) => ops.push(b => b.set(doc(db, "events", ev.id, "codes", code), { type: c.type, value: c.value, max: 0, used: 0, active: true, createdAt: serverTimestamp() })));
  ev.guests.forEach((g, i) => ops.push(b => b.set(doc(db, "orgs", DEMO_ORG, "guests", ev.id + "-g" + i), { eventId: ev.id, name: g[0], type: g[1], rrppId: g[2], inAt: null, createdAt: serverTimestamp() })));
  ev.res.forEach((r, i) => ops.push(b => b.set(doc(db, "orgs", DEMO_ORG, "reservations", ev.id + "-r" + i), { eventId: ev.id, tableId: r[0], name: r[1], people: r[2], min: r[3], deposit: r[4], rrppId: r[5], phone: "", email: "", source: "manual", orderId: null, arrivedAt: null, createdAt: serverTimestamp() })));
  return ops;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function loginOrSignup(a, acc) {
  try { return (await signInWithEmailAndPassword(a, acc.email, PASS)).user; }
  catch (e) {
    const c = (e && e.code) || "";
    if (!/user-not-found|invalid-credential|invalid-login/.test(c)) throw e;
    try {
      const u = (await createUserWithEmailAndPassword(a, acc.email, PASS)).user;
      try { await updateProfile(u, { displayName: acc.name }); } catch (x) { /* nada */ }
      return u;
    } catch (e2) {
      // Otro navegador acaba de crear esta cuenta a la vez: entramos con ella
      if (!/email-already-in-use/.test((e2 && e2.code) || "")) throw e2;
      await sleep(800);
      return (await signInWithEmailAndPassword(a, acc.email, PASS)).user;
    }
  }
}
async function readOrg(db) { const os = await getDoc(doc(db, "orgs", DEMO_ORG)); return os.exists() ? os.data() : null; }
const ready = o => !!o && o.demoVersion >= VERSION;
// Otro navegador empezó a montarla hace poco: mejor esperar que duplicar
// (si ya tiene una versión anterior no está "montándose": hay que actualizarla)
const inProgress = o => !!o && !ready(o) && !o.demoVersion && o.createdAt && Date.now() - toDate(o.createdAt).getTime() < 90e3;
async function waitReady(db, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (ready(await readOrg(db))) return true; await sleep(1500); }
  return false;
}

/* ---------- montaje completo ---------- */
async function seedAll(a, db) {
  const owner = await loginOrSignup(a, DEMO_ACCOUNTS.owner);
  const org = await readOrg(db);
  if (ready(org) || inProgress(org)) { await signOut(a); return ready(org) || waitReady(db, 25e3); }
  const L = DEFAULT_LAYOUTS.local;
  const rrppCodes = {}; RRPP.forEach(r => { rrppCodes[r.code] = { id: r.id, perTicket: r.perTicket, tablePct: r.tablePct }; });
  const orgData = { name: "Sala Demo", type: "local", slug: "sala-demo", venueName: "Sala Demo", area: "Malasaña, Madrid", zones: L.zones, tables: L.tables, products: DEFAULT_PRODUCTS, clickPay: true, rrppCodes, demo: true };

  // 1) El local y su dueño
  if (!org) {
    await commit(db, [
      b => b.set(doc(db, "orgs", DEMO_ORG), Object.assign({ ownerUid: owner.uid, createdAt: serverTimestamp() }, orgData)),
      b => b.set(doc(db, "orgs", DEMO_ORG, "members", owner.uid), { role: "owner", name: DEMO_ACCOUNTS.owner.name, email: DEMO_ACCOUNTS.owner.email, rrppId: null, joinedAt: serverTimestamp() }),
      b => b.set(doc(db, "users", owner.uid), { orgId: DEMO_ORG, role: "owner", name: DEMO_ACCOUNTS.owner.name })
    ]);
  } else {
    if (org.ownerUid !== owner.uid) throw new Error("La Sala Demo pertenece a otra cuenta.");
    await updateDoc(doc(db, "orgs", DEMO_ORG), orgData);
  }

  // 2) RRPP, eventos, listas, mesas, actividad, caja y un pedido de mesa
  const ops = [];
  RRPP.forEach(r => {
    const earned = Object.values(r.sold).reduce((x, n) => x + n, 0) * r.perTicket +
      EVENTS.reduce((x, ev) => x + ev.res.filter(z => z[5] === r.id).reduce((y, z) => y + z[3] * r.tablePct / 100, 0), 0);
    ops.push(b => b.set(doc(db, "orgs", DEMO_ORG, "rrpp", r.id), { name: r.name, code: r.code, perTicket: r.perTicket, tablePct: r.tablePct, sold: r.sold, soldTotal: Object.values(r.sold).reduce((x, n) => x + n, 0), earned, paid: r.paid, tablesCount: r.tablesCount, createdAt: serverTimestamp() }));
  });
  EVENTS.forEach(ev => ops.push(...eventOps(db, ev)));
  if (!org) {
    const now = serverTimestamp();
    [["Ana Medina se une al equipo de RRPP", 0], ["2 entradas · Noche Demo · vía ANA", 30], ["Mesa V5 reservada · Noche Demo · Andrés Moya", 90], ["3 entradas · Noche Demo", 45], ["Barra · 4 productos · tarjeta", 33]]
      .forEach(([text, amount]) => ops.push(b => b.set(doc(collection(db, "orgs", DEMO_ORG, "activity")), { text, amount, kind: "demo", by: owner.uid, createdAt: now })));
    [[33, "Tarjeta", [["copa", "Copa", 2, 10], ["agua", "Agua", 1, 3], ["cerveza", "Cerveza", 2, 5]]], [160, "Tarjeta", [["moet", "Moët Brut", 1, 160]]], [26, "Efectivo", [["copap", "Copa premium", 2, 13]]]]
      .forEach(([total, method, items]) => ops.push(b => b.set(doc(collection(db, "orgs", DEMO_ORG, "barSales")), { total, method, source: "barra", staffUid: owner.uid, items: items.map(i => ({ id: i[0], name: i[1], qty: i[2], price: i[3] })), createdAt: now })));
    const oid = rid(24), items = [{ id: "copa", name: "Copa", qty: 2, price: 10 }, { id: "agua", name: "Agua", qty: 1, price: 3 }];
    ops.push(b => {
      b.set(doc(db, "orders", oid), { kind: "bar", orgId: DEMO_ORG, eventId: null, tableId: "V3", items, subtotal: 23, fee: 0, total: 23, buyerName: "Sergio", email: "", rrppId: null, status: "paid", simulated: true, createdAt: now, paidAt: now });
      b.set(doc(db, "orgs", DEMO_ORG, "tableOrders", oid), { table: "V3", items, total: 23, name: "Sergio", status: "nuevo", orderId: oid, createdAt: now });
    });
  }
  await commit(db, ops);

  // 3) Invitaciones para las cuentas de puerta, barra y RRPP
  const roles = ["puerta", "barra", "rrpp"], codes = {};
  await commit(db, roles.map(r => b => {
    codes[r] = rid(20);
    b.set(doc(db, "invites", codes[r]), { orgId: DEMO_ORG, orgName: "Sala Demo", role: r, rrppId: DEMO_ACCOUNTS[r].rrppId || null, name: DEMO_ACCOUNTS[r].name, used: false, usedBy: null, createdBy: owner.uid, createdAt: serverTimestamp() });
  }));
  await signOut(a);

  // 4) Cada cuenta de la demo se une al equipo con su invitación
  for (const r of roles) {
    const acc = DEMO_ACCOUNTS[r];
    try {
      const u = await loginOrSignup(a, acc);
      const ms = await getDoc(doc(db, "orgs", DEMO_ORG, "members", u.uid));
      if (!ms.exists() || ms.data().role !== acc.role) {
        const b = writeBatch(db);
        b.set(doc(db, "orgs", DEMO_ORG, "members", u.uid), { role: acc.role, name: acc.name, email: acc.email, rrppId: acc.rrppId || null, inviteCode: codes[r], joinedAt: serverTimestamp() });
        b.update(doc(db, "invites", codes[r]), { used: true, usedBy: u.uid });
        b.set(doc(db, "users", u.uid), { orgId: DEMO_ORG, role: acc.role, name: acc.name });
        await b.commit();
      }
    } catch (e) { console.warn("demo: cuenta " + r, e); }
    await signOut(a);
  }

  // 5) Listo: marcamos la versión al final para saber que se completó
  await loginOrSignup(a, DEMO_ACCOUNTS.owner);
  await updateDoc(doc(db, "orgs", DEMO_ORG), { demoVersion: VERSION });
  await signOut(a);
  return true;
}

/* ---------- mantenimiento: eventos que ya pasaron vuelven a las próximas semanas ---------- */
async function refresh(a, db) {
  const q = await getDocs(query(collection(db, "events"), where("orgId", "==", DEMO_ORG), where("published", "==", true)));
  const live = new Map(q.docs.map(d => [d.id, d.data()]));
  // Se reponen los que ya pasaron y los que algún visitante ha cancelado, despublicado o dejado sin entradas
  const broken = e => !e || e.cancelled || !e.published || toDate(e.date).getTime() < Date.now() - 8 * 3600e3 || !(e.tiers || []).some(t => !t.hidden && (t.sold || 0) < t.qty);
  const stale = EVENTS.filter(ev => broken(live.get(ev.id)));
  if (!stale.length) return;
  await loginOrSignup(a, DEMO_ACCOUNTS.owner);
  for (const ev of stale) {
    const ops = eventOps(db, ev);
    // Quitamos las reservas que hicieron otros visitantes para la fecha anterior
    const rs = await getDocs(query(collection(db, "orgs", DEMO_ORG, "reservations"), where("eventId", "==", ev.id)));
    rs.docs.filter(d => !d.id.startsWith(ev.id + "-r")).forEach(d => ops.push(b => b.delete(d.ref)));
    await commit(db, ops);
  }
  await signOut(a);
}

/* ---------- lo que usan las páginas ---------- */
let running = null, lastErr = null;
// Explica en cristiano por qué no se ha podido montar la demo
export function demoError() {
  if (!lastErr) return null;
  const c = String(lastErr.code || ""), m = String(lastErr.message || "");
  if (/operation-not-allowed/.test(c)) return "Falta activar el acceso con email en Firebase: Authentication → Método de acceso → Correo electrónico/contraseña.";
  if (/admin-restricted-operation/.test(c)) return "Firebase no deja crear cuentas: Authentication → Configuración → Acciones del usuario → activa «Habilitar la creación».";
  if (/permission-denied|insufficient permissions/i.test(c + m)) return "Firebase no deja guardar los datos de ejemplo. Revisa que las reglas publicadas son las de aforo-prueba (las que dicen «VERSIÓN DE PRUEBA»).";
  if (/email-already-in-use|invalid-credential|wrong-password/.test(c)) return "Las cuentas de la demo existen con otra contraseña. Hay que subir VERSION en js/demo.js.";
  if (/network|unavailable|offline/i.test(c + m)) return "No hay conexión con Firebase. Revisa tu internet y recarga.";
  if (/api-key|invalid-api-key/.test(c)) return "La configuración de Firebase (js/config.js) no es válida.";
  return "Error de Firebase: " + (c || m);
}
export function ensureDemo() {
  if (!configured) return Promise.resolve(false);
  if (!running) running = (async () => {
    const s = secondary(), a = s.auth, db = s.db;
    const org = await readOrg(db);
    if (ready(org)) { await refresh(a, db); return true; }
    if (inProgress(org)) return waitReady(db, 25e3);
    try { lastErr = null; return await seedAll(a, db); }
    catch (e) {
      lastErr = e;
      console.warn("Demo: no se pudo montar", e);
      try { await signOut(a); } catch (x) { /* nada */ }
      // Solo esperamos si parece que otro navegador la está montando ahora mismo
      if (inProgress(await readOrg(db).catch(() => null))) return waitReady(db, 25e3);
      return false;
    }
  })().catch(e => { lastErr = e; console.warn("No se pudo preparar la demo", e); running = null; try { signOut(secondary().auth); } catch (x) { /* nada */ } return false; });
  return running;
}

// Entra al panel de la demo con el rol elegido (owner, puerta, barra o rrpp)
export async function probarComo(role) {
  const acc = DEMO_ACCOUNTS[role] || DEMO_ACCOUNTS.owner;
  await ensureDemo();
  await signInWithEmailAndPassword(auth, acc.email, PASS);
  location.href = url("app/" + acc.go);
}

export const DEMO_ROLES = [["owner", "Dueño"], ["puerta", "Portero"], ["barra", "Camarero"], ["rrpp", "RRPP"]];
