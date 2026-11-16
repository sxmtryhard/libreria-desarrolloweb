# F12 · Aprobar o rechazar una solicitud de docente

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`)
- **Contrato afectado:** `app/features/accounts/schema.ts` (lista de pendientes, entrada y salida de la decisión, nota del personal en la última solicitud de F11)

## Objetivo
Que el personal vea las solicitudes de docente pendientes y apruebe o rechace cada una. Al aprobar, la persona pasa a ser `DOCENTE`. La pantalla del personal es F37; aquí solo va la API.

## Reglas de negocio

### 1. Quién decide
1.1. `BIBLIOTECARIO` y `ADMINISTRADOR` (decisión de la persona). Cualquier otro rol → 403. Sin sesión → 401.
1.2. Quién decide sale de la sesión, nunca del cuerpo.

### 2. Ver las pendientes
2.1. `GET /api/teacher-requests/pending` devuelve las solicitudes `PENDIENTE` de todas las personas, **la más antigua primero**, como máximo 100.
2.2. Cada una con `id`, `uid`, `email`, `name`, `reason` y `requested_at`.
2.3. Orden: sesión → rol → consulta. Sin pendientes → 200 con lista vacía.

### 3. Decidir
3.1. `POST /api/teacher-requests/decision` con `{ request_id, decision, note }`. `decision` es `"APROBADA"` o `"RECHAZADA"`.
3.2. Orden: origen (regla 2 de F0) → sesión → rol → cuerpo → decisión.
3.3. Solo se decide sobre una solicitud `PENDIENTE`. La decisión es **final** (decisión de la persona): si ya fue aprobada o rechazada → 409 «La solicitud ya fue decidida.». Si no existe → 404 «No existe esa solicitud.».
3.4. Se guarda en la solicitud: el nuevo `status`, `decided_at` (hora inyectada del servidor) y `decided_by_uid` (de la sesión).
3.5. Dos decisiones simultáneas sobre la misma solicitud → una 200 y otra 409. No quedan las dos.

### 4. Aprobar
4.1. La solicitud queda `APROBADA` y la cuenta (`accounts/{uid}`) pasa a `role: "DOCENTE"`, **en la misma transacción**: o cambian las dos o ninguna.
4.2. Solo si la cuenta todavía es `EXTERNO` o `ESTUDIANTE`. Si su rol ya es otro, o la cuenta no existe → 409 «La cuenta ya no puede recibir el rol de docente.» y no cambia nada.
4.3. El cambio vale desde la siguiente petición de la persona (el rol se lee de Firestore en cada petición, F0): no hace falta volver a ingresar. Los préstamos que ya tenía conservan su fecha de vencimiento; los nuevos usan el plazo y el límite de docente (F5).
4.4. Si el cuerpo trae `note` al aprobar, se ignora.

### 5. Rechazar
5.1. La solicitud queda `RECHAZADA`; el rol no cambia.
5.2. El personal puede escribir una **nota opcional** (decisión de la persona): hasta 500 caracteres tras quitar los espacios de los extremos. Vacía o ausente → no hay nota.
5.3. La persona ve la nota en su pantalla de F11: debajo de «Tu última solicitud fue rechazada.» aparece «Nota del personal: <nota>». Sin nota, no aparece nada más.

### 6. Respuesta
6.1. **200** con `{ id, status, decided_at, note }`; `note` es `null` al aprobar o si no se escribió.

## Entradas y salidas
`GET /api/teacher-requests/pending` → **200**
```json
{ "requests": [ { "id": "req123", "uid": "abc", "email": "ana@correo.test", "name": "Ana Pérez", "reason": "Soy profesora de Física.", "requested_at": "2026-11-16T15:00:00.000Z" } ] }
```

`POST /api/teacher-requests/decision`

| Entrada | Tipo / restricción |
| --- | --- |
| `request_id` | Texto, 1–128 caracteres tras recortar |
| `decision` | `"APROBADA"` o `"RECHAZADA"` |
| `note` | Opcional; texto de hasta 500 caracteres tras recortar; solo se guarda al rechazar |

Salida exitosa: **200**
```json
{ "id": "req123", "status": "RECHAZADA", "decided_at": "2026-11-17T10:00:00.000Z", "note": "Falta el contrato con la facultad." }
```

Errores esperados (formato de F0): 400 `VALIDACION` (con `fields`); 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (origen o rol); 404 `NO_ENCONTRADO` «No existe esa solicitud.»; 409 `CONFLICTO` «La solicitud ya fue decidida.» o «La cuenta ya no puede recibir el rol de docente.»; 500 `ERROR_INTERNO`.

## Autorización
- Las dos rutas exigen sesión de `BIBLIOTECARIO` o `ADMINISTRADOR`.
- Quién decidió sale de la sesión. A quién se le cambia el rol sale de la solicitud guardada, nunca del cuerpo.
- La decisión valida el origen.

## Criterios de aceptación
- **Dado** dos solicitudes pendientes y una rechazada, **cuando** un bibliotecario pide las pendientes, **entonces** recibe las dos, la más antigua primero, sin la rechazada.
- **Dado** un estudiante o un docente, **cuando** pide las pendientes, **entonces** 403.
- **Dado** una solicitud pendiente de un estudiante, **cuando** un administrador la aprueba, **entonces** 200 con `status: "APROBADA"`, `note: null` y `decided_at` igual a la hora inyectada, y la cuenta queda `DOCENTE`.
- **Dado** una solicitud pendiente, **cuando** un bibliotecario la rechaza con la nota `"  Falta el contrato.  "`, **entonces** 200 con `note: "Falta el contrato."` y el rol no cambia.
- **Dado** una solicitud ya rechazada, **cuando** se intenta aprobar, **entonces** 409 «La solicitud ya fue decidida.» y nada cambia.
- **Dado** un `request_id` que no existe, **cuando** se decide, **entonces** 404 «No existe esa solicitud.».
- **Dado** una solicitud pendiente cuya cuenta ya es `DOCENTE` o `BIBLIOTECARIO`, **cuando** se aprueba, **entonces** 409 «La cuenta ya no puede recibir el rol de docente.» y la solicitud sigue `PENDIENTE`.
- **Dado** que falla guardar el cambio de rol, **cuando** se aprueba, **entonces** 500 y la solicitud sigue `PENDIENTE`.
- **Dado** un estudiante, **cuando** intenta decidir, **entonces** 403 y nada cambia.
- **Dado** una petición desde otro origen, **cuando** se decide, **entonces** 403 sin leer la sesión.
- **Dado** una solicitud rechazada con nota, **cuando** la persona abre `/solicitar-docente`, **entonces** ve «Tu última solicitud fue rechazada.» y «Nota del personal: <nota>».

## Bordes
- Nota de 500 caracteres → 200; de 501 → 400 con `fields` `note`. Nota de solo espacios → sin nota.
- `decision` distinta de `"APROBADA"` o `"RECHAZADA"` → 400 con `fields` `decision`.
- Falta `request_id` o el cuerpo no es JSON → 400.
- Más de 100 pendientes → se devuelven las 100 más antiguas.
- Dos decisiones simultáneas sobre la misma solicitud (aprobar y rechazar a la vez) → una 200 y otra 409.

## Fuera de alcance
- La pantalla del personal con las solicitudes (F37).
- Cambiar o deshacer una decisión; quitar el rol de docente.
- Avisar por correo a la persona.
- Buscar o filtrar solicitudes, o ver las ya decididas.

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Quién decide? → **`BIBLIOTECARIO` y `ADMINISTRADOR`.**
2. ¿Se explica el rechazo? → **Nota opcional que la persona ve.**
3. ¿Se puede cambiar una decisión? → **No, es final.**
4. ¿Qué parte se hace? → **Solo la API; la pantalla va en F37.**
