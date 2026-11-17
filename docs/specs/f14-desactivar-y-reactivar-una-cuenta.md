# F14 · Desactivar y reactivar una cuenta

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Bibliotecario, Administrador
- **Contrato afectado:** `app/features/accounts/schema.ts` (entradas y salida del cambio de estado)

## Objetivo
Que el personal pueda desactivar una cuenta para que deje de ingresar, y volver a activarla después. La pantalla es F37; aquí solo va la API.

## Reglas de negocio

### 1. Quién desactiva a quién
1.1. Por niveles (decisión de la persona):
- `BIBLIOTECARIO` desactiva y reactiva cuentas `EXTERNO`, `ESTUDIANTE` y `DOCENTE`.
- `ADMINISTRADOR` desactiva y reactiva esas y también cuentas `BIBLIOTECARIO`.
- Nadie desactiva una cuenta `ADMINISTRADOR` ni su propia cuenta → 403.
1.2. Los prestatarios (`EXTERNO`, `ESTUDIANTE`, `DOCENTE`) → 403. Sin sesión → 401.
1.3. Orden: origen (regla 2 de F0) → sesión → rol de quien pide → cuerpo → cuenta buscada → permiso sobre esa cuenta → cambio. Un prestatario recibe 403 aunque el cuerpo sea inválido.
1.4. Las mismas reglas valen para reactivar.

### 2. Qué se pide
2.1. La cuenta se indica por su **correo**, recortado y en minúsculas (igual que en los préstamos, F5).
2.2. Para desactivar hace falta un **motivo** obligatorio de 10 a 500 caracteres tras recortar (decisión de la persona). Para reactivar no se pide motivo.

### 3. Qué pasa al desactivar
3.1. La cuenta ya no puede ingresar (F4) y sus sesiones abiertas dejan de valer de inmediato: su siguiente petición recibe 401.
3.2. Se guarda en `accounts/{uid}`: que está desactivada, el motivo, la fecha (hora del servidor) y el `uid` de quien la desactivó.
3.3. Sus préstamos activos siguen abiertos y el personal puede recibir la devolución como siempre (decisión de la persona).
3.4. No se le pueden hacer préstamos nuevos: prestar a una cuenta desactivada → 409 «La cuenta está desactivada.».
3.5. Desactivar una cuenta que ya está desactivada → 409 «La cuenta ya está desactivada.». No cambia nada.

### 4. Qué pasa al reactivar
4.1. La cuenta vuelve a poder ingresar con su misma contraseña y su mismo rol.
4.2. Se guarda la fecha y el `uid` de quien la reactivó. El motivo de la última desactivación se conserva.
4.3. Reactivar una cuenta activa → 409 «La cuenta ya está activa.». No cambia nada.

### 5. Errores comunes
5.1. Correo sin cuenta → 404 «No existe una cuenta con ese correo.».
5.2. Dos cambios simultáneos sobre la misma cuenta (por ejemplo, dos desactivaciones) → uno responde 200 y el otro 409.

## Entradas y salidas
Rutas:
- `POST /api/accounts/deactivate` con cuerpo `{ email, reason }`.
- `POST /api/accounts/reactivate` con cuerpo `{ email }`.

| Entrada | Tipo / restricción |
| --- | --- |
| `email` | Texto; tras recortar y pasar a minúsculas: forma de correo, máximo 254 |
| `reason` | Solo al desactivar. Texto, 10–500 caracteres tras recortar |

Salida exitosa de las dos rutas: **200**
```json
{ "uid": "abc123", "email": "ana@correo.test", "name": "Ana Pérez", "role": "ESTUDIANTE", "active": false }
```

Errores esperados (formato de F0): 400 `VALIDACION` (con `fields`); 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (origen, rol o cuenta protegida); 404 `NO_ENCONTRADO`; 409 `CONFLICTO`; 500 `ERROR_INTERNO`.

## Autorización
- **SÍ pueden:** `BIBLIOTECARIO` (sobre prestatarios) y `ADMINISTRADOR` (sobre prestatarios y bibliotecarios).
- **NO pueden:** prestatarios → 403; nadie sobre un administrador ni sobre sí mismo → 403.
- Quién hizo el cambio sale de la sesión, nunca del cuerpo.
- Se valida el origen.

## Criterios de aceptación
- **Dado** un bibliotecario, **cuando** desactiva a un estudiante con un motivo válido, **entonces** recibe 200 con `active: false`, y el estudiante ya no puede ingresar.
- **Dado** un estudiante con la sesión abierta, **cuando** lo desactivan, **entonces** su siguiente petición recibe 401.
- **Dado** un estudiante desactivado con un libro prestado, **cuando** el personal recibe la devolución, **entonces** funciona como siempre.
- **Dado** un estudiante desactivado, **cuando** el personal intenta prestarle un libro, **entonces** 409 «La cuenta está desactivada.».
- **Dado** un estudiante desactivado, **cuando** un bibliotecario lo reactiva, **entonces** 200 con `active: true` y puede volver a ingresar con su contraseña.
- **Dado** un bibliotecario, **cuando** intenta desactivar a otro bibliotecario, **entonces** 403; **dado** un administrador, **entonces** 200.
- **Dado** cualquier persona del personal, **cuando** intenta desactivar a un administrador o a sí misma, **entonces** 403.
- **Dado** un estudiante, **cuando** intenta desactivar a alguien con un cuerpo inválido, **entonces** 403 (no 400).
- **Dado** que no hay sesión, **entonces** 401. **Dado** otro origen, **entonces** 403 sin leer la sesión.

## Bordes
- Motivo de 9 caracteres → 400; de 10 → 200; de 500 → 200; de 501 → 400; de solo espacios → 400.
- Correo con mayúsculas y espacios → se encuentra la cuenta.
- Falta el correo, falta el motivo al desactivar o el cuerpo no es JSON → 400.
- Un `reason` al reactivar se ignora.

## Fuera de alcance
- La pantalla del personal (F37).
- Un mensaje especial en `/ingresar` para la cuenta desactivada (hoy verá el error de ingreso de F4).
- Borrar cuentas; historial completo de desactivaciones (solo se guarda la última).
- Avisar por correo a la persona.

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Quién desactiva a quién? → **Por niveles: el bibliotecario a prestatarios; el administrador también a bibliotecarios; nadie a administradores ni a sí mismo.**
2. ¿Y si tiene préstamos activos? → **Se desactiva igual y los préstamos siguen.**
3. ¿Motivo? → **Obligatorio, de 10 a 500 caracteres.**
4. ¿Qué parte se hace? → **Solo la API; la pantalla va en F37.**
