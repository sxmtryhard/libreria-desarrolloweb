# F11 · Solicitar el rol de docente

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Prestatario (`EXTERNO`, `ESTUDIANTE`)
- **Contrato afectado:** `app/features/accounts/schema.ts` (entrada y salida de la solicitud); `app/shared/ui/navigation.ts` (un enlace nuevo)

## Objetivo
Que un externo o un estudiante pueda pedir el rol de docente con un motivo escrito y ver en qué va su solicitud. Aprobarla o rechazarla es F12.

## Reglas de negocio

### 1. Quién puede pedir
1.1. Solo `EXTERNO` y `ESTUDIANTE` (decisión de la persona). Cualquier otro rol → 403 «Solo un externo o un estudiante puede pedir el rol de docente.».
1.2. Sin sesión → 401.
1.3. Quién pide sale **siempre** de la sesión, nunca del cuerpo.

### 2. Qué lleva la solicitud
2.1. Un único dato: el **motivo** (decisión de la persona), de 10 a 500 caracteres después de quitar los espacios de los extremos.
2.2. Se guarda en la colección `teacher_requests` con: `uid`, `email` y `name` de quien pide, `reason`, `status: "PENDIENTE"` y `requested_at` (la hora inyectada del servidor).
2.3. Los estados posibles son `PENDIENTE`, `APROBADA` y `RECHAZADA`. F11 solo crea `PENDIENTE`; los otros dos los pone F12.
2.4. Pedir no cambia el rol: la persona sigue con su rol hasta que F12 apruebe.

### 3. Cuántas veces
3.1. Solo **una solicitud pendiente a la vez** (decisión de la persona). Con una pendiente → 409 «Ya tienes una solicitud pendiente.». No se crea nada.
3.2. Si la última fue rechazada (o aprobada y la persona ya no es docente), puede volver a pedir.
3.3. Dos envíos simultáneos de la misma persona → uno 201 y otro 409.

### 4. La ruta
4.1. `POST /api/teacher-requests` con `{ reason }`.
4.2. Orden: origen (regla 2 de F0) → sesión → rol → cuerpo → creación.
4.3. Responde **201** con `{ id, reason, status: "PENDIENTE", requested_at }`.
4.4. No hay ruta para leer la solicitud: la pantalla la lee en el servidor con la sesión (igual que F35).

### 5. La pantalla (`/solicitar-docente`)
5.1. Sin sesión → se va a `/ingresar`.
5.2. Con rol `DOCENTE` → «Ya tienes el rol de docente.», sin formulario.
5.3. Con rol de personal (`BIBLIOTECARIO`, `ADMINISTRADOR`) → «Esta pantalla es para quienes piden libros prestados.», sin formulario.
5.4. Externo o estudiante muestran el estado de su **última** solicitud (decisión de la persona):
- sin solicitudes → solo el formulario;
- `PENDIENTE` → «Tu solicitud está pendiente.», con la fecha en que se envió (hora de Colombia, como F35) y el motivo; sin formulario;
- `RECHAZADA` → «Tu última solicitud fue rechazada.», con su fecha, y el formulario para pedir otra vez;
- `APROBADA` (y la persona no es docente) → «Tu última solicitud fue aprobada.», con su fecha, y el formulario.

5.5. El formulario tiene el campo «Motivo» (texto de varias líneas) y el botón «Enviar solicitud». Antes de llamar al servidor se comprueba, sobre el texto recortado:
- menos de 10 caracteres → «Escribe un motivo de al menos 10 caracteres.»;
- más de 500 → «El motivo puede tener como máximo 500 caracteres.».

5.6. Con 409 o 403 se muestra el mensaje del servidor; con 400 → «Revisa el motivo.»; con cualquier otro fallo → «No se pudo enviar la solicitud. Intenta de nuevo.». Tras un error el motivo sigue escrito.
5.7. Después del 201 se ve «Solicitud enviada.» y la pantalla pasa al estado `PENDIENTE`. Mientras se envía, el botón queda deshabilitado y dice «Enviando…».
5.8. La barra muestra el enlace «Solicitar docente» (`/solicitar-docente`) solo a `EXTERNO` y `ESTUDIANTE`, después de «Mis vencidos».
5.9. La pantalla cumple `docs/frontend-rules.md` (360, 768 y 1024 px sin desplazamiento horizontal, HTML semántico, paleta, foco visible, 44 px, errores con `role="alert"`, avisos con `role="status"`).

