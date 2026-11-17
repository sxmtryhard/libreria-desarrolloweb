# F13 · Crear una cuenta de bibliotecario

- **Estado:** Borrador
- **Rol(es):** Administrador
- **Contrato afectado:** `app/features/accounts/schema.ts` (entrada de la cuenta de personal)

## Objetivo
Que un administrador cree la cuenta de un nuevo bibliotecario, que podrá ingresar de inmediato con su correo y la contraseña inicial. La pantalla es F37; aquí solo va la API.

## Reglas de negocio

### 1. Quién crea
1.1. Solo `ADMINISTRADOR` (decisión de la persona). `BIBLIOTECARIO` y los prestatarios → 403. Sin sesión → 401.
1.2. Orden: origen (regla 2 de F0) → sesión → rol → cuerpo → creación. Quien no tiene permiso recibe 401 o 403 aunque el cuerpo sea inválido o el correo esté repetido.

### 2. Qué se pide
2.1. Tres datos, todos obligatorios: **nombre**, **correo** y **contraseña inicial**, con las mismas reglas de F3: nombre de 1 a 120 caracteres tras recortar; correo recortado y en minúsculas, con forma de correo y máximo 254; contraseña de 8 a 128 caracteres sin recortar.
2.2. La contraseña la escribe el administrador y se la comunica a la persona (decisión de la persona).
2.3. No se pide rol: la cuenta queda **siempre** `BIBLIOTECARIO` (decisión de la persona). Un `role` en el cuerpo se ignora. Esta ruta no crea administradores; siguen saliendo solo del seed (F0).

### 3. Qué se crea
3.1. Igual que F3: el usuario en Firebase Authentication y el documento `accounts/{uid}` con `{ email, name, role: "BIBLIOTECARIO" }`.
3.2. Correo repetido → 409 «Ya existe una cuenta con ese correo.». No se crea ni se cambia nada (tampoco se convierte una cuenta existente en bibliotecario).
3.3. Si falla guardar el documento, se borra el usuario recién creado y se responde 500: no quedan cuentas a medias.
3.4. La contraseña solo la recibe Firebase Authentication: no se guarda, no se devuelve y no se registra.
3.5. La cuenta sirve de inmediato y crearla no cambia la sesión del administrador.

### 4. La ruta
4.1. `POST /api/accounts/staff`. Responde **201** con `{ uid, email, name, role: "BIBLIOTECARIO" }`.
4.2. `POST /api/accounts` (F3) no cambia: sigue sin aceptar `BIBLIOTECARIO` ni `ADMINISTRADOR`.

## Entradas y salidas
Ruta: `POST /api/accounts/staff` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `name` | Texto, 1–120 caracteres tras recortar |
| `email` | Texto; tras recortar y pasar a minúsculas: forma de correo, máximo 254 |
| `password` | Texto, 8–128 caracteres, sin recortar |

Salida exitosa: **201**
```json
{ "uid": "abc123", "email": "luis.gomez@biblioteca.test", "name": "Luis Gómez", "role": "BIBLIOTECARIO" }
```

Errores esperados (formato de F0): 400 `VALIDACION` (con `fields`); 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (origen o rol); 409 `CONFLICTO` «Ya existe una cuenta con ese correo.»; 500 `ERROR_INTERNO`.

## Autorización
- **SÍ puede:** `ADMINISTRADOR`.
- **NO pueden:** `BIBLIOTECARIO`, `DOCENTE`, `ESTUDIANTE`, `EXTERNO` → 403.
- El rol de la cuenta nueva nunca sale del cuerpo.
- Se valida el origen.

## Criterios de aceptación
- **Dado** un administrador, **cuando** envía `{ name: "Luis Gómez", email: "luis.gomez@biblioteca.test", password: "clave-inicial-1" }`, **entonces** recibe 201 con `role: "BIBLIOTECARIO"`, un `uid` no vacío y sin la contraseña; existen el usuario y `accounts/{uid}`.
- **Dado** un cuerpo con `role: "ADMINISTRADOR"`, **cuando** un administrador crea la cuenta, **entonces** queda `BIBLIOTECARIO`.
- **Dado** un bibliotecario, **cuando** intenta crear la cuenta, **entonces** 403 y no se crea nada.
- **Dado** un estudiante, **cuando** lo intenta con un cuerpo inválido, **entonces** 403 (no 400).
- **Dado** que no hay sesión, **entonces** 401.
- **Dado** un correo que ya tiene cuenta, **cuando** se crea, **entonces** 409 y la cuenta existente no cambia de rol.
- **Dado** que falla guardar el documento, **entonces** 500 y el usuario recién creado se borra.
- **Dado** una petición desde otro origen, **entonces** 403 sin leer la sesión.
- **Dado** la cuenta recién creada, **cuando** la persona ingresa (F4), **entonces** la cabecera muestra «<correo> · Bibliotecario».

## Bordes
- Los mismos de F3 para nombre, correo y contraseña: nombre de 120 → 201 y de 121 → 400; contraseña de 7 → 400, de 8 → 201, de 128 → 201 y de 129 → 400; correo con mayúsculas y espacios → se guarda normalizado.
- Falta cualquiera de los tres datos o el cuerpo no es JSON → 400.
- Dos creaciones simultáneas con el mismo correo → una 201 y otra 409.

## Fuera de alcance
- La pantalla del administrador (F37).
- Crear administradores; convertir una cuenta existente en bibliotecario; quitar el rol de bibliotecario.
- Desactivar cuentas (F14); cambiar la contraseña (F15).
- Avisar por correo a la persona.

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Qué roles puede crear? → **Solo `BIBLIOTECARIO`.**
2. ¿Quién puede crearlas? → **Solo `ADMINISTRADOR`.**
3. ¿Cómo se pone la contraseña? → **La escribe el administrador (8 a 128 caracteres).**
4. ¿Qué parte se hace? → **Solo la API; la pantalla va en F37.**
