## Entrega: orquestador · F12 Aprobar o rechazar una solicitud de docente
**Hecho:**
- `GET /api/teacher-requests/pending`: solo `BIBLIOTECARIO` y `ADMINISTRADOR`; las solicitudes `PENDIENTE`, la más antigua primero, como máximo 100, con `id`, `uid`, `email`, `name`, `reason` y `requested_at`.
- `POST /api/teacher-requests/decision` con `{ request_id, decision, note }`: origen → sesión → rol → cuerpo → decisión. Responde 200 con `{ id, status, decided_at, note }`.
- Aprobar: la solicitud queda `APROBADA` y la cuenta pasa a `DOCENTE` en la misma transacción. Si la cuenta ya no es `EXTERNO` ni `ESTUDIANTE` (o no existe) → 409 «La cuenta ya no puede recibir el rol de docente.». La nota se ignora.
- Rechazar: la solicitud queda `RECHAZADA` con la nota opcional recortada (hasta 500 caracteres; vacía → sin nota); el rol no cambia.
- La decisión es final: sobre una ya decidida → 409 «La solicitud ya fue decidida.»; id que no existe → 404 «No existe esa solicitud.». Se guardan `decided_at` y `decided_by_uid`.
- En `/solicitar-docente` (F11), debajo de «Tu última solicitud fue rechazada.» aparece «Nota del personal: …» si la hay.
- 37 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/api/teacher-requests/pending/route.ts`, `app/api/teacher-requests/decision/route.ts`
- `app/features/accounts/schema.ts` (`PendingTeacherRequestSchema`, `PendingTeacherRequestsResponseSchema`, `DecideTeacherRequestInputSchema`, `DecidedTeacherRequestSchema`, `MyTeacherRequestSchema`; campos de la decisión en `NewTeacherRequestSchema`)
- `app/features/accounts/server/`: `teacher-request-service.ts` (`assertCanDecide`, `listPending`, `decide`), `teacher-decision-handlers.ts`, `teacher-requests.ts` (`oldestPending`, `toPendingTeacherRequest`), `repository.ts` (`listPending`, `decide`, `DecisionState`, `DecisionChange`), `repository.memory.ts`, `repository.firebase.ts`
- `app/features/accounts/ui/teacher-request-view.ts` (`latestRequestNote`), `app/solicitar-docente/page.tsx`
- `app/features/container.ts` (`pendingTeacherRequestsHandler`, `teacherDecisionHandler`)
- Pruebas: `app/features/accounts/tests/teacher-decision.test.ts`; `app/features/accounts/tests/teacher-request.test.ts` (ajustada, ver Decisiones)

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 682 pruebas pasan (solo falla `tests/project/guard.test.ts`, por el symlink de Windows); `npm run build` → compila con las dos rutas nuevas.

Probado contra Firebase real (2026-11-16) con un bibliotecario, un estudiante y dos externos desechables, ya borrados junto con sus solicitudes:
- Sin sesión → 401 en la lista; sin origen → 403 en la decisión.
- Bibliotecario → la lista trae las tres pendientes, la más antigua primero.
- Aprobar la del estudiante (con una nota que se ignora) → 200, `note: null`; en Firestore la solicitud quedó `APROBADA` con `decided_at` y `decided_by_uid`, y la cuenta pasó a `DOCENTE`.
- Rechazar la del externo con «  Falta el contrato con la facultad.  » → 200 con la nota recortada; su rol siguió `EXTERNO`.
- Volver a decidir la aprobada → 409; id inexistente y un id con «/» → 404.
- Aprobar y rechazar a la vez la misma solicitud → una 200 y otra 409; en Firestore quedó `APROBADA` y la cuenta `DOCENTE`, coherentes.
- Tras decidir, la lista de pendientes quedó vacía.
- El externo rechazado, en `/solicitar-docente`, ve «Tu última solicitud fue rechazada.», «Nota del personal: Falta el contrato con la facultad.» y el formulario; si llama a la lista o a la decisión recibe 403.

**Decisiones:**
- El repositorio lee la solicitud y el rol de su cuenta en una transacción y el servicio pasa las reglas como una función (`decide(requestId, decisionChange)`), igual que `lend` en F5: las reglas siguen en el servicio y la escritura es atómica.
- Firestore solo filtra por `status` (índice simple); el orden y el límite de 100 se aplican en el código. Si algún día hay muchas pendientes, convendrá un índice compuesto.
- Un `request_id` con «/» se trata como inexistente (404): Firestore lo leería como una ruta.
- Cambios aprobados en la spec que tocaron pruebas de F11: la última solicitud (`latest`) ahora trae `note` (regla 5.3), así que dos pruebas de F11 añaden `note: null` al resultado esperado y al dato de prueba. No se cambiaron para hacer pasar código.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- La pantalla del personal para ver y decidir es F37.
- No se probó en real: el 409 por cuenta que ya es docente o personal, ni el 500 cuando falla guardar el rol; están en las pruebas automáticas.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/accounts/server/teacher-request-service.ts` (`decisionChange`) | A quién se le cambia el rol sale de la solicitud guardada, no del cuerpo; solo puede pasar a `DOCENTE` desde `EXTERNO`/`ESTUDIANTE` | Un bibliotecario no puede usar esta ruta para dar `ADMINISTRADOR` ni tocar cuentas del personal | — |
| Info | `app/features/accounts/server/repository.firebase.ts` (`decide`) | Solicitud y rol cambian en la misma transacción | Aprobar y rechazar a la vez → quedó coherente (probado) | — |
| Info | `app/api/teacher-requests/pending/route.ts` | La lista muestra correo, nombre y motivo de quien pide, solo al personal | Un externo recibe 403 (probado) | — |
| Baja | `app/features/accounts/server/teacher-request-service.ts` | No queda historial de quién vio la lista; solo se guarda quién decidió | — | Fuera de la spec |

Sin hallazgos que bloqueen. **Aprobado.**