## Entradas y salidas
Ruta: `POST /api/teacher-requests` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `reason` | Texto, 10–500 caracteres tras recortar |

Salida exitosa: **201**
```json
{ "id": "req123", "reason": "Soy profesor de Física en la facultad de Ciencias.", "status": "PENDIENTE", "requested_at": "2026-11-16T15:00:00.000Z" }
```

Errores esperados (formato de F0): 400 `VALIDACION` (con `fields`); 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (origen o rol); 409 `CONFLICTO` «Ya tienes una solicitud pendiente.»; 500 `ERROR_INTERNO`.

## Autorización
- Exige sesión. Solo `EXTERNO` y `ESTUDIANTE` pueden pedir.
- La persona, su correo y su nombre salen de la sesión y de su documento `accounts/{uid}`, nunca del cuerpo.
- Cada quien ve solo su propia solicitud.
- Se valida el origen.

## Criterios de aceptación
- **Dado** un estudiante sin solicitudes, **cuando** envía `{ reason: "Soy profesor de Física en la facultad de Ciencias." }`, **entonces** recibe 201 con `status: "PENDIENTE"` y `requested_at` igual a la hora inyectada.
- **Dado** un externo con una solicitud pendiente, **cuando** envía otra, **entonces** recibe 409 «Ya tienes una solicitud pendiente.» y sigue habiendo una sola.
- **Dado** un estudiante cuya última solicitud fue rechazada, **cuando** envía otra, **entonces** recibe 201.
- **Dado** un docente, un bibliotecario o un administrador, **cuando** envía una solicitud, **entonces** recibe 403 y no se crea nada.
- **Dado** que no hay sesión, **cuando** se envía, **entonces** 401.
- **Dado** un cuerpo con `uid` o `email` de otra persona, **cuando** se envía, **entonces** la solicitud queda a nombre de quien tiene la sesión.
- **Dado** un motivo de 9 caracteres tras recortar, **cuando** se envía, **entonces** 400 con `fields` `reason`; con 10, **entonces** 201.
- **Dado** una petición desde otro origen, **cuando** se procesa, **entonces** 403 y no se crea nada.
- **Dado** un estudiante con sesión, **cuando** abre `/solicitar-docente`, envía un motivo válido, **entonces** ve «Solicitud enviada.» y «Tu solicitud está pendiente.» sin formulario.
- **Dado** un docente, **cuando** abre `/solicitar-docente`, **entonces** ve «Ya tienes el rol de docente.».
- **Dado** un externo, **cuando** mira la barra, **entonces** ve «Solicitar docente»; un docente o el personal no lo ven.

## Bordes
- Motivo de solo espacios → 400; de 500 caracteres → 201; de 501 → 400.
- Falta `reason` o el cuerpo no es JSON → 400.
- Dos envíos simultáneos de la misma persona → uno 201 y otro 409.
- Dos personas distintas pueden tener cada una su solicitud pendiente.
- Una cuenta sin documento en `accounts` no tiene sesión válida (F0) → 401.

## Fuera de alcance
- Aprobar o rechazar, y cambiar el rol (F12). La pantalla del personal con las solicitudes (F37).
- Cancelar o editar una solicitud ya enviada.
- Adjuntar documentos o pedir la facultad.
- Avisar por correo.
- Ver el historial de todas mis solicitudes (solo se ve la última).

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Quién puede pedir? → **`EXTERNO` y `ESTUDIANTE`.**
2. ¿Qué datos lleva? → **Un motivo escrito.**
3. ¿Cuántas veces? → **Una pendiente a la vez; tras un rechazo se puede volver a pedir.**
4. ¿Qué pantalla se hace? → **API y pantalla con el estado de la última solicitud, con enlace en la barra.**
