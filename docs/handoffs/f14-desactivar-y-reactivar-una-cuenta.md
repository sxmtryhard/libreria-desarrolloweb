## Entrega: orquestador · F14 Desactivar y reactivar una cuenta
**Hecho:**
- `POST /api/accounts/deactivate` (`{ email, reason }`) y `POST /api/accounts/reactivate` (`{ email }`). Las dos responden 200 con `{ uid, email, name, role, active }`.
- Permisos por niveles: el bibliotecario actúa sobre `EXTERNO`, `ESTUDIANTE` y `DOCENTE`; el administrador también sobre `BIBLIOTECARIO`; nadie sobre un administrador ni sobre sí mismo (403). Prestatarios → 403; sin sesión → 401.
- Orden: origen → sesión → rol → cuerpo → cuenta (404) → permiso sobre ella (403) → cambio (409).
- Desactivar guarda en `accounts/{uid}` `active: false`, el motivo recortado, la fecha y quién; deshabilita el usuario en Authentication y cierra sus sesiones. Reactivar guarda `active: true`, la fecha y quién, conserva el último motivo y vuelve a habilitar el usuario.
- La cuenta desactivada pierde la sesión aunque su cookie siga vigente: `findRole` de la sesión devuelve `null` si `active` es `false`, lo que da 401.
- Préstamos: prestar a una cuenta desactivada → 409 «La cuenta está desactivada.»; la devolución funciona igual.
- El cambio ocurre en una transacción de Firestore (dos cambios a la vez: uno 200 y otro 409). Si Authentication falla después, se deshace el cambio del documento y se responde 500.
- 46 pruebas nuevas escritas desde la spec (44 de cuentas y 2 de préstamos); ninguna toca la red.

**Archivos:**
- Contrato común: `app/shared/schema.ts` (`active` opcional en `AccountSchema` e `isAccountActive`)
- Contrato de cuentas: `app/features/accounts/schema.ts` (`DeactivateAccountInputSchema`, `ReactivateAccountInputSchema`, `AccountStatusSchema`, `DeactivationRecordSchema`, `ReactivationRecordSchema`)
- `app/features/accounts/server/`: `account-status-service.ts`, `account-status-handlers.ts`, `repository.ts` (`AccountStatusRepository`), `repository.memory.ts`, `repository.firebase.ts`
- `app/api/accounts/deactivate/route.ts`, `app/api/accounts/reactivate/route.ts`, `app/features/container.ts`
- `app/shared/server/session.firebase.ts` (cuenta desactivada = sin sesión)
- Préstamos: `app/features/loans/server/repository.ts` (`Borrower.active`), `repository.memory.ts`, `repository.firestore.ts`, `loan-service.ts`
- Pruebas: `app/features/accounts/tests/account-status.test.ts`, `app/features/loans/tests/lend-disabled.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 798 pruebas pasan (solo falla `tests/project/guard.test.ts`, por el symlink de Windows); `npm run build` → compila con las dos rutas nuevas.

Probado contra Firebase real (2026-11-16) con dos bibliotecarios, un administrador y una estudiante desechables, un libro y un préstamo de prueba; todo ya se borró:
- La estudiante con un libro prestado: el bibliotecario la desactiva (correo en mayúsculas) → 200 con `active: false`; el documento guarda motivo, fecha y quién; Authentication la marca deshabilitada.
- Su sesión abierta pasa de 200 a 401; al ingresar, Firebase responde `USER_DISABLED`.
- Prestarle → 409 «La cuenta está desactivada.»; recibir su devolución → 200.
- Desactivar otra vez → 409; motivo de 9 caracteres → 400; correo sin cuenta → 404; sin sesión → 401.
- Bibliotecario sobre otro bibliotecario, sobre el administrador y sobre sí mismo → 403; el administrador desactiva y reactiva al bibliotecario → 200.
- Reactivar a la estudiante → 200; otra vez → 409; volvió a ingresar con su contraseña.

**Decisiones:**
- `active` va en el contrato común (`AccountSchema`) porque lo leen la sesión (`app/shared/server`) y préstamos, además de cuentas. Sin el campo, la cuenta está activa: las cuentas que ya existen no cambian.
- Se bloquea en dos sitios a propósito: Authentication (no puede ingresar) y el documento (la sesión deja de valer aunque falle cerrar sesiones).
- Servicio propio (`account-status-service.ts`) en vez de crecer `account-service.ts`, porque las reglas de permisos son distintas.
- Cosas que propuso el orquestador y la persona aprobó en la spec: las rutas, buscar por correo, el 409 al prestar, los 409 de «ya desactivada/activa», el 404 y guardar solo la última desactivación.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real el 500 cuando Authentication falla ni dos cambios simultáneos; están en las pruebas automáticas.
- Si deshacer también falla (Firestore y Authentication caídos a la vez), queda un registro en la consola del servidor y el estado puede quedar distinto entre los dos; se corrige repitiendo la acción contraria.
- En `/ingresar` la cuenta desactivada ve el error de ingreso de siempre (fuera de alcance).
- La pantalla es F37.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/accounts/server/account-status-handlers.ts` | El rol de quien pide se comprueba antes de leer el cuerpo: un prestatario no aprende si un correo existe | Un estudiante con un correo inexistente recibe 403, no 404 (prueba) | — |
| Baja | `app/features/accounts/server/account-status-service.ts` | Un bibliotecario sí aprende si un correo tiene cuenta (404 frente a 403); es personal y ya lo sabe por los préstamos (F5) | Bibliotecario con correo inexistente → 404 | Aceptado: es el orden de la regla 1.3 |
| Info | `app/features/accounts/server/account-status-service.ts` | El permiso sobre la cuenta se decide con el rol leído dentro de la transacción, no antes | Un cambio de rol a la vez no cuela una desactivación indebida | — |
| Info | `app/shared/server/session.firebase.ts` | La sesión se corta por el documento aunque la cookie siga vigente | Cookie vieja tras desactivar → 401 (Firebase real) | — |

Sin hallazgos que bloqueen. **Aprobado.**
