# F10 · Autorregistrarse

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Público (cualquiera sin cuenta)
- **Contrato afectado:** `app/features/accounts/schema.ts` (se añade la entrada del autorregistro)

## Objetivo
Que una persona sin cuenta pueda crearla por sí misma desde una pantalla y quedar con la sesión iniciada, sin pasar por el mostrador.

## Reglas de negocio

### 1. Qué se pide
1.1. La persona da tres datos, todos obligatorios: **nombre**, **correo** y **contraseña**.
1.2. **Nombre:** de 1 a 120 caracteres después de quitar los espacios de los extremos (igual que F3).
1.3. **Correo:** se le quitan los espacios de los extremos y se pasa a minúsculas; debe tener forma de correo y como máximo 254 caracteres (igual que F3).
1.4. **Contraseña:** de 8 a 128 caracteres; no se recorta ni se cambia (decisión de la persona: la misma regla de F3).

### 2. Qué se crea
2.1. La cuenta queda **siempre** con el rol `EXTERNO` (decisión de la persona). Cualquier rol enviado en la petición se ignora.
2.2. Se crea el usuario en Firebase Authentication y el documento `accounts/{uid}` con `{ email, name, role }`, igual que en F3.
2.3. Si el correo ya tiene cuenta → 409 «Ya existe una cuenta con ese correo.». No se crea nada.
2.4. Si falla guardar el documento, se borra el usuario recién creado y se responde 500 (igual que F3): no quedan cuentas a medias.
2.5. La contraseña solo la recibe Firebase Authentication: no se guarda en Firestore, no se devuelve y no se registra.
2.6. La cuenta sirve de inmediato: no hay que confirmar el correo (decisión de la persona).

### 3. La ruta
3.1. `POST /api/accounts/register`. Es pública: no exige sesión.
3.2. Orden: origen (regla 2 de F0) → cuerpo → creación.
3.3. Responde **201** con `{ uid, email, name, role: "EXTERNO" }`. Esta ruta no inicia la sesión por sí misma.
3.4. Quien ya tiene sesión también puede llamarla; se crea una cuenta nueva y su sesión no cambia.

### 4. La pantalla (`/registrarse`)
4.1. Tiene un formulario con «Nombre», «Correo», «Contraseña» y «Repetir contraseña», y el botón «Crear cuenta».
4.2. Antes de llamar al servidor se comprueba, y se muestra el primer problema que haya:
- nombre vacío → «Escribe tu nombre.»;
- correo vacío → «Escribe tu correo.»;
- contraseña de menos de 8 o más de 128 caracteres → «La contraseña debe tener entre 8 y 128 caracteres.»;
- las dos contraseñas distintas → «Las contraseñas no coinciden.».

4.3. Si el servidor responde 409, se muestra su mensaje («Ya existe una cuenta con ese correo.»). Con 400 → «Revisa los datos del formulario.». Con cualquier otro fallo → «No se pudo crear la cuenta. Intenta de nuevo.».
4.4. Después del 201, la pantalla **inicia la sesión** con el mismo correo y contraseña, por el mismo camino de F4, y lleva al inicio (`/`) (decisión de la persona).
4.5. Si la cuenta se creó pero ese ingreso falla, se muestra «Tu cuenta se creó. Ingresa con tu correo y tu contraseña.» con un enlace a `/ingresar`.
4.6. Tras un error se conservan el nombre y el correo, y se borran las dos contraseñas. Mientras se procesa, el botón queda deshabilitado y dice «Creando cuenta…».
4.7. Quien ya tiene sesión y abre `/registrarse` es enviado al inicio (igual que `/ingresar` en F4).
4.8. `/ingresar` añade el enlace «¿No tienes cuenta? Regístrate» (`/registrarse`), y `/registrarse` el enlace «¿Ya tienes cuenta? Ingresa» (`/ingresar`).
4.9. La pantalla cumple `docs/frontend-rules.md` (360, 768 y 1024 px sin desplazamiento horizontal, HTML semántico, paleta, foco visible, 44 px, errores con `role="alert"`).

