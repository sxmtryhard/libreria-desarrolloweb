## Entrega: orquestador · F10 Autorregistrarse
**Hecho:**
- API pública `POST /api/accounts/register`: origen → cuerpo (nombre, correo, contraseña de 8 a 128) → crea la cuenta siempre como `EXTERNO`. Responde 201; correo repetido → 409 «Ya existe una cuenta con ese correo.»; datos malos → 400; otro origen → 403.
- Si falla guardar el documento en Firestore, se borra el usuario recién creado en Authentication (igual que F3).
- Pantalla `/registrarse` con Nombre, Correo, Contraseña y Repetir contraseña. Revisa los datos en el navegador en el orden de la spec; tras crear la cuenta inicia sesión por el mismo camino de F4 y va al inicio. Si la cuenta se creó pero no se pudo ingresar, avisa y enlaza a `/ingresar`.
- Quien ya tiene sesión y abre `/registrarse` va a `/`.
- Enlaces entre `/ingresar` («¿No tienes cuenta? Regístrate») y `/registrarse` («¿Ya tienes cuenta? Ingresa»).
- 47 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/api/accounts/register/route.ts`
- `app/features/accounts/schema.ts` (se añadió `SelfRegisterInputSchema`)
- `app/features/accounts/server/account-service.ts` (`selfRegister`; creación compartida con F3), `app/features/accounts/server/self-register-handler.ts`
- `app/features/accounts/ui/`: `register-form.tsx`, `register-messages.ts`, `sign-in-client.ts` (nuevo, sale de `sign-in-form.tsx`), `sign-in-form.tsx`
- `app/registrarse/page.tsx`, `app/ingresar/page.tsx`
- `app/features/container.ts` (`selfRegisterHandler`)
- Pruebas: `app/features/accounts/tests/self-register.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 599 pruebas pasan (solo falla `tests/project/guard.test.ts`, por el symlink de Windows); `npm run build` → compila con `/registrarse`. Con `npm run dev`: abrir `/ingresar` → «Regístrate».

Probado contra Firebase real (2026-11-16) con una cuenta desechable ya borrada:
- `curl` sin origen → 403; cuerpo vacío → 400 con los campos.
- Formulario vacío → «Error: Escribe tu nombre.»; contraseñas distintas → «Error: Las contraseñas no coinciden.», se conservan nombre y correo y se vacían las contraseñas.
- Registro válido con el correo en mayúsculas → termina en `/` con «correo en minúsculas · Externo» y los enlaces de prestatario; el documento en Firestore tiene `role: "EXTERNO"`.
- Con sesión, `/registrarse` → `/`.
- Tras cerrar sesión, el mismo correo → «Error: Ya existe una cuenta con ese correo.».
- Sin desplazamiento horizontal a 360, 768 y 1024 px; campos y botón de 44 px.

**Decisiones:**
- `account-service.ts` se reorganizó: F3 (`register`) y F10 (`selfRegister`) comparten una función `create`. `register` pasó a ser `async` para que un rol sin permiso rechace la promesa en vez de lanzar de forma síncrona (lo detectó una prueba de F3, que no se cambió).
- `signInWithPassword` se movió a `sign-in-client.ts` para que F4 y F10 usen el mismo camino de ingreso.
- Texto propio no pedido en la spec: «Creando cuenta…» mientras se envía y «Ir a ingresar».
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real: «la cuenta se creó pero no se pudo ingresar», el borrado del usuario si falla Firestore ni dos registros simultáneos con el mismo correo. Están en las pruebas automáticas.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Media | `app/api/accounts/register/route.ts` | La ruta es pública y no tiene límite de intentos ni CAPTCHA: un script puede crear muchas cuentas | Repetir `POST` con correos distintos | Fuera de la spec F10; proponer una feature de límite de intentos si el curso lo pide |
| Baja | `app/features/accounts/server/account-service.ts` (`create`) | El 409 revela que un correo ya tiene cuenta | Registrar un correo conocido | Aceptado en la spec F10 (el mensaje es una decisión de la persona) |
| Info | `app/features/accounts/server/account-service.ts` (`selfRegister`) | El rol no sale del cuerpo: siempre `EXTERNO` | Enviar `role: "ADMINISTRADOR"` → el esquema lo ignora | — |
| Info | `app/features/accounts/server/self-register-handler.ts` | La contraseña solo viaja hacia Authentication; no se guarda ni se registra en logs | — | — |

Sin hallazgos que bloqueen. **Aprobado.**
