## Entrega: orquestador · F15 Cambiar mi contraseña
**Hecho:**
- `POST /api/accounts/password` con `{ current_password, new_password }`, para cualquier rol con sesión y solo sobre su propia cuenta. Responde 204 sin cuerpo y borra la cookie de sesión.
- Orden: origen → sesión → cuerpo → nueva distinta de la actual → actual correcta → cambio.
- Errores: nueva igual → 400 «La contraseña nueva debe ser distinta de la actual.»; actual incorrecta → 400 «La contraseña actual no es correcta.»; Firebase bloquea por intentos → 409 «Demasiados intentos. Espera unos minutos.»; sin sesión → 401; otro origen → 403.
- Al cambiarla: Firebase Authentication guarda la nueva y se revocan todas las sesiones (también las de otros navegadores).
- Pantalla `/cambiar-contrasena` con «Contraseña actual», «Contraseña nueva» y «Repetir contraseña nueva»; revisa en el navegador en el orden de la regla 4.4; tras un error vacía los campos; tras el éxito lleva a `/ingresar?contrasena=cambiada`, que muestra «Tu contraseña cambió. Ingresa con la nueva.». Sin sesión lleva a `/ingresar`.
- Enlace «Cambiar contraseña» en la cabecera, junto a «Cerrar sesión», para todos los roles.
- 44 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- Contrato: `app/features/accounts/schema.ts` (`ChangePasswordInputSchema`)
- `app/features/accounts/server/`: `password-service.ts`, `change-password-handler.ts`, `repository.ts` (`PasswordRepository`), `repository.memory.ts`, `repository.firebase.ts` (`createFirebasePasswordRepository`)
- `app/api/accounts/password/route.ts`, `app/features/container.ts` (`changePasswordHandler`)
- `app/features/accounts/ui/`: `password-view.ts`, `password-form.tsx`, `session-status.tsx` (enlace)
- `app/cambiar-contrasena/page.tsx`, `app/ingresar/page.tsx` (aviso)
- Pruebas: `app/features/accounts/tests/change-password.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 842 pruebas pasan (solo falla `tests/project/guard.test.ts`, por el symlink de Windows); `npm run build` → compila con `/api/accounts/password` y `/cambiar-contrasena`. Con `npm run dev`: ingresar, abrir «Cambiar contraseña» en la cabecera y cambiarla.

Probado contra Firebase real (2026-11-16) con una estudiante desechable que ya se borró:
- API: sin sesión → 401; otro origen → 403; nueva igual → 400 con su mensaje; actual incorrecta → 400 con su mensaje; nueva de 7 → 400.
- Navegador: el enlace aparece en la cabecera; con la actual equivocada → «Error: La contraseña actual no es correcta.» y los tres campos vacíos; con la correcta → `/ingresar?contrasena=cambiada` con el aviso.
- Después: otra sesión abierta de la misma persona pasó de 200 a 401; la contraseña anterior da `INVALID_LOGIN_CREDENTIALS` y la nueva sirve; el documento `accounts/{uid}` no guarda contraseñas.
- A 360 y 768 px el enlace está dentro de «Menú», junto a «Cerrar sesión»; a 1024 px se ve en la cabecera. Sin desplazamiento horizontal; enlace, campos y botón de 44 px. Sin sesión, `/cambiar-contrasena` lleva a `/ingresar`.

**Decisiones:**
- La contraseña actual se comprueba en el servidor con la API REST de Firebase Authentication (`accounts:signInWithPassword`, con la clave pública que ya usa el navegador), sin crear sesión. No hay dependencias nuevas.
- La cookie se borra en la misma respuesta (`sessionService.close` sin cookie devuelve la cookie vacía) y las demás sesiones caen porque se revocan los tokens.
- El formulario usa `fetch` propio y no `postForm` de F36, porque la respuesta 204 no trae cuerpo.
- Cosas que propuso el orquestador y la persona aprobó en la spec: la ruta, la pantalla y el enlace en la cabecera, los mensajes, el 409 por intentos y el aviso en `/ingresar`.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real el 409 por demasiados intentos (habría que forzar el bloqueo de Firebase); está en las pruebas automáticas.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/accounts/server/password-service.ts` | La cuenta sale de la sesión; un `uid` o `email` en el cuerpo se ignora | Prueba «la cuenta sale de la sesión» | — |
| Info | `app/features/accounts/server/repository.firebase.ts` | Las contraseñas solo viajan a Firebase Authentication por HTTPS; no se guardan, no se devuelven ni aparecen en los mensajes de error | Prueba «ningún mensaje de error contiene las contraseñas» y el documento revisado en real | — |
| Baja | `app/features/accounts/server/repository.firebase.ts` | Probar la contraseña actual cuenta como intento de ingreso en Firebase; muchos intentos fallidos bloquean también el ingreso normal por un rato | Varios envíos con la actual equivocada | Aceptado: es el freno de Firebase contra adivinar; F17 tratará los intentos |
| Info | `app/features/accounts/server/change-password-handler.ts` | Se valida el origen antes de leer la sesión | Otro origen → 403 | — |

Sin hallazgos que bloqueen. **Aprobado.**
