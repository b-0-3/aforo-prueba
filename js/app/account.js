// Crear la cuenta de un local o promotora y traducir los errores de acceso.
import { db, doc, collection, writeBatch, serverTimestamp } from "../firebase.js";
import { DEFAULT_LAYOUTS, DEFAULT_PRODUCTS, slugify } from "../ui.js";

export async function createOrg(user, { name, orgName, type, area }) {
  const t = type === "promotora" ? "promotora" : "local";
  const layout = DEFAULT_LAYOUTS[t];
  const orgRef = doc(collection(db, "orgs"));
  const batch = writeBatch(db);
  batch.set(orgRef, {
    name: orgName, type: t, slug: slugify(orgName), venueName: t === "local" ? orgName : "", area: area || "",
    ownerUid: user.uid, zones: layout.zones, tables: layout.tables, products: DEFAULT_PRODUCTS, clickPay: true,
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, "orgs", orgRef.id, "members", user.uid), { role: "owner", name: name || user.displayName || "", email: user.email || "", rrppId: null, joinedAt: serverTimestamp() });
  batch.set(doc(db, "users", user.uid), { orgId: orgRef.id, role: "owner", name: name || user.displayName || "" });
  await batch.commit();
  return orgRef.id;
}

export function authError(e) {
  const c = (e && e.code) || "";
  const m = {
    "auth/email-already-in-use": "Ya hay una cuenta con ese email. Entra con tu contraseña.",
    "auth/invalid-email": "Ese email no es válido.",
    "auth/weak-password": "La contraseña tiene que tener al menos 6 caracteres.",
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/wrong-password": "Email o contraseña incorrectos.",
    "auth/user-not-found": "No hay ninguna cuenta con ese email.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    "auth/network-request-failed": "Sin conexión. Comprueba tu internet.",
    "auth/operation-not-allowed": "El acceso con email no está activado en Firebase. Mira el README, paso 3.",
    "permission-denied": "Firebase no deja guardar los datos. ¿Has publicado las reglas de seguridad? (README, paso 4)"
  };
  return m[c] || (e && e.message) || "Algo ha fallado. Inténtalo otra vez.";
}

export const ROLE_NAMES = { owner: "Dueño", admin: "Encargado", puerta: "Puerta", barra: "Barra", rrpp: "RRPP" };
