# F0 · Base del proyecto

- **Estado:** Aprobada (por la persona, 2026-11-15)
- **Rol(es):** Sistema (no tiene pantallas; la usan todas las demás features)
- **Contrato afectado:** `app/shared/schema.ts` (se crea: roles, sesión y forma del error)

## Objetivo
Dejar lista la capa común (errores y HTTP, validación de origen, sesión, conexión con Firebase, validación del entorno y datos de ejemplo) para que cada feature posterior la use sin volver a decidirla.

## Reglas de negocio

### 1. Errores y su traducción a HTTP
1.1. Los errores de dominio son clases de `app/shared/server/errors.ts`. Cada una tiene un código fijo y un estado HTTP fijo:

| Clase | Código (`code`) | HTTP | Mensaje por defecto |
| --- | --- | --- | --- |
| `ValidationError` | `VALIDACION` | 400 | «Los datos enviados no son válidos.» |
| `UnauthenticatedError` | `NO_AUTENTICADO` | 401 | «Debes iniciar sesión.» |
| `ForbiddenError` | `NO_AUTORIZADO` | 403 | «No tienes permiso para hacer esto.» |
| `NotFoundError` | `NO_ENCONTRADO` | 404 | «No se encontró lo que buscabas.» |
| `ConflictError` | `CONFLICTO` | 409 | «La operación no se puede completar en el estado actual.» |
| cualquier otro error | `ERROR_INTERNO` | 500 | «Ocurrió un error inesperado.» |

1.2. Toda respuesta de error de la API tiene exactamente esta forma (decisión de la persona: código + mensaje en español):
```json
{ "error": { "code": "NO_AUTENTICADO", "message": "Debes iniciar sesión." } }
```
1.3. Un error de dominio puede llevar un mensaje propio en español; si no lo lleva, se usa el mensaje por defecto de la tabla.
1.4. Un error de validación de Zod (`ZodError`) se traduce igual que `ValidationError` (400, `VALIDACION`) y añade `error.fields`: una lista de `{ "path": "<campo>", "message": "<motivo>" }`, una entrada por campo inválido.
1.5. Un error inesperado responde **siempre** el mensaje por defecto de `ERROR_INTERNO`: nunca incluye el mensaje original, la traza ni nombres de archivos. El detalle se escribe solo en el registro del servidor (`console.error`).
1.6. Un cuerpo de petición que no es JSON válido se trata como `ValidationError`.

### 2. Validación del origen
2.1. Aplica a las peticiones con método `POST`, `PUT`, `PATCH` o `DELETE`. `GET`, `HEAD` y `OPTIONS` no se validan.
2.2. La petición se acepta solo si la cabecera `Origin` existe y su host (nombre y puerto) es igual al de la cabecera `Host` de la misma petición.
2.3. Si `Origin` falta o no coincide, se responde 403 con `NO_AUTORIZADO` y el mensaje «Origen no permitido.» (decisión de la persona: se rechaza con 403, sin lista de orígenes adicionales).
2.4. La validación de origen ocurre **antes** de leer la sesión y de leer el cuerpo.

