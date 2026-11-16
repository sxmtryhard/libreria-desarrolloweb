# F4 · Ingresar con correo y contraseña

- **Estado:** Aprobada (por la persona, 2026-11-15)
- **Rol(es):** Todos (`EXTERNO`, `ESTUDIANTE`, `DOCENTE`, `BIBLIOTECARIO`, `ADMINISTRADOR`)
- **Contrato afectado:** `app/features/accounts/schema.ts` (se añade la entrada de ingreso y la respuesta de sesión)

## Objetivo
Que una persona con cuenta pueda ingresar con su correo y su contraseña desde una pantalla, quede con sesión, y pueda cerrarla.

## Reglas de negocio

### 1. Cómo se ingresa
1.1. La pantalla de ingreso está en `/ingresar`. Tiene un formulario con correo, contraseña y el botón «Ingresar».
1.2. La contraseña se comprueba en el navegador contra Firebase Authentication (ADR-0003). El servidor de la app nunca recibe ni guarda la contraseña: recibe solo el token de ingreso que entrega Firebase.
1.3. Con ese token el navegador llama a `POST /api/session` con el cuerpo `{ "id_token": "<token>" }`.
1.4. El servidor crea la cookie de sesión de F0 (regla 3 de F0: 8 horas, `HttpOnly`) y comprueba que exista el documento `accounts/{uid}`. Si todo va bien responde 200 con `{ "uid", "email", "role" }` y deja la cookie puesta.
1.5. Si el token es inválido o venció, o la cuenta no tiene documento `accounts/{uid}`, responde 401 `NO_AUTENTICADO` y **no** deja cookie de sesión.
1.6. Orden en `POST /api/session`: origen (regla 2 de F0) → cuerpo → token. No exige sesión previa.
1.7. Después de recibir el 200, el navegador cierra la sesión del cliente de Firebase: la única sesión que queda es la cookie del servidor.
1.8. Después de ingresar, la persona va a la página de inicio (`/`), sea cual sea su rol (decisión de la persona).
1.9. Ingresar con una sesión ya abierta reemplaza la cookie anterior por la nueva.

### 2. Validación y mensajes
2.1. `id_token`: texto obligatorio, de 1 a 4096 caracteres. Si falta o no cumple → 400 `VALIDACION` con `fields` `id_token`.
2.2. En el formulario, el correo y la contraseña son obligatorios. Al correo se le quitan los espacios de los extremos; a la contraseña no se le toca nada.
2.3. Si falta el correo o la contraseña, no se llama a Firebase y se muestra «Escribe tu correo y tu contraseña.».
2.4. Si el correo no existe, la contraseña está mal o el correo no tiene forma de correo, se muestra **el mismo mensaje**: «Correo o contraseña incorrectos.» (decisión de la persona: mensaje genérico, no revela si un correo tiene cuenta).
2.5. Si el servidor responde 401 (regla 1.5), se muestra también «Correo o contraseña incorrectos.».
2.6. Si Firebase bloquea por demasiados intentos, se muestra «Demasiados intentos. Intenta de nuevo más tarde.». (El límite propio de la app es de F17.)
2.7. Cualquier otro fallo (sin conexión, error 500) muestra «No se pudo ingresar. Intenta de nuevo.».
2.8. El mensaje de error aparece junto al formulario con `role="alert"`. El correo escrito se conserva; la contraseña se borra.
2.9. Mientras se está ingresando, el botón queda deshabilitado y dice «Ingresando…».

### 3. Quien ya ingresó
3.1. Si una persona con sesión válida abre `/ingresar`, se le redirige a `/` y no ve el formulario (decisión de la persona).
3.2. Si la cookie existe pero ya no es válida (venció o fue revocada), ve el formulario normal.

### 4. Cerrar sesión
4.1. `DELETE /api/session` cierra la sesión: borra la cookie y revoca los tokens del usuario en Firebase (regla 3.6 de F0). Responde 204 sin cuerpo.
4.2. Orden: origen → cerrar. Si no hay cookie o no es válida, igual borra la cookie y responde 204.
4.3. Revocar los tokens cierra la sesión de esa cuenta en todos los dispositivos.
4.4. Después de cerrar sesión, la persona va a `/ingresar`.

### 5. Página de inicio
5.1. La página de inicio (`/`) muestra, arriba, un bloque de sesión:
- Sin sesión: el enlace «Ingresar», que lleva a `/ingresar`.
- Con sesión: el texto «Ingresaste como <correo> (<rol>)» y el botón «Cerrar sesión».
5.2. El resto de la página de inicio no cambia. La barra de navegación definitiva es de F33.

