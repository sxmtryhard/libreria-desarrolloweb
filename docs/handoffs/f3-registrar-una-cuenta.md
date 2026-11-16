## Entrega: orquestador · F3 Registrar una cuenta desde el mostrador
**Hecho:**
- Contrato de cuentas (entrada de registro y cuenta creada), con correo normalizado y roles de mostrador.
- Servicio con la regla de roles, correo repetido y deshacer el registro a medias; repositorio en memoria y en Firebase (Authentication + `accounts/{uid}`).
- Ruta `POST /api/accounts` con el orden origen → sesión → rol → cuerpo.
- 44 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/accounts/schema.ts`
- `app/features/accounts/server/`: `account-service.ts`, `register-account-handler.ts`, `repository.ts`, `repository.memory.ts`, `repository.firebase.ts`
- `app/features/accounts/tests/register-account.test.ts`
- `app/features/container.ts`, `app/api/accounts/route.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 260 pruebas pasan; `npm run build` → compila con `/api/accounts`. Con `npm run dev`: `POST /api/accounts` sin cookie → 401.

Probado contra Firebase real el 2026-11-15 con un script temporal (ya borrado): estudiante → 403; rol `BIBLIOTECARIO` → 400 con `fields` `role`; bibliotecario registra con el correo en mayúsculas y con espacios → 201 con el correo en minúsculas; mismo correo → 409; la cuenta nueva pudo ingresar en Firebase Authentication; el documento `accounts/{uid}` solo tiene `email`, `name` y `role`. La cuenta de prueba se eliminó al terminar.

**Decisiones:**
- La unicidad del correo la garantiza Firebase Authentication al crear el usuario (`auth/email-already-exists` → `null` → 409); no hay consulta previa.
- Orden de creación: primero el usuario de Authentication y luego el documento; si el documento falla, se borra el usuario y el error sigue hasta el 500 genérico.
- No se cambió `app/shared/schema.ts`: el documento de cuenta sigue siendo `{ email, name, role }`, igual que el del seed.
- El rol se comprueba dos veces (antes de leer el cuerpo y dentro de `register`), como en F1.
- Hecho en una sola sesión de Claude Code, sin delegar en subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No hay formulario de mostrador ni ingreso (F4) todavía; solo la API.
- El caso «falla guardar el documento» y los dos registros simultáneos están probados con el repositorio en memoria, no provocados en Firebase real.
- Durante la prueba, el servidor de desarrollo que llevaba horas abierto respondía 500 con un módulo viejo; se resolvió reiniciándolo. No es un fallo del código (el build y el servidor recién arrancado funcionan).
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Baja | `app/features/accounts/server/account-service.ts` (`saveOrUndo`) | Si fallan a la vez guardar el documento y borrar el usuario, queda un usuario en Authentication sin documento. No puede obtener sesión: el rol sale de `accounts/{uid}` | Solo con dos fallos seguidos de Firebase | Aceptado; un administrador puede borrar el usuario desde la consola |
| Info | `app/features/accounts/schema.ts` | La contraseña inicial solo exige longitud (8–128), por decisión aprobada en la spec | — | Revisar al hacer F15 y F17 |
| Info | `app/shared/server/http.ts` (`fieldsOf`) | Los mensajes de campo salen en inglés; no incluyen el valor enviado (comprobado con la contraseña) | `password` de 7 caracteres | Fuera del alcance |

Sin hallazgos en autorización (sesión, rol y orden; un `ADMINISTRADOR` no puede crear personal aquí), validación (Zod con longitudes máximas y lista cerrada de roles), fuga de secretos (la contraseña no se guarda en Firestore, no se devuelve y no aparece en errores ni en registros) ni inyección. **Aprobado con observaciones.**