### 3. Sesión
3.1. La sesión es una cookie de sesión de Firebase Authentication creada en el servidor a partir del token de ingreso. La app nunca ve ni guarda contraseñas (ADR-0003).
3.2. Duración: **8 horas** desde que se crea (decisión de la persona). Pasado ese tiempo la sesión no es válida y hay que ingresar de nuevo. No se renueva sola.
3.3. Cookie: nombre `session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = 28 800 s y `Secure` cuando `NODE_ENV` es `production`.
3.4. Verificar la sesión devuelve `{ uid, email, role }`. `uid` y `email` salen de la cookie verificada con Firebase (comprobando que no esté revocada); `role` sale del documento `accounts/{uid}` de Firestore.
3.5. La verificación falla con `UnauthenticatedError` si: no hay cookie, la cookie es inválida, venció, fue revocada, o no existe el documento `accounts/{uid}`.
3.6. Cerrar sesión borra la cookie (`Max-Age=0`) y revoca los tokens de ese usuario en Firebase.
3.7. Se ofrece un ayudante `requireRole(session, roles)` que lanza `ForbiddenError` si `session.role` no está en la lista. Qué rol puede qué **no** se decide aquí: lo decide cada feature.
3.8. Roles válidos (de `docs/features.md`): `EXTERNO`, `ESTUDIANTE`, `DOCENTE`, `BIBLIOTECARIO`, `ADMINISTRADOR`.
3.9. F0 entrega las funciones de crear, verificar y cerrar sesión. La ruta y la pantalla de ingreso son de F4.

### 4. Conexión con Firebase
4.1. El servidor usa `firebase-admin` con las variables `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY`. Se inicializa una sola vez por proceso.
4.2. `FIREBASE_PRIVATE_KEY` se normaliza antes de usarla: se quitan las comillas dobles envolventes si las trae y cada `\n` literal se convierte en salto de línea (ADR-0007).
4.3. Los módulos de `app/shared/server/` que tocan Firebase importan `server-only`.
4.4. El cliente de navegador (`firebase`) se configura con las variables `NEXT_PUBLIC_FIREBASE_*` y solo se usa para Authentication.

### 5. Variables de entorno
5.1. Variables obligatorias (las 7 de `.env.example`): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.
5.2. Se validan con Zod. Una variable es válida si existe y no está vacía después de quitar espacios. Además: `FIREBASE_CLIENT_EMAIL` debe tener forma de correo y `FIREBASE_PRIVATE_KEY` (ya normalizada) debe contener `BEGIN PRIVATE KEY`.
5.3. `npm run check:env` imprime una línea por variable con su nombre y un estado: `OK`, `FALTA` o `INVALIDA`. **Nunca imprime un valor**, ni entero ni parcial.
5.4. `npm run check:env` termina con código 0 si todas están `OK` y con código 1 si alguna no lo está.
5.5. Si el servidor intenta usar Firebase con el entorno inválido, falla con un error que nombra las variables con problema, sin mostrar valores.

### 6. Datos de ejemplo (`npm run seed`)
6.1. Crea **una cuenta por rol**, 5 en total (decisión de la persona). No crea libros: se añadirán cuando exista F1.

| Rol | Correo | Nombre |
| --- | --- | --- |
| `EXTERNO` | `externo@biblioteca.test` | Externo de Ejemplo |
| `ESTUDIANTE` | `estudiante@biblioteca.test` | Estudiante de Ejemplo |
| `DOCENTE` | `docente@biblioteca.test` | Docente de Ejemplo |
| `BIBLIOTECARIO` | `bibliotecario@biblioteca.test` | Bibliotecario de Ejemplo |
| `ADMINISTRADOR` | `admin@biblioteca.test` | Administrador de Ejemplo |

6.2. Cada cuenta se crea en Firebase Authentication (correo y contraseña) y como documento `accounts/{uid}` con `{ email, name, role }`.
6.3. La contraseña de las 5 cuentas se lee de la variable de entorno `SEED_PASSWORD` (mínimo 8 caracteres). No está escrita en el código ni en la documentación. Si falta o es más corta, el seed termina con código 1 sin crear nada.
6.4. El seed es repetible: si una cuenta ya existe (mismo correo), no la duplica ni cambia su contraseña; solo deja su documento `accounts/{uid}` con el rol y nombre de la tabla.
6.5. El seed imprime por cada cuenta `creada` o `ya existía`, nunca la contraseña.
6.6. Solo lo ejecuta la persona; los agentes no ejecutan `npm run seed`.

### 7. Pruebas sin red
7.1. Ninguna prueba toca la red ni el proyecto real de Firebase. La verificación de cookies y la lectura de cuentas se inyectan como dependencias (puertos) y las pruebas usan implementaciones en memoria.
7.2. El tiempo se inyecta (`now: Date`).
7.3. Las puertas de calidad (`npm run check`) ya existen y F0 no las reescribe.

## Entradas y salidas
| Entrada | Tipo / restricción |
| --- | --- |
| Cabecera `Origin` | Texto; obligatoria en `POST`/`PUT`/`PATCH`/`DELETE` |
| Cookie `session` | Cookie de sesión de Firebase; opcional (sin ella no hay sesión) |
| Variables de entorno | Las 7 de la regla 5.1, más `SEED_PASSWORD` solo para el seed |

Salida exitosa: sesión verificada `{ uid: string, email: string, role: Role }`.
Errores esperados: `UnauthenticatedError` → sin sesión válida (3.5); `ForbiddenError` → origen no permitido (2.3) o rol no permitido (3.7); `ValidationError` → cuerpo inválido (1.4, 1.6); `ERROR_INTERNO` → cualquier otro (1.5).

## Autorización
F0 no expone operaciones de negocio. Ofrece las piezas: sin sesión → 401; con sesión pero sin el rol pedido → 403. Qué rol exige cada operación lo decide la spec de esa feature.

## Criterios de aceptación
- **Dado** un `NotFoundError` sin mensaje propio, **cuando** se traduce a HTTP, **entonces** la respuesta es 404 con `{ "error": { "code": "NO_ENCONTRADO", "message": "No se encontró lo que buscabas." } }`.
- **Dado** un `ConflictError` con el mensaje «El libro ya está prestado.», **cuando** se traduce, **entonces** la respuesta es 409 con ese mensaje y el código `CONFLICTO`.
- **Dado** un `ZodError` con dos campos inválidos, **cuando** se traduce, **entonces** la respuesta es 400, código `VALIDACION` y `error.fields` tiene 2 entradas con `path` y `message`.
- **Dado** un `Error("connection refused at db.ts:42")`, **cuando** se traduce, **entonces** la respuesta es 500 con el mensaje «Ocurrió un error inesperado.» y el cuerpo no contiene «connection refused» ni «db.ts».
- **Dado** un `POST` con `Origin: https://otro-sitio.com` y `Host: biblioteca.app`, **cuando** se valida el origen, **entonces** se responde 403 `NO_AUTORIZADO` «Origen no permitido.».
- **Dado** un `POST` sin cabecera `Origin`, **cuando** se valida, **entonces** se responde 403.
- **Dado** un `POST` con `Origin: http://localhost:3000` y `Host: localhost:3000`, **cuando** se valida, **entonces** se acepta.
- **Dado** un `GET` sin cabecera `Origin`, **cuando** se valida, **entonces** se acepta.
- **Dado** una petición sin cookie `session`, **cuando** se verifica la sesión, **entonces** se lanza `UnauthenticatedError`.
- **Dado** una cookie válida de un `uid` con documento `accounts/{uid}` de rol `BIBLIOTECARIO`, **cuando** se verifica, **entonces** devuelve `{ uid, email, role: "BIBLIOTECARIO" }`.
- **Dado** una cookie válida de un `uid` sin documento en `accounts`, **cuando** se verifica, **entonces** se lanza `UnauthenticatedError`.
- **Dado** una cookie vencida o revocada, **cuando** se verifica, **entonces** se lanza `UnauthenticatedError`.
- **Dado** una sesión de rol `ESTUDIANTE`, **cuando** se llama `requireRole(session, ["BIBLIOTECARIO", "ADMINISTRADOR"])`, **entonces** se lanza `ForbiddenError`.
- **Dado** que se crea la cookie con `NODE_ENV=production`, **cuando** se leen sus atributos, **entonces** tiene `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` y `Max-Age=28800`.
- **Dado** un entorno al que le falta `FIREBASE_PROJECT_ID`, **cuando** se ejecuta la comprobación, **entonces** esa variable sale `FALTA`, las demás `OK` y el resultado es de fallo (código 1).
- **Dado** un entorno completo, **cuando** se ejecuta la comprobación, **entonces** las 7 salen `OK`, el código es 0 y la salida no contiene ninguno de los valores.
- **Dado** `FIREBASE_PRIVATE_KEY` entre comillas y con `\n` literales, **cuando** se normaliza, **entonces** no tiene comillas envolventes y tiene saltos de línea reales.
- **Dado** que no existe ninguna cuenta, **cuando** corre el seed con `SEED_PASSWORD` de 8 caracteres, **entonces** quedan 5 cuentas, una por rol, y se imprime `creada` 5 veces.
- **Dado** que el seed ya corrió, **cuando** corre otra vez, **entonces** siguen siendo 5 cuentas y se imprime `ya existía` 5 veces.
- **Dado** `SEED_PASSWORD` de 7 caracteres o ausente, **cuando** corre el seed, **entonces** termina con código 1 y no crea ninguna cuenta.