## Entradas y salidas
Ruta: `POST /api/accounts/register` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `name` | Texto, 1–120 caracteres tras recortar |
| `email` | Texto; tras recortar y pasar a minúsculas: forma de correo, máximo 254 |
| `password` | Texto, 8–128 caracteres, sin recortar |

Salida exitosa: **201**
```json
{ "uid": "abc123", "email": "ana@correo.test", "name": "Ana Pérez", "role": "EXTERNO" }
```

Errores esperados (formato de F0): 400 `VALIDACION` (con `fields`); 403 `NO_AUTORIZADO` «Origen no permitido.»; 409 `CONFLICTO` «Ya existe una cuenta con ese correo.»; 500 `ERROR_INTERNO`.

## Autorización
- Pública: cualquiera puede registrarse.
- El rol nunca sale de la petición: siempre `EXTERNO`. Los demás roles se asignan en el mostrador (F3), por solicitud (F11) o por un administrador (F13).
- Se valida el origen, como en toda petición que modifica datos.

## Criterios de aceptación
- **Dado** alguien sin cuenta, **cuando** envía `{ name: "Ana Pérez", email: "ana@correo.test", password: "clave-segura-1" }`, **entonces** recibe 201 con `role: "EXTERNO"`, un `uid` no vacío, y la respuesta no contiene la contraseña.
- **Dado** un cuerpo que además trae `role: "ADMINISTRADOR"`, **cuando** se registra, **entonces** la cuenta queda `EXTERNO`.
- **Dado** el correo `"  Ana@Correo.TEST "`, **cuando** se registra, **entonces** se guarda `ana@correo.test`.
- **Dado** un correo que ya tiene cuenta, **cuando** se registra, **entonces** recibe 409 «Ya existe una cuenta con ese correo.» y no se crea nada.
- **Dado** una contraseña de 7 caracteres, **cuando** se registra, **entonces** recibe 400 con `fields` `password`; con 8, **entonces** 201.
- **Dado** que falla guardar el documento, **cuando** se registra, **entonces** recibe 500 y el usuario recién creado se borra.
- **Dado** una petición desde otro origen, **cuando** se procesa, **entonces** recibe 403 y no se crea nada.
- **Dado** alguien con sesión, **cuando** llama a la ruta, **entonces** también recibe 201.
- **Dado** el formulario bien lleno, **cuando** se pulsa «Crear cuenta», **entonces** la persona termina en `/` y la cabecera muestra «<correo> · Externo».
- **Dado** el formulario con las contraseñas distintas, **cuando** se envía, **entonces** se ve «Las contraseñas no coinciden.» y no se llama al servidor.
- **Dado** el formulario con un correo que ya existe, **cuando** se envía, **entonces** se ve «Ya existe una cuenta con ese correo.», el nombre y el correo siguen escritos y las contraseñas quedan vacías.
- **Dado** alguien con sesión, **cuando** abre `/registrarse`, **entonces** termina en `/`.

## Bordes
- Nombre de solo espacios → 400 con `fields` `name`; de 121 caracteres → 400; de 120 → 201.
- Correo sin forma de correo o de 255 caracteres → 400 con `fields` `email`.
- Contraseña de 129 caracteres → 400; de 128 → 201. Contraseña con espacios al inicio o al final → se usa tal cual.
- Falta cualquiera de los tres datos → 400 con el campo que falta.
- Cuerpo que no es JSON → 400.
- Dos registros simultáneos con el mismo correo → uno 201 y otro 409.
- Campos extra en el cuerpo (`role`, `uid`) → se ignoran.

## Fuera de alcance
- Confirmar el correo; recuperar la contraseña (F16); cambiarla (F15).
- Elegir o pedir otro rol: solicitar docente (F11), crear bibliotecarios (F13).
- Límite de registros por persona o por dirección, y CAPTCHA.
- Registro con Google u otros proveedores.
- Un enlace «Registrarse» en la barra de navegación (solo se enlaza desde `/ingresar`).

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Con qué rol queda? → **Siempre `EXTERNO`.**
2. ¿Qué se exige a la contraseña? → **De 8 a 128 caracteres.**
3. ¿Qué pasa después de registrarse? → **Queda con sesión y va al inicio.**
4. ¿Hay que confirmar el correo? → **No.**
