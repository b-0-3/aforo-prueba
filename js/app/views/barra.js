// Barra: TPV para cobrar y pedidos que llegan pagados desde las mesas.
import { db, collection, doc, query, where, orderBy, limit, onSnapshot, addDoc, updateDoc, serverTimestamp, Timestamp } from "../../firebase.js";
import { esc, eur, num, ago, stepper, delegate, toast, beep, PRODUCT_CATS } from "../../ui.js";

export default function (ctx, el) {
  let tab = "cobrar", cat = null, ticket = [], sales = { total: 0, n: 0 }, orders = null, sound = false, known = null;
  const offs = [];
  offs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "barSales"), where("createdAt", ">=", Timestamp.fromDate(new Date(Date.now() - 12 * 3600e3)))), s => {
    sales = { total: s.docs.reduce((a, d) => a + (Number(d.data().total) || 0), 0), n: s.size };
    const c = el.querySelector("#caja"); if (c) c.innerHTML = cajaHtml();
  }, () => {}));
  offs.push(onSnapshot(query(collection(db, "orgs", ctx.orgId, "tableOrders"), orderBy("createdAt", "desc"), limit(60)), s => {
    orders = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
    const ids = new Set(orders.filter(o => o.status === "nuevo").map(o => o.id));
    if (known) { const fresh = [...ids].filter(id => !known.has(id)); if (fresh.length) { if (sound) beep(true); toast(fresh.length === 1 ? "Nuevo pedido de la mesa " + (orders.find(o => o.id === fresh[0]) || {}).table : fresh.length + " pedidos nuevos"); } }
    known = ids;
    render();
  }, () => { orders = []; render(); }));
  offs.push(ctx.onOrg(() => render()));
  const timer = setInterval(() => { if (tab === "pedidos") render(); }, 60000);

  const products = () => ctx.org.products || [];
  const cats = () => { const all = PRODUCT_CATS.concat(products().map(p => p.cat)); return all.filter((c, i) => all.indexOf(c) === i && products().some(p => p.cat === c)); };
  const prod = id => products().find(p => p.id === id);
  const open = () => (orders || []).filter(o => o.status !== "servido");
  const cajaHtml = () => '<span class="kpi-l">Caja · últimas 12 h</span><b class="mono">' + eur(sales.total) + '</b><span class="small">' + num(sales.n) + ' cobros</span>';

  function render() {
    if (!cat || !cats().includes(cat)) cat = cats()[0] || null;
    const nOpen = open().length;
    el.innerHTML = '<section class="page"><div class="ph"><div class="ph-t"><p class="eyebrow">Barra · ' + esc(ctx.org.name) + '</p><h1 class="h1">' + (tab === "cobrar" ? "Cobrar" : "Pedidos de mesa") + '</h1></div><div class="caja" id="caja">' + cajaHtml() + '</div></div>' +
      '<div class="row"><div class="picks"><button class="pick" data-act="tab" data-id="cobrar" aria-pressed="' + (tab === "cobrar") + '">Cobrar</button><button class="pick" data-act="tab" data-id="pedidos" aria-pressed="' + (tab === "pedidos") + '">Pedidos de mesa' + (nOpen ? ' <span class="badge">' + nOpen + '</span>' : '') + '</button></div>' +
      '<button class="btn btn-sm" data-act="sound">' + (sound ? '🔔 Sonido activado' : '🔕 Activar sonido') + '</button></div>' +
      (tab === "cobrar" ? cobrarHtml() : pedidosHtml()) + '</section>';
  }

  function cobrarHtml() {
    if (!products().length) return '<div class="card empty"><p><b>Tu carta está vacía.</b></p>' + (ctx.isAdmin() ? '<a class="btn btn-primary" href="#ajustes">Añadir productos</a>' : '<p class="small">Pide al encargado que añada productos en Ajustes.</p>') + '</div>';
    const lines = ticket.filter(l => prod(l.id));
    const total = lines.reduce((a, l) => a + l.qty * prod(l.id).price, 0), n = lines.reduce((a, l) => a + l.qty, 0);
    return '<div class="tpv"><div class="tpv-l"><div class="picks">' + cats().map(c => '<button class="pick" data-act="cat" data-id="' + esc(c) + '" aria-pressed="' + (c === cat) + '">' + esc(c) + '</button>').join("") + '</div>' +
      '<div class="prod-grid">' + products().filter(p => p.cat === cat).map(p => '<button class="prod' + (p.cat === "Botellas" ? ' prod-vip' : '') + '" data-act="add" data-id="' + esc(p.id) + '"><b>' + esc(p.name) + '</b><span class="mono">' + eur(p.price) + '</span></button>').join("") + '</div></div>' +
      '<aside class="tk" aria-label="Ticket"><div class="tk-h"><b>Ticket</b>' + (n ? '<button class="linkbtn" data-act="clear">Vaciar</button>' : '') + '</div>' +
      (n ? '<ul class="tk-lines">' + lines.map(l => { const p = prod(l.id); return '<li><span>' + esc(p.name) + '</span>' + stepper("qty", p.id, l.qty, 99) + '<span class="mono">' + eur(p.price * l.qty) + '</span></li>'; }).join("") + '</ul>' : '<p class="small muted">Toca productos para añadirlos.</p>') +
      '<div class="tk-total"><span>Total</span><b class="mono">' + eur(total) + '</b></div>' +
      '<div class="tk-pay"><button class="btn btn-primary" data-act="charge" data-id="Tarjeta" ' + (n ? '' : 'disabled') + '>Tarjeta</button><button class="btn" data-act="charge" data-id="Efectivo" ' + (n ? '' : 'disabled') + '>Efectivo</button></div>' +
      '<p class="hint">Cobra con tu datáfono o en efectivo y toca el botón: queda apuntado en la caja.</p></aside></div>';
  }

  function pedidosHtml() {
    if (orders === null) return '<div class="loading"><span class="spin spin-sm"></span>Cargando pedidos…</div>';
    const o = open(), done = (orders || []).filter(x => x.status === "servido").slice(0, 8);
    return (o.length ? '<div class="orders">' + o.map(x => {
      const nuevo = x.status === "nuevo";
      return '<article class="order ' + x.status + '"><div class="order-h"><span class="order-t">' + esc(x.table) + '</span><div><span class="chip ' + (nuevo ? 'chip-rope' : 'chip-warn') + '">' + (nuevo ? 'Nuevo' : 'De camino') + '</span><span class="small">' + (x.createdAt ? ago(x.createdAt) : 'ahora') + '</span></div></div>' +
        (x.name ? '<p class="small">Para ' + esc(x.name) + '</p>' : '') +
        '<ul>' + (x.items || []).map(i => '<li><span class="mono">' + i.qty + '×</span> ' + esc(i.name) + '</li>').join("") + '</ul>' +
        '<div class="order-f"><span class="small">Pagado con el móvil · <b class="mono">' + eur(x.total) + '</b></span><button class="btn btn-sm' + (nuevo ? ' btn-primary' : '') + '" data-act="next" data-id="' + x.id + '">' + (nuevo ? 'Lo llevo yo' : 'Entregado') + '</button></div></article>';
    }).join("") + '</div>' : '<div class="card empty"><p><b>No hay pedidos pendientes.</b></p><p class="small">Cuando un cliente pida desde el QR de su mesa, aparecerá aquí al momento y ya estará pagado.</p></div>') +
      (done.length ? '<div class="card"><div class="card-h"><h2 class="h2">Entregados</h2></div><ul class="gl">' + done.map(x => '<li><div><b>Mesa ' + esc(x.table) + '</b><span class="small">' + esc((x.items || []).map(i => i.qty + "× " + i.name).join(", ")) + '</span></div><span class="mono small">' + eur(x.total) + '</span></li>').join("") + '</ul></div>' : '');
  }

  const offV = delegate(el, {
    tab(d) { tab = d.id; render(); },
    sound() { sound = !sound; if (sound) beep(true); render(); },
    cat(d) { cat = d.id; render(); },
    add(d) { const l = ticket.find(x => x.id === d.id); if (l) l.qty++; else ticket.push({ id: d.id, qty: 1 }); render(); },
    qty(d) { const l = ticket.find(x => x.id === d.id); if (!l) return; l.qty += Number(d.d); if (l.qty <= 0) ticket = ticket.filter(x => x !== l); render(); },
    clear() { ticket = []; render(); },
    async charge(d, b) {
      const lines = ticket.filter(l => prod(l.id)); if (!lines.length) return;
      const items = lines.map(l => { const p = prod(l.id); return { id: p.id, name: p.name, qty: l.qty, price: Number(p.price) }; });
      const total = items.reduce((a, i) => a + i.qty * i.price, 0), n = items.reduce((a, i) => a + i.qty, 0);
      b.disabled = true;
      try {
        await addDoc(collection(db, "orgs", ctx.orgId, "barSales"), { total, items, method: d.id, source: "barra", staffUid: ctx.uid, createdAt: serverTimestamp() });
        ctx.log("Barra · " + n + " producto" + (n > 1 ? "s" : "") + " · " + d.id.toLowerCase(), total, "barra");
        ticket = []; render(); toast("Cobrado " + eur(total) + " en " + d.id.toLowerCase() + ".");
      } catch (x) { b.disabled = false; toast("No se pudo apuntar el cobro. Revisa la conexión."); }
    },
    async next(d, b) {
      const o = (orders || []).find(x => x.id === d.id); if (!o) return; b.disabled = true;
      try { await updateDoc(doc(db, "orgs", ctx.orgId, "tableOrders", o.id), { status: o.status === "nuevo" ? "camino" : "servido" }); }
      catch (x) { b.disabled = false; toast("No se pudo actualizar."); }
    }
  });
  render();
  return () => { offs.forEach(f => f()); clearInterval(timer); offV(); };
}