## Bordes
- `Origin` con el mismo nombre pero otro puerto (`localhost:3001` contra `localhost:3000`) → 403.
- `Origin` con valor `null` (texto) → 403.
- Variable de entorno con solo espacios → `FALTA`.
- `FIREBASE_CLIENT_EMAIL` sin forma de correo → `INVALIDA`.
- Cookie `session` vacía → `UnauthenticatedError`.
- Sesión creada hace exactamente 8 horas → no válida; hace 7 h 59 min → válida.
- `requireRole` con lista de roles vacía → `ForbiddenError` para cualquier sesión.
- `ZodError` con 1 campo → `error.fields` con 1 entrada.

## Fuera de alcance
- Pantalla y ruta de ingreso (F4), registro de cuentas (F3, F10), límite de intentos (F17), cuentas desactivadas (F14).
- Qué puede hacer cada rol.
- Libros de ejemplo (se añaden al seed en F1).
- Vercel Blob y despliegue.
- Barra de navegación y pantallas base (F33).

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Cuánto dura la sesión? → **8 horas.**
2. ¿Qué forma tiene la respuesta de error? → **Código + mensaje en español.**
3. ¿Qué datos crea el seed? → **Una cuenta por rol (5); sin libros.**
4. ¿Qué pasa con una petición que modifica datos desde otro origen? → **Se rechaza con 403.**

Propuestas del agente que quedan aceptadas si la persona aprueba la spec (puede cambiarlas antes):
5. Textos exactos de los mensajes de error por defecto (tabla 1.1).
6. Correos y nombres de las cuentas de ejemplo (tabla 6.1) y que la contraseña venga de `SEED_PASSWORD` con mínimo 8 caracteres.
7. La sesión no se renueva sola y cerrar sesión revoca los tokens (3.2, 3.6).
8. El rol se guarda en Firestore (`accounts/{uid}`), no dentro de la cookie (3.4).
