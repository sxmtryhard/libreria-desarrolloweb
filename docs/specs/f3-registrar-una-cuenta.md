# F3 · Registrar una cuenta desde el mostrador

- **Estado:** Aprobada (por la persona, 2026-11-15)
- **Rol(es):** Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`)
- **Contrato afectado:** `app/features/accounts/schema.ts` (se crea). `app/shared/schema.ts` no cambia.

## Objetivo
El personal de la biblioteca crea, en el mostrador, la cuenta de una persona que va a pedir libros prestados, para que después pueda ingresar con su correo y contraseña (F4).

## Reglas de negocio
1. Una cuenta se registra con cuatro datos, todos obligatorios: **nombre**, **correo**, **rol** (decisión de la persona) y **contraseña inicial**.
2. **Nombre:** texto de 1 a 120 caracteres después de quitar los espacios de los extremos.
3. **Correo:** se le quitan los espacios de los extremos y se pasa a minúsculas; debe tener formato de correo válido y como máximo 254 caracteres. Se guarda así, normalizado.
4. **Rol:** solo `EXTERNO`, `ESTUDIANTE` o `DOCENTE` (decisión de la persona). `BIBLIOTECARIO` y `ADMINISTRADOR` no se pueden crear desde el mostrador: se rechazan como dato inválido, también si quien registra es un `ADMINISTRADOR`.
5. **Contraseña inicial:** la escribe el personal (decisión de la persona) y se la comunica a la persona. De 8 a 128 caracteres; no se recorta ni se exige mezcla de letras y números.
6. La contraseña **nunca** se guarda en Firestore, ni se devuelve en la respuesta, ni se escribe en registros o mensajes de error. Solo la recibe Firebase Authentication.
7. **Correo repetido:** si ya existe una cuenta con ese correo (comparado ya normalizado), el registro se rechaza con `ConflictError` y el mensaje «Ya existe una cuenta con ese correo.». No se crea ni se modifica nada.
8. Registrar una cuenta crea dos cosas: el usuario en Firebase Authentication (con el nombre) y el documento `accounts/{uid}` con `email`, `name` y `role`. **No puede quedar una cuenta a medias:** si el documento no se puede guardar, se elimina el usuario recién creado y se responde error interno.
9. La cuenta queda activa de inmediato: la persona puede ingresar con ese correo y esa contraseña (cuando exista F4).
10. El identificador de la cuenta (`uid`) lo genera el sistema; no lo envía el cliente.
11. Registrar una cuenta no inicia sesión por ella ni cambia la sesión de quien la registra.

## Entradas y salidas
Ruta: `POST /api/accounts` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `name` | Texto, 1–120 caracteres tras recortar |
| `email` | Correo válido, máximo 254 caracteres; se recorta y se pasa a minúsculas |
| `role` | `EXTERNO`, `ESTUDIANTE` o `DOCENTE` |
| `password` | Texto, 8–128 caracteres, sin recortar |

Salida exitosa: **201** con la cuenta creada, sin contraseña:
```json
{
  "uid": "abc123",
  "email": "ana.perez@correo.test",
  "name": "Ana Pérez",
  "role": "ESTUDIANTE"
}
```

Errores esperados (formato de F0):
- `ZodError` → 400 `VALIDACION` con `fields`: falta un dato, tiene el tipo equivocado o no cumple las reglas 2–5.
- `ValidationError` → 400: el cuerpo no es JSON válido.
- `UnauthenticatedError` → 401: no hay sesión válida.
- `ForbiddenError` → 403: el origen no es el del sitio, o el rol no es `BIBLIOTECARIO` ni `ADMINISTRADOR`.
- `ConflictError` → 409 «Ya existe una cuenta con ese correo.»: correo repetido.
- Error inesperado → 500 genérico (por ejemplo, si falla guardar el documento; regla 8).

## Autorización
- **SÍ pueden:** `BIBLIOTECARIO` y `ADMINISTRADOR` (decisión de la persona).
- **NO pueden:** `EXTERNO`, `ESTUDIANTE` y `DOCENTE` → 403.
- **Sin sesión:** 401.
- Orden de comprobación: origen → sesión → rol → cuerpo. Quien no tiene permiso recibe 401 o 403 aunque el cuerpo sea inválido o el correo esté repetido (no se revela si un correo tiene cuenta).

## Criterios de aceptación
- **Dado** un `BIBLIOTECARIO` con sesión, **cuando** registra `{ name: "Ana Pérez", email: "ana.perez@correo.test", role: "ESTUDIANTE", password: "clave-inicial-1" }`, **entonces** recibe 201 con `uid` no vacío, `email: "ana.perez@correo.test"`, `name: "Ana Pérez"` y `role: "ESTUDIANTE"`, y la respuesta no contiene `password`.
- **Dado** ese registro exitoso, **entonces** existe un usuario en Authentication con ese correo y existe `accounts/{uid}` con `{ email, name, role }` y sin contraseña.
- **Dado** un `ADMINISTRADOR` con sesión, **cuando** registra una cuenta válida con rol `DOCENTE`, **entonces** recibe 201.
- **Dado** el personal con sesión, **cuando** registra una cuenta con rol `EXTERNO`, **entonces** recibe 201.
- **Dado** un `ESTUDIANTE`, un `DOCENTE` o un `EXTERNO` con sesión, **cuando** intenta registrar una cuenta válida, **entonces** recibe 403 y no se crea nada.
- **Dado** que no hay sesión, **cuando** se intenta registrar una cuenta, **entonces** se recibe 401 y no se crea nada.
- **Dado** `role: "BIBLIOTECARIO"` o `role: "ADMINISTRADOR"`, **cuando** un `ADMINISTRADOR` registra, **entonces** recibe 400 con `fields` que nombra `role` y no se crea nada.
- **Dado** que ya existe una cuenta con `ana.perez@correo.test`, **cuando** el personal registra otra con `email: "  Ana.Perez@Correo.TEST "`, **entonces** recibe 409 «Ya existe una cuenta con ese correo.» y la cuenta existente no cambia.
- **Dado** `email: "  Ana.Perez@Correo.TEST "` y ningún duplicado, **cuando** se registra, **entonces** se guarda `"ana.perez@correo.test"`.
- **Dado** `name: "  Ana Pérez  "`, **cuando** se registra, **entonces** se guarda `"Ana Pérez"`.
- **Dado** `password` de 7 caracteres, **cuando** se registra, **entonces** se recibe 400 con `fields` que nombra `password`.
- **Dado** `email: "no-es-un-correo"`, **cuando** se registra, **entonces** se recibe 400 con `fields` que nombra `email`.
- **Dado** que guardar el documento de la cuenta falla, **cuando** se registra, **entonces** se recibe 500 genérico y no queda ningún usuario con ese correo en Authentication.
- **Dado** un `ESTUDIANTE` y un cuerpo inválido, **cuando** intenta registrar, **entonces** recibe 403 (no 400).
- **Dado** un `POST` desde otro origen con sesión de `BIBLIOTECARIO`, **cuando** llega la petición, **entonces** recibe 403 «Origen no permitido.».

## Bordes
- Nombre de 120 caracteres se acepta; de 121 se rechaza; solo espacios se rechaza.
- Contraseña de 8 y de 128 caracteres se aceptan; de 7 y de 129 se rechazan. Los espacios de la contraseña cuentan y se conservan.
- Correo de más de 254 caracteres se rechaza.
- Falta cualquiera de los cuatro campos → 400 con ese campo en `fields`.
- `role` en minúsculas (`"estudiante"`) o con un valor desconocido → 400.
- Campos extra en el cuerpo (por ejemplo `uid`) se ignoran.
- Dos personas distintas con el mismo nombre y correos distintos → se aceptan.
- En ninguna respuesta de error aparece la contraseña enviada.
- Dos registros simultáneos con el mismo correo: solo uno crea la cuenta; el otro recibe 409.

## Fuera de alcance
- El formulario del mostrador (ola de pantallas) y el ingreso (F4).
- Autorregistro (F10), solicitud y aprobación de docente (F11, F12), cuentas de bibliotecario (F13).
- Desactivar cuentas (F14), cambiar o recuperar la contraseña (F15, F16).
- Obligar a cambiar la contraseña inicial en el primer ingreso.
- Documento de identidad, teléfono u otros datos personales.
- Editar o listar cuentas.

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Quién puede registrar cuentas? → **Bibliotecario y Administrador.**
2. ¿Qué rol puede tener la cuenta creada? → **Externo, Estudiante o Docente.**
3. ¿Cómo recibe su contraseña la persona? → **El personal escribe una inicial.**
4. ¿Qué datos se piden? → **Nombre, correo y rol.**

Propuestas del agente que quedan aceptadas si la persona aprueba la spec (puede cambiarlas antes):
5. Contraseña inicial de 8 a 128 caracteres, sin exigir mezcla de letras y números (regla 5).
6. Nombre de máximo 120 caracteres y correo de máximo 254, guardado en minúsculas (reglas 2 y 3).
7. Correo repetido responde 409 «Ya existe una cuenta con ese correo.» (regla 7).
8. Un `ADMINISTRADOR` tampoco puede crear aquí bibliotecarios ni administradores (regla 4); eso es F13.
9. Si falla a medias, se deshace lo creado y se responde 500 (regla 8).
10. La ruta es `POST /api/accounts` y responde 201 con `uid`, `email`, `name` y `role`.
11. No se obliga a cambiar la contraseña inicial en el primer ingreso.
