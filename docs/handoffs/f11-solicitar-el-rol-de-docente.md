## Entrega: orquestador · F11 Solicitar el rol de docente
**Hecho:**
- API `POST /api/teacher-requests`: origen → sesión → rol (`EXTERNO` o `ESTUDIANTE`) → motivo (10–500 caracteres recortados) → crea la solicitud `PENDIENTE` en la colección `teacher_requests` con `uid`, `email` y `name` de quien pide, `reason` y `requested_at`. Responde 201 con `{ id, reason, status, requested_at }`.
- Una pendiente a la vez: 409 «Ya tienes una solicitud pendiente.». La revisión y el alta van en una transacción, como en F1.
- Pantalla `/solicitar-docente`: sin sesión → `/ingresar`; docente → «Ya tienes el rol de docente.»; personal → aviso; externo y estudiante → el estado de su última solicitud y el formulario cuando no hay una pendiente.
- Enlace «Solicitar docente» en la barra, solo para `EXTERNO` y `ESTUDIANTE`, después de «Mis vencidos».
- 46 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/api/teacher-requests/route.ts`
- `app/features/accounts/schema.ts` (`TeacherRequestInputSchema`, `NewTeacherRequestSchema`, `TeacherRequestSchema`, estados y roles que pueden pedir)
- `app/features/accounts/server/`: `teacher-request-service.ts`, `teacher-request-handler.ts`, `teacher-requests.ts` (formato y «la más reciente»), `repository.ts` (puertos `AccountDirectory` y `TeacherRequestRepository`), `repository.memory.ts`, `repository.firebase.ts`
- `app/features/accounts/ui/`: `teacher-request-view.ts`, `teacher-request-form.tsx`
- `app/solicitar-docente/page.tsx`
- `app/shared/ui/navigation.ts` (`TEACHER_REQUEST_NAV_LINK`)
- `app/features/container.ts` (`teacherRequestService`, `teacherRequestHandler`)
- Pruebas: `app/features/accounts/tests/teacher-request.test.ts`, `app/shared/tests/navigation-teacher-request.test.ts`, `app/shared/tests/navigation-borrower.test.ts` (ajustada, ver Decisiones)

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 645 pruebas pasan (solo falla `tests/project/guard.test.ts`, por el symlink de Windows); `npm run build` → compila con `/solicitar-docente` y `/api/teacher-requests`. Con `npm run dev`: ingresar como estudiante o externo y abrir «Solicitar docente».

Probado contra Firebase real (2026-11-16) con un externo y un docente desechables, ya borrados junto con sus solicitudes:
- `curl` sin origen → 403; sin sesión → 401. Sin sesión, `/solicitar-docente` termina en `/ingresar`.
- Externo → la barra muestra «Mis préstamos», «Mis vencidos» y «Solicitar docente»; sin solicitudes ve solo el formulario.
- Motivo «  corto  » → «Error: Escribe un motivo de al menos 10 caracteres.» sin llamar al servidor.
- Motivo válido → «Solicitud enviada.» y «Tu solicitud está pendiente.» con la fecha en hora de Colombia y el motivo, sin formulario. En Firestore: `PENDIENTE`, nombre y correo de la cuenta y la hora del servidor.
- Otra solicitud con una pendiente → 409 «Ya tienes una solicitud pendiente.».
- Con la solicitud marcada `RECHAZADA` a mano (simulando F12) → «Tu última solicitud fue rechazada.» y el formulario. Dos envíos simultáneos → uno 201 y otro 409; en Firestore quedó una sola pendiente nueva.
- Docente → «Ya tienes el rol de docente.», sin el enlace en la barra, y la API le responde 403 con «Solo un externo o un estudiante puede pedir el rol de docente.».
- Sin desplazamiento horizontal a 360, 768 y 1024 px.

**Decisiones:**
- Sin ruta para leer la solicitud: la página llama a `teacherRequestService.latest` en el servidor con la sesión (regla 4.4).
- El nombre de quien pide se lee de `accounts/{uid}` con un puerto nuevo (`AccountDirectory`); si no hay documento → 401.
- Firestore solo filtra por `uid` (índice simple); el estado y «la más reciente» se resuelven en el código, así no hace falta crear un índice compuesto.
- El formulario queda siempre montado y recibe `showForm`: así «Solicitud enviada.» sigue visible después de que la pantalla se refresca al estado pendiente.
- El motivo solo se muestra mientras la solicitud está pendiente; para rechazada o aprobada se ven el estado y la fecha.
- Se cambió una prueba de F35: «un prestatario ve Mis préstamos y Mis vencidos» exigía que fueran sus únicos enlaces; ahora comprueba que son los dos primeros, porque la regla 5.8 de F11 añade «Solicitar docente» para `EXTERNO` y `ESTUDIANTE`. No se cambió para hacer pasar código.
- Texto propio no pedido en la spec: el título «Solicitar el rol de docente», la frase bajo el título, «Enviada el …», «Motivo: …» y «Enviando…».
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real la vista del personal ni «Tu última solicitud fue aprobada.»; están en las pruebas automáticas.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Baja | `app/api/teacher-requests/route.ts` | Sin límite de solicitudes en el tiempo: tras cada rechazo se puede volver a pedir enseguida | Pedir, que se rechace, pedir de nuevo | Aceptado en la spec (regla 3.2) |
| Info | `app/features/accounts/server/teacher-request-service.ts` (`request`) | `uid`, `email` y `name` salen de la sesión y de `accounts/{uid}`; el cuerpo solo aporta el motivo | Enviar `uid` o `status` en el cuerpo → se ignoran (probado) | — |
| Info | `app/solicitar-docente/page.tsx` | El motivo se muestra como texto de React (escapado), sin HTML | — | — |

Sin hallazgos que bloqueen: pedir no cambia el rol, cada quien solo ve su propia solicitud y el personal y los docentes no pueden crear solicitudes. **Aprobado.**
