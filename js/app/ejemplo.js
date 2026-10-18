// Datos de ejemplo para enseñar Aforo: eventos, ventas, RRPP, listas, mesas y barra.
// Todo lo que se crea lleva sample: true para poder quitarlo luego.
import { db, doc, collection, writeBatch, serverTimestamp, Timestamp, query, where, getDocs, deleteField } from "../firebase.js";
import { DEPOSIT_PCT } from "../config.js";
import { dayKey, rid } from "../ui.js";
import { crearPago } from "../pagos.js";
import { rememberOrder } from "../public.js";
import { setPicked } from "./common.js";

// Próximo día de la semana (0 = domingo … 6 = sábado), sin contar hoy
function nextDow(dow, weeks, h, m) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let diff = (dow - d.getDay() + 7) % 7; if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff + 7 * (weeks || 0)); d.setHours(h, m, 0, 0);
  return d;
}
const history = vals => { const o = {}; vals.forEach((v, i) => { o[dayKey(new Date(Date.now() - (vals.length - 1 - i) * 864e5))] = v; }); return o; };
const ago = min => Timestamp.fromDate(new Date(Date.now() - min * 60000));

const EVENTS = [
  { key: "e1", name: "Nébula Saturdays", genre: "House y tech house", when: [6, 0, 23, 30], endTime: "06:00", hue: 346, prefix: "NBS", capacity: 850,
    lineup: ["Lía Corvo", "Dani Mares b2b Oké", "Residente: Vera N."], description: "Edad mínima 18 años. Dress code: nada de chanclas ni ropa deportiva. Entrada hasta las 3:00.",
    tiers: [{ name: "1ª fase", price: 12, qty: 200, sold: 200, nextDone: true }, { name: "2ª fase", price: 15, qty: 400, sold: 322 }, { name: "Con copa", price: 22, qty: 150, sold: 96, note: "Incluye una copa" }],
    daily: [9, 12, 8, 15, 17, 14, 22, 27, 23, 31, 36, 34, 45, 14] },
  { key: "e2", name: "Calor", genre: "Urbano y reggaetón", when: [5, 0, 23, 59], endTime: "05:30", hue: 22, prefix: "CAL", capacity: 600,
    lineup: ["DJ Kala", "Rubén Sound", "MC Nuria"], description: "Edad mínima 18 años.",
    tiers: [{ name: "Anticipada", price: 10, qty: 300, sold: 142 }, { name: "Con copa", price: 18, qty: 150, sold: 60, note: "Incluye una copa" }],
    daily: [3, 5, 4, 6, 8, 7, 9, 12, 10, 14, 16, 15, 20, 6] },
  { key: "e3", name: "Remember 2000", genre: "Dance y remember de los 2000", when: [6, 2, 23, 30], endTime: "06:00", hue: 205, prefix: "REM", capacity: 700,
    lineup: ["DJ Álex Prada", "Sonia M."], description: "La noche de los temazos de los 2000. Edad mínima 18 años.",
    tiers: [{ name: "Early", price: 10, qty: 250, sold: 37 }, { name: "1ª fase", price: 13, qty: 300, sold: 0 }],
    daily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 9, 15, 9] }
];
const RRPP = [
  { key: "ana", name: "Ana Medina", code: "ANA", perTicket: 1.5, tablePct: 10, sold: { e1: 64, e2: 20 }, paid: 60 },
  { key: "carlos", name: "Carlos León", code: "CARLOS", perTicket: 1.5, tablePct: 10, sold: { e1: 51, e2: 30 }, paid: 0 },
  { key: "lucia", name: "Lucía Prado", code: "LUCIA", perTicket: 1.5, tablePct: 10, sold: { e1: 38, e2: 12, e3: 9 }, paid: 0 },
  { key: "iker", name: "Íker Ramos", code: "IKER", perTicket: 1, tablePct: 5, sold: { e1: 22, e2: 9 }, paid: 20 }
];
// [evento, posición de la mesa en el plano, nombre, personas, rrpp]
const RES = [["e1", 0, "Grupo Javier T.", 9, "ana"], ["e1", 3, "Cumple de Alba", 6, "carlos"], ["e1", 6, "Andrés Moya", 5, "lucia"], ["e1", 8, "Despedida de Carla", 6, "ana"], ["e2", 2, "Rubén C.", 6, "carlos"]];
const GUESTS = [
  ["e1", "Paula Gómez", "Gratis antes de 1:30", "ana"], ["e1", "Irene Sáez", "Gratis antes de 1:30", "ana"], ["e1", "Hugo Martín", "Consumición incluida", "ana"],
  ["e1", "Álvaro Ruiz", "Gratis antes de 1:30", "carlos"], ["e1", "Nerea Castillo", "Consumición incluida", "carlos"], ["e1", "Sergio Blanco", "Gratis antes de 1:30", "carlos"],
  ["e1", "Marta Iglesias", "Gratis antes de 1:30", "lucia"], ["e1", "Daniel Ortega", "Gratis antes de 1:30", "lucia"], ["e1", "Laura Pons", "Invitación VIP", null],
  ["e1", "Javi Molina", "Gratis antes de 1:30", "iker"], ["e1", "Rocío Gil", "Consumición incluida", "iker"],
  ["e2", "Lola Serrano", "Gratis antes de 1:30", "carlos"], ["e2", "Iván Prieto", "Consumición incluida", "ana"]
];
const BAR = [
  [[["Copa", 2, 10], ["Cerveza", 2, 5]], "Tarjeta", 12], [[["Copa premium", 1, 13], ["Agua", 1, 3]], "Efectivo", 25], [[["Moët Brut", 1, 160]], "Tarjeta", 41],
  [[["Chupito", 4, 4]], "Efectivo", 58], [[["Copa", 3, 10]], "Tarjeta", 77], [[["Cerveza", 2, 5], ["Refresco", 1, 4]], "Tarjeta", 96]
];

