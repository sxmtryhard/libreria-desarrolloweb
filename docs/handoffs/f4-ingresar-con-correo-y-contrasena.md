## Entrega: orquestador · F4 Ingresar con correo y contraseña
**Hecho:**
- Contrato de ingreso (`id_token`) y respuesta de sesión.
- Rutas `POST /api/session` (origen → cuerpo → token; crea la cookie de 8 h solo si la cuenta tiene documento) y `DELETE /api/session` (origen → cerrar; 204 aunque no haya sesión).
- Pantalla `/ingresar` con el formulario; quien ya ingresó va a `/`.
- Bloque de sesión en la página de inicio: enlace «Ingresar» o «Ingresaste como <correo> (<rol>)» con el botón «Cerrar sesión».
- 45 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/accounts/schema.ts` (se añadió `SignInInputSchema` y `SignedInSchema`)
- `app/features/accounts/server/session-handlers.ts`
- `app/features/accounts/ui/`: `sign-in-form.tsx`, `sign-in-messages.ts`, `sign-out-button.tsx`, `session-block.tsx`
- `app/features/accounts/tests/sign-in.test.ts`
- `app/api/session/route.ts`, `app/ingresar/page.tsx`, `app/page.tsx` (bloque de sesión)
- `app/features/container.ts` (`signInHandler`, `signOutHandler`, `currentSession`)
- `app/shared/server/session.ts` y `session.firebase.ts` (crear la cookie devuelve `null` si Firebase rechaza el token → 401)

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 305 pruebas pasan; `npm run build` → compila con `/ingresar` y `/api/session`. Con `npm run dev`: abrir `http://localhost:3000/ingresar` e ingresar con una cuenta del seed.

Probado contra Firebase real el 2026-11-15 con una cuenta desechable (ya borrada) y el navegador:
- Formulario vacío → «Escribe tu correo y tu contraseña.».
- Contraseña equivocada → «Correo o contraseña incorrectos.», el correo se conserva y la contraseña se borra.
- Credenciales correctas → termina en `/` con «Ingresaste como … (Estudiante)»; la cookie no es visible desde JavaScript (`HttpOnly`).
- Abrir `/ingresar` con sesión → termina en `/`.
- «Cerrar sesión» → termina en `/ingresar` y `/` vuelve a mostrar «Ingresar».
- Con `curl`: sin `Origin` → 403; token inventado → 401; sin `id_token` → 400 con `fields` `id_token`; `DELETE` sin cookie → 204 con `Max-Age=0`.
- Sin desplazamiento horizontal a 360, 645 y 1024 px; campos y botón de 44 px de alto. No se midió exactamente a 768 px.

**Decisiones:**
- La cookie se escribe solo después de comprobar que la cuenta tiene documento: se crea, se verifica con el servicio de sesión de F0 y recién entonces se pone en la respuesta.
- `SessionAuthPort.createCookie` ahora devuelve `string | null`; `null` = token rechazado por Firebase (inválido, vencido, usuario deshabilitado o inexistente). Las pruebas de F0 no cambiaron.
- `currentSession()` vive en el contenedor para que las páginas no importen `server/`. Llama a `connection()` antes de leer la hora: sin eso Cache Components marca error por `new Date()` al prerenderizar.
- El rol se muestra con su nombre en español («Estudiante»), no con el código (`ESTUDIANTE`).
- Texto propio no pedido en la spec: «No has ingresado.» (inicio sin sesión), «Cerrando…» y «No se pudo cerrar la sesión. Intenta de nuevo.» (si falla el cierre).
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real el bloqueo de Firebase por demasiados intentos ni el fallo de la revocación (solo pruebas automáticas).
- Dos veces (F3 y F4) el servidor de desarrollo siguió con una versión vieja del contenedor tras añadirle exportaciones; se resuelve reiniciando `npm run dev`.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Baja | `app/features/accounts/server/session-handlers.ts` (`createSignInHandler`) | No se exige que el token de ingreso sea reciente: un token de Firebase robado sigue sirviendo para crear una sesión de 8 h mientras no venza (1 h) | Enviar un `id_token` emitido hace 50 minutos | Aceptado; valorar exigir un ingreso de menos de 5 minutos al hacer F17 |
| Info | `app/features/accounts/ui/sign-in-form.tsx` | El mensaje genérico no revela si un correo existe; el límite de intentos es solo el de Firebase | — | F17 |
| Info | `app/features/accounts/server/session-handlers.ts` (`createSignOutHandler`) | Cerrar sesión revoca los tokens de la cuenta en todos los dispositivos (regla 4.3) | — | Decisión aprobada |

Sin hallazgos en: origen (se valida antes del cuerpo y del token en las dos rutas), identidad (sale del token verificado; `uid`, correo o rol en el cuerpo se ignoran), cookie (`HttpOnly`, `SameSite=Lax`, `Secure` en producción), fuga de secretos (la contraseña no llega al servidor de la app; el token no se devuelve ni se registra) ni redirecciones abiertas (los destinos `/` y `/ingresar` son fijos). **Aprobado con observaciones.**
