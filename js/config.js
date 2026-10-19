// ============================================================
//  AFORO · CONFIGURACIÓN
//  Este es el ÚNICO archivo que tienes que tocar para conectar
//  la web con tu proyecto de Firebase. Mira el README, paso 2.
// ============================================================

// 1) Pega aquí lo que te da Firebase en:
//    Configuración del proyecto → Tus apps → App web → "firebaseConfig"
export const firebaseConfig = {
  apiKey: "AIzaSyDAiR5TwOMDwL6m1yPQUzvSaiNAa4N9fDE",
  authDomain: "aforo-be06a.firebaseapp.com",
  projectId: "aforo-be06a",
  storageBucket: "aforo-be06a.firebasestorage.app",
  messagingSenderId: "86119175303",
  appId: "1:86119175303:web:0651ff4778c3363c125422"
};

// 2) Gastos de gestión que paga el comprador por cada entrada (en euros).
//    Esto es lo que ganas tú con cada entrada vendida.
//    Si lo cambias aquí, cámbialo también en Netlify (variable PLATFORM_FEE_CENTS).
export const FEE_PER_TICKET = 0.75;

// 3) Porcentaje del consumo mínimo que se paga como señal al reservar una mesa VIP.
//    Si lo cambias aquí, cámbialo también en Netlify (variable DEPOSIT_PCT).
export const DEPOSIT_PCT = 30;

// Nombre de la plataforma (sale en títulos y textos).
export const APP_NAME = "Aforo";

// 4) Cómo se cobra:
//    "prueba" → los pagos se simulan en el navegador. No hace falta servidor
//               (funciona en GitHub Pages). NUNCA cobra dinero de verdad.
//    "stripe" → cobros reales con Stripe. Necesita las funciones de Netlify
//               (repo privado b-0-3/aforo) y las reglas de seguridad de producción.
export const PAGOS = "prueba";

// 5) Tus datos para las páginas legales (legal.html). Hasta que los rellenes,
//    la página los enseña marcados como pendientes.
//    Ojo: es una plantilla orientativa. Antes de cobrar de verdad, que la revise un profesional.
export const LEGAL = {
  titular: "",        // Tu nombre y apellidos (o el de tu empresa)
  nif: "",            // Tu DNI/NIF o CIF
  domicilio: "",      // Dirección fiscal
  email: "",          // Email de contacto para clientes
  web: ""             // Dirección de la web (si la dejas vacía se usa la actual)
};
