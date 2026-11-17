## Entrega: orquestador · F13 Crear una cuenta de bibliotecario
**Hecho:**
- Ruta `POST /api/accounts/staff`, solo para `ADMINISTRADOR`. Recibe `{ name, email, password }` con las reglas de F3 y responde 201 con `{ uid, email, name, role: "BIBLIOTECARIO" }`, sin la contraseña.
- El rol siempre es `BIBLIOTECARIO`; un `role` en el cuerpo se ignora. La ruta no crea administradores.
- Orden: origen → sesión → rol → cuerpo → creación. Bibliotecario y prestatarios → 403 aunque el cuerpo sea inválido o el correo esté repetido; sin sesión → 401.
- Correo repetido → 409 «Ya existe una cuenta con ese correo.» y la cuenta existente no cambia. Si falla guardar el documento, se borra el usuario recién creado y se responde 500.
- Reutiliza la creación de F3/F10 (`create` y `saveOrUndo` del servicio de cuentas); `POST /api/accounts` (F3) no cambia.
- 28 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- Contrato: `app/features/accounts/schema.ts` (`StaffAccountInputSchema`, igual que la entrada de F10)
- `app/features/accounts/server/account-service.ts` (`assertCanCreateLibrarian`, `createLibrarian`), `app/features/accounts/server/staff-account-handler.ts`
- `app/api/accounts/staff/route.ts`, `app/features/container.ts` (`staffAccountHandler`)
- Pruebas: `app/features/accounts/tests/staff-account.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 752 pruebas pasan (solo falla `tests/project/guard.test.ts`, por el symlink de Windows); `npm run build` → compila con `/api/accounts/staff`.

Probado contra Firebase real (2026-11-16) con un administrador y un bibliotecario desechables, por HTTP contra `npm run dev`; todo lo creado ya se borró:
- Administrador con correo en mayúsculas y espacios y `role: "ADMINISTRADOR"` en el cuerpo → 201 con `role: "BIBLIOTECARIO"` y el correo normalizado; el documento `accounts/{uid}` quedó con `{ email, name, role: "BIBLIOTECARIO" }`; la respuesta no trae la contraseña.
- El mismo correo otra vez → 409; el correo del bibliotecario existente → 409 y su rol sigue igual.
- Bibliotecario → 403 «No tienes permiso para hacer esto.»; sin sesión → 401; otro origen → 403; contraseña de 7 → 400.
- La cuenta nueva ingresó (F4) y la cabecera mostró «<correo> · Bibliotecario».

**Decisiones:**
- `StaffAccountInputSchema` es el mismo esquema que el de F10 (mismos tres datos y reglas), con su propio nombre para que cada ruta tenga su contrato.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real el 500 al fallar Firestore ni las dos creaciones simultáneas; están en las pruebas automáticas.
- La pantalla del administrador es F37.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/accounts/server/staff-account-handler.ts` | El rol se comprueba antes de leer el cuerpo: quien no es administrador no aprende si un correo existe | Un bibliotecario con un correo repetido recibe 403, no 409 (prueba) | — |
| Info | `app/features/accounts/server/account-service.ts` | El rol de la cuenta nueva es una constante del servicio; nunca sale del cuerpo | `role: "ADMINISTRADOR"` en el cuerpo → `BIBLIOTECARIO` (prueba y Firebase real) | — |
| Info | `app/features/accounts/server/account-service.ts` | La contraseña solo va a Firebase Authentication; no se guarda, no se devuelve ni se registra | — | — |

Sin hallazgos que bloqueen. **Aprobado.**