export async function hasSample(orgId) {
  const s = await getDocs(query(collection(db, "events"), where("orgId", "==", orgId), where("sample", "==", true)));
  return !s.empty;
}

export async function seed(ctx) {
  if (await hasSample(ctx.orgId)) throw Object.assign(new Error("Ya tienes los ejemplos cargados. Si quieres empezar de cero, quítalos en Ajustes."), { public: true });
  const org = ctx.org, orgId = ctx.orgId, tables = org.tables || [];
  const venue = org.venueName || org.name, area = org.area || "Madrid";
  const batch = writeBatch(db), now = serverTimestamp(), orgRef = doc(db, "orgs", orgId);

  // Eventos
  const ev = {}, tierIds = {};
  EVENTS.forEach(e => {
    const ref = doc(collection(db, "events")); ev[e.key] = ref.id;
    const tiers = e.tiers.map((t, i) => Object.assign({ id: "t" + (i + 1) + rid(4), hidden: false, note: "", nextDone: false }, t));
    tierIds[e.key] = tiers.map(t => t.id);
    const taken = RES.filter(r => r[0] === e.key && tables[r[1]]).map(r => tables[r[1]].id);
    batch.set(ref, {
      orgId, orgName: org.name, name: e.name, genre: e.genre, date: Timestamp.fromDate(nextDow.apply(null, e.when)), endTime: e.endTime,
      venueName: venue, area, capacity: e.capacity, lineup: e.lineup, description: e.description, hue: e.hue, prefix: e.prefix,
      vipEnabled: tables.length > 0, published: true, tiers, taken,
      soldTotal: tiers.reduce((a, t) => a + t.sold, 0), revenue: tiers.reduce((a, t) => a + t.sold * t.price, 0),
      inside: 0, daily: history(e.daily), sample: true, createdAt: now
    });
  });

  // RRPP (con su código público para que las compras les cuenten)
  const used = new Set(Object.keys(org.rrppCodes || {})), rr = {}, codes = {};
  RRPP.forEach(r => {
    let code = r.code, n = 2; while (used.has(code)) code = r.code + n++; used.add(code);
    const ref = doc(collection(db, "orgs", orgId, "rrpp")); rr[r.key] = ref.id; codes[r.key] = code;
    const sold = {}; Object.keys(r.sold).forEach(k => { sold[ev[k]] = r.sold[k]; });
    const soldTotal = Object.values(r.sold).reduce((a, b) => a + b, 0);
    const mine = RES.filter(x => x[4] === r.key && tables[x[1]]);
    const earned = Math.round((soldTotal * r.perTicket + mine.reduce((a, x) => a + (Number(tables[x[1]].min) || 0) * r.tablePct / 100, 0)) * 100) / 100;
    batch.set(ref, { name: r.name, code, perTicket: r.perTicket, tablePct: r.tablePct, sold, soldTotal, earned, paid: r.paid, tablesCount: mine.length, sample: true, createdAt: now });
    batch.update(orgRef, { ["rrppCodes." + code]: { id: ref.id, perTicket: r.perTicket, tablePct: r.tablePct } });
  });

  // Mesas reservadas
  RES.forEach(([ek, ti, name, people, rk], i) => {
    const t = tables[ti]; if (!t) return;
    const min = Number(t.min) || 0;
    batch.set(doc(collection(db, "orgs", orgId, "reservations")), {
      eventId: ev[ek], tableId: t.id, name, people: Math.min(people, Number(t.pax) || people), min, deposit: Math.round(min * DEPOSIT_PCT / 100),
      phone: "", email: "", rrppId: rr[rk] || null, source: "manual", orderId: null, arrivedAt: null, sample: true, createdAt: ago(600 + i * 300)
    });
  });

  // Listas de invitados
  GUESTS.forEach(([ek, name, type, rk]) => batch.set(doc(collection(db, "orgs", orgId, "guests")), { eventId: ev[ek], name, type, rrppId: rk ? rr[rk] : null, addedBy: ctx.uid, inAt: null, sample: true, createdAt: now }));

  // Cobros de barra de esta noche
  BAR.forEach(([items, method, min]) => {
    const its = items.map(([name, qty, price]) => ({ id: "ej" + rid(4), name, qty, price }));
    batch.set(doc(collection(db, "orgs", orgId, "barSales")), { total: its.reduce((a, x) => a + x.qty * x.price, 0), items: its, method, source: "barra", staffUid: ctx.uid, sample: true, createdAt: ago(min) });
  });

  // Actividad reciente
  [[19, "1 entrada · Calor", 10], [26, "Carlos apunta 3 nombres en su lista", 0], [34, "3 entradas · Nébula Saturdays", 45], [52, "Barra · 4 productos · tarjeta", 30],
   [70, "2 entradas · Remember 2000 · vía " + codes.lucia, 20], [95, "Evento publicado: Remember 2000", 0]]
    .forEach(([m, text, amount]) => batch.set(doc(collection(db, "orgs", orgId, "activity")), { text, amount, kind: "ejemplo", sample: true, createdAt: ago(m) }));

  await batch.commit();

  // Unas compras "de verdad" (simuladas) para tener entradas que escanear y un pedido en la barra
  const a = await crearPago({ kind: "tickets", eventId: ev.e1, items: { [tierIds.e1[1]]: 2 }, name: "Marina Ruiz", email: "marina@ejemplo.com", rrppCode: codes.ana });
  const b = await crearPago({ kind: "tickets", eventId: ev.e1, items: { [tierIds.e1[2]]: 1 }, name: "Pablo Herrero", email: "pablo@ejemplo.com" });
  [a, b].forEach(r => { const id = new URL(r.url).searchParams.get("id"); rememberOrder(id, "Nébula Saturdays (ejemplo)"); });
  const prods = (org.products || []).slice(0, 2);
  if (org.clickPay !== false && tables[1] && prods.length) {
    const items = {}; items[prods[0].id] = 2; if (prods[1]) items[prods[1].id] = 1;
    await crearPago({ kind: "bar", orgId, tableId: tables[1].id, items, name: "Leo" });
  }
  setPicked(ev.e1);
}

export async function unseed(ctx) {
  const orgId = ctx.orgId;
  const evs = await getDocs(query(collection(db, "events"), where("orgId", "==", orgId), where("sample", "==", true)));
  const rrs = await getDocs(query(collection(db, "orgs", orgId, "rrpp"), where("sample", "==", true)));
  if (evs.empty && rrs.empty) return 0;
  const b1 = writeBatch(db);
  for (const e of evs.docs) {
    for (const sub of ["guests", "reservations"]) {
      const s = await getDocs(query(collection(db, "orgs", orgId, sub), where("eventId", "==", e.id)));
      s.docs.forEach(d => b1.delete(d.ref));
    }
    b1.update(e.ref, { soldTotal: 0, published: false }); // un evento solo se puede borrar si no tiene ventas
  }
  const codes = {};
  rrs.docs.forEach(d => { b1.delete(d.ref); if (d.data().code) codes["rrppCodes." + d.data().code] = deleteField(); });
  if (Object.keys(codes).length) b1.update(doc(db, "orgs", orgId), codes);
  await b1.commit();
  const b2 = writeBatch(db);
  evs.docs.forEach(e => b2.delete(e.ref));
  await b2.commit();
  return evs.size;
}
