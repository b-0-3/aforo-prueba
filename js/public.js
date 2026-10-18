// Ayudas para la web pública (clientes que compran)
export const params = new URLSearchParams(location.search);

const RK = "aforo-rrpp", OK = "aforo-pedidos";
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "") || d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };

// Recuerda de qué RRPP viene el cliente durante 7 días (para que la venta cuente para él)
export function rememberRrpp(orgId, code) {
  if (!orgId || !code) return;
  const m = read(RK, {});
  m[orgId] = { code: String(code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20), at: Date.now() };
  write(RK, m);
}
export function rrppFor(orgId) {
  const r = read(RK, {})[orgId];
  return r && Date.now() - r.at < 7 * 864e5 ? r.code : null;
}

// Guarda en este móvil los pedidos hechos, para encontrarlos luego en "Mis entradas"
export function rememberOrder(id, label) {
  if (!id) return;
  const list = read(OK, []).filter(x => x.id !== id);
  list.unshift({ id, label: label || "", at: Date.now() });
  write(OK, list.slice(0, 40));
}
export const myOrders = () => read(OK, []);
export function forgetOrder(id) { write(OK, read(OK, []).filter(x => x.id !== id)); }
