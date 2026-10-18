// Pagos de Aforo.
// En modo "prueba" todo se hace aquí, en el navegador, sin cobrar nada:
// se crean las entradas, se reserva la mesa o se manda el pedido a la barra.
// En modo "stripe" se llama al servidor (funciones de Netlify) y se cobra de verdad.
import { db, doc, collection, runTransaction, serverTimestamp, increment, arrayUnion, callFn } from "./firebase.js";
import { PAGOS, FEE_PER_TICKET, DEPOSIT_PCT } from "./config.js";
import { url, dayKey, toDate } from "./ui.js";

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rand = n => { const b = new Uint32Array(n); crypto.getRandomValues(b); return b; };
const ticketCode = prefix => (prefix || "AFO") + "-" + Array.from(rand(6), x => ALPH[x % ALPH.length]).join("");
const orderId = () => { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; return Array.from(rand(24), x => a[x % a.length]).join(""); };
const clean = (s, n) => String(s || "").trim().slice(0, n);
const okEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const round2 = n => Math.round(n * 100) / 100;
const plural = (n, a, b) => n + " " + (n === 1 ? a : b);
function fail(msg) { const e = new Error(msg); e.public = true; throw e; }
const rrppFrom = (org, code) => {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const r = c && org.rrppCodes ? org.rrppCodes[c] : null;
  return r && r.id ? { id: r.id, code: c, perTicket: Number(r.perTicket) || 0, tablePct: Number(r.tablePct) || 0 } : null;
};

export async function crearPago(b) {
  if (PAGOS !== "prueba") return callFn("crear-pago", b);
  const id = orderId();
  try {
    if (b.kind === "tickets") await entradas(id, b);
    else if (b.kind === "table") await mesa(id, b);
    else if (b.kind === "bar") await barra(id, b);
    else fail("Tipo de compra no válido.");
  } catch (e) {
    console.error(e);
    if (e.public) throw e;
    throw new Error(e && e.code === "permission-denied"
      ? "Firebase no deja guardar la compra. ¿Has publicado las reglas de prueba? (README, paso 3)"
      : "No se pudo completar la compra. Inténtalo otra vez.");
  }
  return { url: url("pedido.html?id=" + id), simulated: true };
}

async function leerEvento(tx, eventId) {
  const evRef = doc(db, "events", clean(eventId, 60) || "x");
  const es = await tx.get(evRef);
  if (!es.exists() || !es.data().published) fail("Este evento no existe o ya no está a la venta.");
  const e = es.data();
  if (toDate(e.date).getTime() < Date.now() - 6 * 3600e3) fail("Este evento ya ha pasado.");
  const os = await tx.get(doc(db, "orgs", e.orgId));
  return { evRef, e, org: os.exists() ? os.data() : {} };
}

/* ---------- entradas ---------- */
async function entradas(id, b) {
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase();
  if (!name) fail("Escribe tu nombre.");
  if (!okEmail(email)) fail("Escribe un email válido.");
  await runTransaction(db, async tx => {
    const { evRef, e, org } = await leerEvento(tx, b.eventId);
    const tiers = (e.tiers || []).map(t => Object.assign({}, t));
    const items = []; let n = 0, sub = 0;
    for (const [tierId, raw] of Object.entries(b.items || {})) {
      const q = Math.floor(Number(raw)); if (!(q > 0)) continue;
      const t = tiers.find(x => x.id === tierId);
      if (!t || t.hidden) fail("Ese tipo de entrada ya no está disponible. Recarga la página.");
      const left = t.qty - (t.sold || 0);
      if (q > left) fail(left > 0 ? "Solo quedan " + left + " de " + t.name + "." : t.name + " está agotada.");
      t.sold = (t.sold || 0) + q;
      items.push({ tierId, name: t.name, qty: q, price: Number(t.price) });
      n += q; sub += q * Number(t.price);
    }
    if (!n) fail("Elige al menos una entrada.");
    if (n > 10) fail("Puedes comprar 10 entradas como máximo por pedido.");
    const rr = rrppFrom(org, b.rrppCode), fee = round2(FEE_PER_TICKET * n), now = serverTimestamp();

    const tickets = [];
    for (const it of items) for (let i = 0; i < it.qty; i++) {
      const code = ticketCode(e.prefix);
      tickets.push({ code, tierName: it.name });
      tx.set(doc(db, "orgs", e.orgId, "tickets", code), {
        eventId: evRef.id, tierId: it.tierId, tierName: it.name, buyerName: name, email, rrppId: rr ? rr.id : null,
        orderId: id, price: it.price, createdAt: now, usedAt: null, usedBy: null
      });
    }
    tx.set(doc(db, "orders", id), {
      kind: "tickets", orgId: e.orgId, eventId: evRef.id, eventName: e.name, items, subtotal: sub, fee, total: round2(sub + fee),
      buyerName: name, email, rrppId: rr ? rr.id : null, tickets, status: "paid", simulated: true, createdAt: now, paidAt: now
    });
    tx.update(evRef, { tiers, soldTotal: increment(n), revenue: increment(sub), ["daily." + dayKey(new Date())]: increment(n) });
    if (rr) tx.update(doc(db, "orgs", e.orgId, "rrpp", rr.id), { ["sold." + evRef.id]: increment(n), soldTotal: increment(n), earned: increment(round2(n * rr.perTicket)) });
    tx.set(doc(collection(db, "orgs", e.orgId, "activity")), { text: plural(n, "entrada", "entradas") + " · " + e.name + (rr ? " · vía " + rr.code : ""), amount: sub, kind: "ticket", createdAt: now });
  });
}

