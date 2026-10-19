// Conexión con Firebase. Todas las páginas importan Firebase desde aquí.
// No hace falta tocar este archivo: la configuración va en js/config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, increment, arrayUnion, arrayRemove,
  runTransaction, writeBatch, Timestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const configured = !String(firebaseConfig.apiKey || "").startsWith("PEGA");
export const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = configured ? getAuth(app) : null;
// Los datos que ya se han visto se guardan en el móvil: si se va el wifi, la app sigue
// enseñándolos y apunta los cambios para mandarlos cuando vuelva la conexión.
function makeDb() {
  if (!configured) return null;
  try { return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { console.warn("Sin caché local", e); return getFirestore(app); }
}
export const db = makeDb();

// Segunda conexión, independiente de la sesión del usuario.
// La usa la demo para prepararse sola sin cerrar la sesión de quien esté dentro.
let sec = null;
export function secondary() {
  if (!configured) return null;
  if (!sec) { const a = initializeApp(firebaseConfig, "aforo-demo"); sec = { auth: getAuth(a), db: getFirestore(a) }; }
  return sec;
}

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  sendPasswordResetEmail, updateProfile,
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy,
  limit, onSnapshot, serverTimestamp, increment, arrayUnion, arrayRemove, runTransaction,
  writeBatch, Timestamp, deleteField
};

// Llama a una función de Netlify (cobros). Si hay usuario, manda su token.
export async function callFn(name, body) {
  const headers = { "Content-Type": "application/json" };
  if (auth && auth.currentUser) headers.Authorization = "Bearer " + (await auth.currentUser.getIdToken());
  const res = await fetch("/.netlify/functions/" + name, { method: "POST", headers, body: JSON.stringify(body || {}) });
  let data = {};
  try { data = await res.json(); } catch (e) { /* respuesta vacía */ }
  if (!res.ok) {
    const msg = data.error || (res.status === 404
      ? "No encuentro las funciones de cobro. ¿Está la web subida a Netlify?"
      : "Algo ha fallado (" + res.status + "). Inténtalo otra vez.");
    throw new Error(msg);
  }
  return data;
}

// Mensaje bonito cuando falta la configuración
export function notConfiguredHtml() {
  return '<div class="notice"><b>Falta conectar Firebase.</b><p class="small">Abre <span class="mono">js/config.js</span> y pega la configuración de tu proyecto de Firebase. Está explicado paso a paso en el README.</p></div>';
}