## Entradas y salidas
| Entrada | Tipo / restricción |
| --- | --- |
| `id_token` (cuerpo de `POST /api/session`) | Texto, 1–4096 caracteres |
| Correo (formulario) | Texto obligatorio, sin espacios en los extremos |
| Contraseña (formulario) | Texto obligatorio; no se envía al servidor de la app |
| Cookie `session` | La de F0 |

Salida exitosa de `POST /api/session`: 200 `{ "uid": string, "email": string, "role": Role }` + cookie `session`.
Salida exitosa de `DELETE /api/session`: 204 sin cuerpo + cookie `session` borrada.
Errores esperados: 400 `VALIDACION` (cuerpo inválido o no JSON); 401 `NO_AUTENTICADO` (token inválido o cuenta sin documento); 403 `NO_AUTORIZADO` «Origen no permitido.»; 500 `ERROR_INTERNO`.

## Autorización
Ingresar y cerrar sesión no exigen rol. La identidad sale del token verificado por Firebase, nunca de un `uid` o correo enviado en el cuerpo. El rol sale de `accounts/{uid}`.

## Criterios de aceptación
- **Dado** un token válido de una cuenta con documento de rol `ESTUDIANTE`, **cuando** se llama a `POST /api/session`, **entonces** responde 200 con `{ uid, email, role: "ESTUDIANTE" }` y la respuesta pone la cookie `session` con `Max-Age=28800`.
- **Dado** un token inválido, **cuando** se llama a `POST /api/session`, **entonces** responde 401 `NO_AUTENTICADO` y no pone cookie de sesión.
- **Dado** un token válido de un usuario sin documento `accounts/{uid}`, **cuando** se llama a `POST /api/session`, **entonces** responde 401 y no queda cookie de sesión.
- **Dado** un cuerpo sin `id_token`, **cuando** se llama a `POST /api/session`, **entonces** responde 400 `VALIDACION` con `fields` `id_token`.
- **Dado** un `POST /api/session` desde otro origen, **cuando** se procesa, **entonces** responde 403 y no se mira el token.
- **Dado** una sesión válida, **cuando** se llama a `DELETE /api/session`, **entonces** responde 204, la cookie queda con `Max-Age=0` y los tokens del usuario quedan revocados.
- **Dado** que no hay cookie, **cuando** se llama a `DELETE /api/session`, **entonces** responde 204 y no se revoca nada.
- **Dado** un `DELETE /api/session` sin cabecera `Origin`, **cuando** se procesa, **entonces** responde 403 y la sesión sigue abierta.
- **Dado** el formulario con correo y contraseña correctos, **cuando** se envía, **entonces** la persona queda en `/` y ve «Ingresaste como <correo> (<rol>)».
- **Dado** el formulario con la contraseña equivocada, **cuando** se envía, **entonces** se ve «Correo o contraseña incorrectos.», el correo sigue escrito y la contraseña queda vacía.
- **Dado** el formulario con un correo que no tiene cuenta, **cuando** se envía, **entonces** se ve el mismo mensaje «Correo o contraseña incorrectos.».
- **Dado** el formulario con la contraseña vacía, **cuando** se envía, **entonces** se ve «Escribe tu correo y tu contraseña.» y no se llama a Firebase.
- **Dado** una persona con sesión válida, **cuando** abre `/ingresar`, **entonces** termina en `/`.
- **Dado** una persona con sesión, **cuando** pulsa «Cerrar sesión», **entonces** termina en `/ingresar` y `/` muestra el enlace «Ingresar».

## Bordes
- `id_token` vacío (`""`) → 400.
- `id_token` de 4097 caracteres → 400; de 4096 → se intenta verificar.
- `id_token` que no es texto (número, `null`) → 400.
- Cuerpo que no es JSON → 400.
- Correo con espacios alrededor (`"  ana@x.test "`) → se ingresa con `ana@x.test`.
- Contraseña con espacios al inicio o al final → se envía tal cual.
- Cookie vencida al abrir `/ingresar` → se ve el formulario.
- `DELETE /api/session` dos veces seguidas → 204 las dos.
- Falla la revocación en Firebase al cerrar sesión → 500 y la cookie no se borra.

## Fuera de alcance
- Límite propio de intentos fallidos (F17), recuperar contraseña (F16), cambiar contraseña (F15), autorregistro (F10), cuentas desactivadas (F14).
- Barra de navegación y pantallas base (F33); páginas distintas por rol.
- «Recordarme», ingreso con Google u otros proveedores.
- Volver a la página que la persona quería abrir antes de ingresar.

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Qué incluye? → **Pantalla + API + cerrar sesión.**
2. ¿Mensaje con credenciales malas? → **Uno genérico: «Correo o contraseña incorrectos.».**
3. ¿A dónde va después de ingresar? → **Al inicio (`/`), todos los roles.**
4. ¿Y si ya ingresó y abre `/ingresar`? → **Se le manda al inicio.**