/* ---------- señal de mesa VIP ---------- */
async function mesa(id, b) {
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 30);
  if (!name) fail("Escribe a nombre de quién va la reserva.");
  if (!okEmail(email)) fail("Escribe un email válido.");
  await runTransaction(db, async tx => {
    const { evRef, e, org } = await leerEvento(tx, b.eventId);
    if (e.vipEnabled === false) fail("Este evento no vende mesas online. Habla con el local.");
    const t = (org.tables || []).find(x => x.id === b.tableId);
    if (!t) fail("Esa mesa no existe.");
    if ((e.taken || []).includes(t.id)) fail("Vaya, la mesa " + t.id + " se acaba de reservar. Elige otra.");
    const people = Math.max(1, Math.min(Number(t.pax) || 1, Math.floor(Number(b.people) || 1)));
    const min = Number(t.min) || 0, deposit = Math.round(min * DEPOSIT_PCT / 100);
    const rr = rrppFrom(org, b.rrppCode), now = serverTimestamp();
    tx.set(doc(db, "orders", id), {
      kind: "table", orgId: e.orgId, eventId: evRef.id, eventName: e.name, tableId: t.id, people, min, items: [], subtotal: deposit, fee: 0, total: deposit,
      buyerName: name, email, phone, rrppId: rr ? rr.id : null, status: "paid", simulated: true, createdAt: now, paidAt: now
    });
    tx.set(doc(db, "orgs", e.orgId, "reservations", id), {
      eventId: evRef.id, tableId: t.id, name, email, phone, people, min, deposit, rrppId: rr ? rr.id : null,
      source: "online", orderId: id, arrivedAt: null, createdAt: now
    });
    tx.update(evRef, { taken: arrayUnion(t.id) });
    if (rr) tx.update(doc(db, "orgs", e.orgId, "rrpp", rr.id), { tablesCount: increment(1), earned: increment(round2(min * rr.tablePct / 100)) });
    tx.set(doc(collection(db, "orgs", e.orgId, "activity")), { text: "Mesa " + t.id + " reservada · " + e.name + " · " + name, amount: deposit, kind: "mesa", createdAt: now });
  });
}

/* ---------- pedido desde la mesa ---------- */
async function barra(id, b) {
  const name = clean(b.name, 80), orgId = clean(b.orgId, 60) || "x";
  await runTransaction(db, async tx => {
    const os = await tx.get(doc(db, "orgs", orgId));
    if (!os.exists()) fail("Este local no existe.");
    const org = os.data();
    if (org.clickPay === false) fail("Este local no tiene activados los pedidos desde la mesa.");
    const t = (org.tables || []).find(x => x.id === b.tableId);
    if (!t) fail("Esa mesa no existe. Escanea otra vez el QR de tu mesa.");
    const items = []; let sub = 0;
    for (const [pid, raw] of Object.entries(b.items || {})) {
      const q = Math.min(20, Math.floor(Number(raw))); if (!(q > 0)) continue;
      const p = (org.products || []).find(x => x.id === pid);
      if (!p) fail("Algún producto ya no está en la carta. Recarga la página.");
      items.push({ id: p.id, name: p.name, qty: q, price: Number(p.price) });
      sub += q * Number(p.price);
    }
    if (!items.length) fail("Elige algo de la carta.");
    const now = serverTimestamp();
    tx.set(doc(db, "orders", id), {
      kind: "bar", orgId, eventId: null, tableId: t.id, items, subtotal: sub, fee: 0, total: sub, buyerName: name, email: "",
      rrppId: null, status: "paid", simulated: true, createdAt: now, paidAt: now
    });
    tx.set(doc(db, "orgs", orgId, "tableOrders", id), { table: t.id, items, total: sub, name, status: "nuevo", orderId: id, createdAt: now });
    tx.set(doc(db, "orgs", orgId, "barSales", id), { total: sub, items, method: "Móvil", source: "mesa", staffUid: null, createdAt: now });
    tx.set(doc(collection(db, "orgs", orgId, "activity")), { text: "Pedido pagado desde la mesa " + t.id, amount: sub, kind: "pedido", createdAt: now });
  });
}
