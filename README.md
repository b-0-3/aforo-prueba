# Aforo · versión de prueba

Plataforma para discotecas, salas y promotoras: **venta de entradas, puerta con el móvil, RRPP y listas, mesas VIP y barra**.

Esta es la **versión pública de prueba**. Funciona entera en GitHub Pages, sin servidor y gratis.

> ⚠️ **Aquí las compras se simulan: no se cobra nada.** Sirve para probarlo todo y para enseñárselo a locales. **Nunca la uses para vender con dinero real**: cualquiera que sepa podría crearse entradas gratis. Para cobrar de verdad está la versión con servidor (repo privado `b-0-3/aforo`).

Dirección de la web: **https://b-0-3.github.io/aforo-prueba/**

---

## Puesta en marcha (10 minutos)

El proyecto de Firebase es el mismo de siempre (`aforo-be06a`) y ya está conectado en `js/config.js`.

### 1 · Activar GitHub Pages
En este repo: **Settings → Pages**.
- Source: **Deploy from a branch**
- Branch: **main** y carpeta **/ (root)** → **Save**

En 1 o 2 minutos la web estará en `https://b-0-3.github.io/aforo-prueba/`.

### 2 · Dar permiso a la web en Firebase
Firebase → **Seguridad → Authentication → Configuración → Dominios autorizados → Agregar dominio** → `b-0-3.github.io`

### 3 · Publicar las reglas de prueba
Firebase → **Firestore → Reglas**: borra todo, pega **entero** el archivo `firestore.rules` de este repo y pulsa **Publicar**.

> Son distintas de las del repo privado: estas dejan que los clientes "compren" sin servidor. Cuando pases a cobrar de verdad, vuelve a pegar las del repo privado.

### 4 · Probar
1. Entra en la web → **Entrar → Crear cuenta** y crea tu local.
2. **Eventos → Crear evento**.
3. **RRPP → Añadir RRPP**: se copia su enlace.
4. Abre el enlace en otro móvil (o en incógnito) y compra. Te salen las entradas con su QR.
5. En el panel, **Puerta → Abrir cámara** y escanea el QR: verde. Otra vez: rojo, "Ya está dentro".
6. **Ajustes → Pedir desde la mesa**: escanea el QR de una mesa con otro móvil, pide y mira cómo llega a **Barra → Pedidos de mesa**.

---

## Novedades (octubre 2026)

- **Puerta sin wifi.** El móvil de la puerta guarda las entradas del evento. Si se va la conexión, sigue validando (y la lista de invitados también) y lo sincroniza todo al volver. La web se puede abrir aunque no haya conexión.
- **Sección «Entradas»** en el panel: quién ha comprado, buscar, cambiar el nombre, anular (la plaza vuelve a quedar libre y se corrige la comisión del RRPP) y descargar en Excel.
- **Exportar a Excel**: entradas, liquidación de RRPP, listas de invitados, mesas y caja de la barra.
- **Códigos de descuento** por evento (% o € por entrada, con usos máximos). Se pueden compartir con un enlace que ya trae el código puesto.
- **Foto del cartel**: se sube desde el móvil y se reduce sola.
- **Cancelar un evento**: deja de venderse y el comprador lo ve en su entrada.
- **Entrada imprimible** y botón para añadir el evento al calendario.
- **Páginas legales** (`legal.html`) y casilla de «acepto las condiciones» al comprar.

> ⚠️ **Después de actualizar, vuelve a pegar `firestore.rules`** en Firebase → Firestore → Reglas → Publicar. Sin las reglas nuevas no funcionan los descuentos ni la gestión de entradas.

### Datos legales
Abre `js/config.js` y rellena el apartado `LEGAL` (nombre, NIF, domicilio y email). Hasta entonces, `legal.html` enseña esos huecos marcados. Es una plantilla orientativa: antes de cobrar de verdad, que la revise un profesional.

## Demo para cualquiera (sin registrarse)

La web trae una **Sala Demo** que se monta sola la primera vez que alguien entra: 3 eventos de ejemplo, RRPP, listas de invitados, mesas VIP reservadas, ventas en la barra y un pedido de mesa. No hay que configurar nada.

- En la portada, **Pruébalo ya** enseña los eventos de ejemplo: cualquiera puede comprar una entrada de prueba al momento.
- Con un botón se entra al panel de la demo como **Dueño**, **Portero**, **Camarero** o **RRPP** (también desde *Entrar*).
- Truco para enseñarla: abre la puerta en el ordenador, escanea con el móvil el QR de "¿No tienes entrada?", compra, y enséñale el QR de la entrada a la cámara del ordenador.
- Cuando un evento de ejemplo pasa, vuelve a ponerse a la venta solo en las próximas semanas.
- La demo es **compartida**: lo que haga uno lo ven los demás.

Cuentas de la demo (contraseña `aforo-demo-2026`): `demo.dueno@example.com`, `demo.puerta@example.com`, `demo.barra@example.com`, `demo.rrpp@example.com`.

**Si alguien la estropea:** en `js/demo.js` sube `VERSION` en 1 (por ejemplo de `1` a `2`) y se vuelve a montar sola.

## Quién ve qué

- **Dueño / Encargado**: todo.
- **Puerta**: escanear entradas, lista de invitados y llegada de mesas.
- **Barra**: TPV y pedidos de mesa.
- **RRPP**: su enlace, sus ventas, su comisión, el ranking y su lista.

Al equipo se le invita desde **Equipo → Invitar** (o **RRPP → Invitar a la app**). Se genera un enlace y se lo pasas por WhatsApp.

## Qué hay en el repo

| Archivo | Qué es |
|---|---|
| `index.html` | Portada para venderle Aforo a los locales |
| `eventos.html` / `evento.html` | Eventos a la venta y ficha de cada evento |
| `pedido.html` | "Mis entradas": QR, reserva o pedido |
| `mesa.html` | Lo que ve el cliente al escanear el QR de su mesa |
| `app/` | El panel (`entrar.html`, `unirse.html`, `index.html`) |
| `js/config.js` | Configuración. `PAGOS = "prueba"` es lo que hace que no se cobre |
| `js/pagos.js` | Las compras simuladas (entradas, mesas y pedidos de barra) |
| `js/app/views/` | Cada sección del panel |
| `legal.html` | Aviso legal, condiciones de compra, privacidad y cookies |
| `sw.js` | Copia de la web en el móvil para que funcione sin conexión |
| `firestore.rules` | Reglas de seguridad **de prueba** |

## Problemas típicos

| Lo que pasa | Cómo se arregla |
|---|---|
| La web sale sin estilos o en blanco | Espera 2 minutos a que GitHub Pages termine y recarga |
| "Firebase no deja guardar…" | Publica las reglas de este repo (paso 3) |
| No puedes crear la cuenta o entrar | Activa Correo/contraseña en Authentication y añade `b-0-3.github.io` en dominios autorizados (paso 2) |
| La cámara no se abre en la puerta | Da permiso a la cámara en el navegador. GitHub Pages ya va por `https` |

## Pasar a dinero real

1. Usa el repo privado `b-0-3/aforo` (tiene servidor y Stripe).
2. En Firebase, pega las reglas de producción de ese repo.
3. Sigue su README desde el paso 5.
