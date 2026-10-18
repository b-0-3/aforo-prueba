// Ajustes: cobros con Stripe, datos, carta de barra, plano de mesas y QR de las mesas.
import { db, doc, updateDoc, callFn } from "../../firebase.js";
import { esc, eur, mapHtml, delegate, toast, drawQR, rid, slugify, DEFAULT_LAYOUTS, PRODUCT_CATS } from "../../ui.js";
import { siteUrl } from "../common.js";
import { PAGOS } from "../../config.js";

export default function (ctx, el) {
  let products = clone(ctx.org.products || []), tables = clone(ctx.org.tables || []), zones = clone(ctx.org.zones || []);
  let dirtyP = false, dirtyT = false, stripeBusy = false, drag = null;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  const offOrg = ctx.onOrg(org => {
    if (!dirtyP) { products = clone(org.products || []); renderProds(); }
    if (!dirtyT) { tables = clone(org.tables || []); zones = clone(org.zones || []); renderPlan(); renderQrs(); }
    renderStripe();
  });

  // Vuelta desde el alta de Stripe
  const sp = new URLSearchParams(location.search).get("stripe");
  if (sp && PAGOS !== "prueba") {
    history.replaceState(null, "", location.pathname + location.hash);
    if (ctx.isOwner()) callFn("stripe-connect", { action: "status" })
      .then(r => toast(r.ready ? "¡Listo! Ya puedes cobrar." : "Stripe aún está revisando tus datos o falta algún paso."))
      .catch(x => toast(x.message));
  }

  function render() {
    el.innerHTML = '<section class="page narrow"><div class="page-head"><p class="eyebrow">' + esc(ctx.org.name) + '</p><h1 class="h1">Ajustes</h1></div>' +
      '<div class="card" id="stripe"></div>' +
      '<form class="card" id="dataForm" novalidate><div class="card-h"><h2 class="h2">Datos</h2></div>' +
        '<div class="grid2"><div class="field"><label for="dName">Nombre</label><input id="dName" value="' + esc(ctx.org.name) + '"></div><div class="field"><label for="dVenue">Sala por defecto</label><input id="dVenue" value="' + esc(ctx.org.venueName || "") + '" placeholder="Donde sueles hacer los eventos"></div></div>' +
        '<div class="field"><label for="dArea">Zona</label><input id="dArea" value="' + esc(ctx.org.area || "") + '" placeholder="Ej. Malasaña, Madrid"></div>' +
        '<p class="small">Tu página pública con todos tus eventos: <a href="' + esc(siteUrl("/eventos.html?o=" + ctx.orgId)) + '" target="_blank" rel="noopener" class="mono">' + esc(siteUrl("/eventos.html?o=" + ctx.orgId)) + '</a></p>' +
        '<button class="btn btn-primary" type="submit" style="align-self:flex-start">Guardar datos</button></form>' +
      '<div class="card"><div class="card-h"><h2 class="h2">Carta de la barra</h2><span class="small">Sale en el TPV y en “pedir desde la mesa”</span></div><div class="ed" id="prods"></div>' +
        '<div class="row"><button class="btn btn-sm" data-act="addProd">+ Añadir producto</button><button class="btn btn-sm btn-primary" data-act="saveProds" id="saveProds"' + (dirtyP ? '' : ' disabled') + '>Guardar carta</button></div></div>' +
      '<div class="card"><div class="card-h"><h2 class="h2">Plano de mesas VIP</h2><span class="small">Arrastra las mesas para colocarlas</span></div><div id="plan"></div>' +
        '<div class="ed" id="tbls"></div><div class="row"><button class="btn btn-sm" data-act="addTable">+ Añadir mesa</button><button class="btn btn-sm" data-act="tpl" data-id="local">Plantilla discoteca</button><button class="btn btn-sm" data-act="tpl" data-id="promotora">Plantilla nave</button>' +
        '<button class="btn btn-sm btn-primary" data-act="saveTables" id="saveTables"' + (dirtyT ? '' : ' disabled') + '>Guardar plano</button></div></div>' +
      '<div class="card qr-print"><div class="card-h"><h2 class="h2">Pedir desde la mesa</h2></div>' +
        '<label class="check"><input type="checkbox" id="clickPay"' + (ctx.org.clickPay !== false ? ' checked' : '') + '> Los clientes pueden pedir y pagar desde su mesa con un QR</label>' +
        '<p class="small">Imprime estos QR y ponlos en cada mesa. Al escanearlo, el cliente ve tu carta, paga con el móvil y el pedido llega a la barra.</p>' +
        '<div class="qr-grid" id="qrs"></div><button class="btn btn-sm no-print" data-act="print" style="align-self:flex-start">Imprimir QR de las mesas</button></div>' +
      '</section>';
    renderStripe(); renderProds(); renderPlan(); renderQrs();
  }

  function renderStripe() {
    const box = el.querySelector("#stripe"); if (!box) return;
    if (PAGOS === "prueba") {
      box.innerHTML = '<div class="card-h"><h2 class="h2">Cobros</h2><span class="chip chip-warn">Modo prueba</span></div>' +
        '<p class="small">En esta versión las compras se simulan: no se cobra nada y las entradas son de prueba. Sirve para probarlo todo y enseñárselo a otros locales.</p>' +
        '<p class="small">Para cobrar de verdad hace falta la versión con servidor y una cuenta de Stripe.</p>';
      return;
    }
    const o = ctx.org, owner = ctx.isOwner();
    const state = o.stripeReady ? ["Cobros activos", "ok"] : o.stripeAccountId ? ["Alta sin terminar", "warn"] : ["Sin conectar", "bad"];
    box.innerHTML = '<div class="card-h"><h2 class="h2">Cobros</h2><span class="chip chip-' + state[1] + '">' + state[0] + '</span></div>' +
      '<p class="small">' + (o.stripeReady
        ? 'El dinero de cada entrada, mesa y pedido llega a tu cuenta de Stripe y de ahí a tu banco. Aforo solo se queda los gastos de gestión que paga el comprador.'
        : 'Conecta una cuenta de Stripe para cobrar. Te pedirá tus datos (DNI o CIF) y la cuenta bancaria donde quieres recibir el dinero. Tarda unos 5 minutos.') + '</p>' +
      (owner
        ? '<div class="row">' + (o.stripeReady
            ? '<button class="btn btn-sm" data-act="stripe" data-id="dashboard"' + (stripeBusy ? ' disabled' : '') + '>Ver mis cobros en Stripe</button><button class="btn btn-sm" data-act="stripe" data-id="status"' + (stripeBusy ? ' disabled' : '') + '>Comprobar estado</button>'
            : '<button class="btn btn-primary btn-sm" data-act="stripe" data-id="link"' + (stripeBusy ? ' disabled' : '') + '>' + (o.stripeAccountId ? 'Continuar el alta' : 'Conectar cobros') + '</button>' + (o.stripeAccountId ? '<button class="btn btn-sm" data-act="stripe" data-id="status"' + (stripeBusy ? ' disabled' : '') + '>Ya lo he terminado</button>' : '')) + '</div>'
        : '<p class="hint">Solo el dueño de la cuenta puede gestionar los cobros.</p>');
  }

  function renderProds() {
    const box = el.querySelector("#prods"); if (!box) return;
    box.innerHTML = products.length ? products.map((p, i) =>
      '<div class="ed-row"><label class="sr" for="pn' + i + '">Producto</label><input id="pn' + i + '" data-p="' + i + '" data-k="name" value="' + esc(p.name) + '" placeholder="Nombre">' +
      '<label class="sr" for="pp' + i + '">Precio</label><input id="pp' + i + '" data-p="' + i + '" data-k="price" type="number" inputmode="decimal" min="0" step="0.5" value="' + esc(p.price) + '">' +
      '<label class="sr" for="pc' + i + '">Categoría</label><select id="pc' + i + '" data-p="' + i + '" data-k="cat">' + PRODUCT_CATS.concat(PRODUCT_CATS.includes(p.cat) ? [] : [p.cat]).map(c => '<option' + (c === p.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join("") + '</select>' +
      '<button type="button" class="icon-btn" data-act="delProd" data-id="' + i + '" aria-label="Quitar ' + esc(p.name) + '">×</button></div>').join("")
      : '<p class="small muted">Sin productos. Añade tu primera copa.</p>';
  }

  function renderPlan() {
    const plan = el.querySelector("#plan"), box = el.querySelector("#tbls"); if (!plan || !box) return;
    plan.innerHTML = mapHtml({ zones, tables }, { editing: true, act: "noop" });
    box.innerHTML = tables.length ? '<div class="ed-row ed-row-t small muted"><span>Mesa</span><span>Personas</span><span>Mínimo (€)</span><span></span></div>' + tables.map((t, i) =>
      '<div class="ed-row ed-row-t"><label class="sr" for="ti' + i + '">Nombre</label><input id="ti' + i + '" data-t="' + i + '" data-k="id" value="' + esc(t.id) + '" maxlength="6">' +
      '<label class="sr" for="tx' + i + '">Personas</label><input id="tx' + i + '" data-t="' + i + '" data-k="pax" type="number" inputmode="numeric" min="1" value="' + esc(t.pax) + '">' +
      '<label class="sr" for="tm' + i + '">Mínimo</label><input id="tm' + i + '" data-t="' + i + '" data-k="min" type="number" inputmode="numeric" min="0" step="10" value="' + esc(t.min) + '">' +
      '<button type="button" class="icon-btn" data-act="delTable" data-id="' + i + '" aria-label="Quitar mesa ' + esc(t.id) + '">×</button></div>').join("")
      : '<p class="small muted">Sin mesas. Si no vendes mesas VIP, déjalo así.</p>';
  }

  function renderQrs() {
    const box = el.querySelector("#qrs"); if (!box) return;
    const saved = ctx.org.tables || [];
    box.innerHTML = saved.length ? saved.map(t => {
      const url = siteUrl("/mesa.html?o=" + encodeURIComponent(ctx.orgId) + "&t=" + encodeURIComponent(t.id));
      return '<div class="qr-card"><div class="qr" data-qr="' + esc(url) + '"></div><b class="h2">Mesa ' + esc(t.id) + '</b><span class="small">Pide y paga desde aquí</span></div>';
    }).join("") : '<p class="small muted">Primero crea mesas en el plano.</p>';
    drawQR(box);
  }

  const markP = () => { dirtyP = true; const b = el.querySelector("#saveProds"); if (b) b.disabled = false; };
  const markT = () => { dirtyT = true; const b = el.querySelector("#saveTables"); if (b) b.disabled = false; };

  // Escribir en las filas de la carta y de las mesas
  const onInput = ev => {
    const t = ev.target;
    if (t.dataset.p != null) { const p = products[+t.dataset.p]; if (!p) return; p[t.dataset.k] = t.dataset.k === "price" ? Number(t.value) : t.value; markP(); }
    if (t.dataset.t != null) {
      const x = tables[+t.dataset.t]; if (!x) return;
      x[t.dataset.k] = t.dataset.k === "id" ? t.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : Math.max(0, Math.floor(Number(t.value) || 0));
      markT();
      if (t.dataset.k !== "id") return;
      const plan = el.querySelector("#plan"); if (plan) plan.innerHTML = mapHtml({ zones, tables }, { editing: true, act: "noop" });
    }
  };
  const onSubmit = async ev => {
    if (ev.target.id !== "dataForm") return; ev.preventDefault();
    const name = el.querySelector("#dName").value.trim();
    if (!name) { toast("El nombre no puede estar vacío."); return; }
    try { await updateDoc(doc(db, "orgs", ctx.orgId), { name, venueName: el.querySelector("#dVenue").value.trim(), area: el.querySelector("#dArea").value.trim(), slug: slugify(name) }); toast("Datos guardados."); }
    catch (x) { toast("No se pudieron guardar."); }
  };
  const onChange = async ev => {
    if (ev.target.id === "clickPay") {
      try { await updateDoc(doc(db, "orgs", ctx.orgId), { clickPay: ev.target.checked }); toast(ev.target.checked ? "Pedidos desde la mesa activados." : "Pedidos desde la mesa desactivados."); }
      catch (x) { toast("No se pudo guardar."); }
    }
    if (ev.target.dataset && ev.target.dataset.k === "cat") onInput(ev);
  };

  // Arrastrar mesas en el plano
  const onDown = ev => {
    const b = ev.target.closest(".map.editing .tbl"); if (!b) return;
    const map = b.closest(".map"), i = tables.findIndex(t => t.id === b.dataset.id); if (i < 0) return;
    ev.preventDefault();
    drag = { b, map, i, sx: ev.clientX, sy: ev.clientY, ox: tables[i].x, oy: tables[i].y, rect: map.getBoundingClientRect() };
    b.classList.add("drag"); try { b.setPointerCapture(ev.pointerId); } catch (x) { /* nada */ }
  };
  const onMove = ev => {
    if (!drag) return;
    const t = tables[drag.i];
    t.x = Math.round(Math.max(0, Math.min(100 - t.w, drag.ox + (ev.clientX - drag.sx) / drag.rect.width * 100)) * 10) / 10;
    t.y = Math.round(Math.max(0, Math.min(100 - t.h, drag.oy + (ev.clientY - drag.sy) / drag.rect.height * 100)) * 10) / 10;
    drag.b.style.left = t.x + "%"; drag.b.style.top = t.y + "%";
  };
  const onUp = () => { if (!drag) return; drag.b.classList.remove("drag"); if (tables[drag.i].x !== drag.ox || tables[drag.i].y !== drag.oy) markT(); drag = null; };
  el.addEventListener("input", onInput); el.addEventListener("submit", onSubmit); el.addEventListener("change", onChange);
  el.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);

  const offV = delegate(el, {
    noop() {},
    async stripe(d, b) {
      stripeBusy = true; renderStripe();
      try {
        const r = await callFn("stripe-connect", { action: d.id });
        if (r.url) { location.href = r.url; return; }
        toast(r.ready ? "Cobros activos." : r.connected ? "Stripe todavía está revisando tus datos o falta algún paso." : "Aún no has conectado Stripe.");
      } catch (x) { toast(x.message); }
      stripeBusy = false; renderStripe();
    },
    addProd() { products.push({ id: "p" + rid(6), name: "", price: 5, cat: "Copas" }); markP(); renderProds(); const i = el.querySelector("#pn" + (products.length - 1)); if (i) i.focus(); },
    delProd(d) { products.splice(+d.id, 1); markP(); renderProds(); },
    async saveProds(d, b) {
      const clean = products.filter(p => String(p.name).trim()).map(p => ({ id: p.id || "p" + rid(6), name: String(p.name).trim().slice(0, 60), price: Math.max(0, Math.round(Number(p.price) * 100) / 100), cat: p.cat || "Otros" }));
      b.disabled = true;
      try { await updateDoc(doc(db, "orgs", ctx.orgId), { products: clean }); products = clean; dirtyP = false; renderProds(); toast("Carta guardada: " + clean.length + " productos."); }
      catch (x) { b.disabled = false; toast("No se pudo guardar la carta."); }
    },
    addTable() {
      let n = tables.length + 1; while (tables.some(t => t.id === "M" + n)) n++;
      tables.push({ id: "M" + n, x: 44, y: 44, w: 10, h: 11, pax: 6, min: 300 }); markT(); renderPlan();
    },
    delTable(d) { tables.splice(+d.id, 1); markT(); renderPlan(); },
    tpl(d) { const l = DEFAULT_LAYOUTS[d.id]; zones = clone(l.zones); tables = clone(l.tables); markT(); renderPlan(); toast("Plantilla cargada. Ajusta las mesas y guarda."); },
    async saveTables(d, b) {
      const ids = tables.map(t => t.id);
      if (ids.some(id => !id)) { toast("Cada mesa necesita un nombre (ej. V1)."); return; }
      if (new Set(ids).size !== ids.length) { toast("Hay dos mesas con el mismo nombre."); return; }
      b.disabled = true;
      try { await updateDoc(doc(db, "orgs", ctx.orgId), { tables, zones }); dirtyT = false; renderPlan(); renderQrs(); toast("Plano guardado."); }
      catch (x) { b.disabled = false; toast("No se pudo guardar el plano."); }
    },
    print() { document.body.classList.add("print-qr"); window.print(); setTimeout(() => document.body.classList.remove("print-qr"), 500); }
  });

  render();
  return () => {
    offOrg(); offV();
    el.removeEventListener("input", onInput); el.removeEventListener("submit", onSubmit); el.removeEventListener("change", onChange);
    el.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
  };
}
