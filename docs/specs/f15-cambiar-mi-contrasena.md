# F15 · Cambiar mi contraseña

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Todos los que tienen sesión
- **Contrato afectado:** `app/features/accounts/schema.ts` (entrada del cambio de contraseña)

## Objetivo
Que cualquier persona con sesión cambie su propia contraseña, escribiendo la actual y la nueva, desde una pantalla propia.

## Reglas de negocio

### 1. Quién
1.1. Cualquier rol con sesión cambia **solo su propia** contraseña. La cuenta sale de la sesión, nunca del cuerpo.
1.2. Sin sesión → 401. Una cuenta desactivada (F14) no tiene sesión, así que también recibe 401.
1.3. Orden: origen (regla 2 de F0) → sesión → cuerpo → nueva distinta de la actual → contraseña actual correcta → cambio.

### 2. Qué se pide
2.1. **Contraseña actual** y **contraseña nueva** (decisión de la persona). Ninguna se recorta.
2.2. La actual: de 1 a 128 caracteres. La nueva: de 8 a 128 caracteres, como en F3.
2.3. La nueva tiene que ser distinta de la actual (decisión de la persona). Si son iguales → 400 «La contraseña nueva debe ser distinta de la actual.».
2.4. Si la actual no es correcta → 400 «La contraseña actual no es correcta.». No cambia nada.
2.5. Si Firebase bloquea por demasiados intentos con la contraseña actual → 409 «Demasiados intentos. Espera unos minutos.». No cambia nada.

### 3. Qué pasa al cambiarla
3.1. Firebase Authentication guarda la contraseña nueva. Las contraseñas solo viajan a Firebase: no se guardan en Firestore, no se devuelven y no se registran.
3.2. Se cierran **todas** las sesiones de la persona, también la actual (decisión de la persona): la respuesta borra la cookie de sesión y las demás cookies dejan de valer.
3.3. La persona vuelve a ingresar (F4) con la contraseña nueva; la anterior ya no sirve.

### 4. La pantalla
4.1. `/cambiar-contrasena`, con el título «Cambiar contraseña» y tres campos: «Contraseña actual», «Contraseña nueva» y «Repetir contraseña nueva».
4.2. Sin sesión, la pantalla lleva a `/ingresar`.
4.3. Se llega con un enlace «Cambiar contraseña» en la cabecera, junto a «Cerrar sesión», para todos los roles.
4.4. Antes de enviar, el navegador revisa, en este orden, y muestra el primer problema:
- Contraseña actual vacía → «Escribe tu contraseña actual.»
- Nueva fuera de 8–128 → «La contraseña nueva debe tener entre 8 y 128 caracteres.»
- Nueva y repetición distintas → «Las contraseñas nuevas no coinciden.»
- Nueva igual a la actual → «La contraseña nueva debe ser distinta de la actual.»
4.5. Errores del servidor: 400 y 409 muestran su mensaje; 401 → «Tu sesión terminó. Vuelve a ingresar.»; lo demás → «No se pudo cambiar la contraseña. Intenta de nuevo.». Tras un error, los tres campos se vacían.
4.6. Tras el éxito, lleva a `/ingresar`, que muestra «Tu contraseña cambió. Ingresa con la nueva.».
4.7. Mensajes con `role="alert"` (error) y `role="status"` (éxito); campos con etiqueta y `autocomplete` (`current-password`, `new-password`); botón de 44 px; sin desplazamiento horizontal a 360, 768 y 1024 px.

## Entradas y salidas
Ruta: `POST /api/accounts/password` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `current_password` | Texto, 1–128 caracteres, sin recortar |
| `new_password` | Texto, 8–128 caracteres, sin recortar |

Salida exitosa: **204** sin cuerpo, con la cookie de sesión borrada.

Errores esperados (formato de F0): 400 `VALIDACION`; 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (origen); 409 `CONFLICTO`; 500 `ERROR_INTERNO`.

## Autorización
- **SÍ pueden:** todos los roles, sobre su propia cuenta.
- La cuenta sale de la sesión; un `uid` o `email` en el cuerpo se ignora.
- Se valida el origen.

## Criterios de aceptación
- **Dado** un estudiante con sesión, **cuando** envía su contraseña actual correcta y una nueva válida, **entonces** recibe 204, la cookie se borra, la anterior ya no sirve para ingresar y la nueva sí.
- **Dado** que la persona tenía otra sesión abierta en otro navegador, **cuando** cambia la contraseña, **entonces** esa otra sesión recibe 401 en su siguiente petición.
- **Dado** una contraseña actual incorrecta, **entonces** 400 «La contraseña actual no es correcta.» y nada cambia.
- **Dado** una nueva igual a la actual, **entonces** 400 «La contraseña nueva debe ser distinta de la actual.».
- **Dado** que no hay sesión, **entonces** 401. **Dado** otro origen, **entonces** 403 sin leer la sesión.
- **Dado** un bibliotecario en la pantalla, **cuando** la llena bien, **entonces** termina en `/ingresar` con «Tu contraseña cambió. Ingresa con la nueva.».

## Bordes
- Nueva de 7 → 400; de 8 → 204; de 128 → 204; de 129 → 400.
- Contraseñas con espacios al inicio o al final se usan tal cual.
- Falta cualquiera de los dos datos o el cuerpo no es JSON → 400.

## Fuera de alcance
- Recuperar la contraseña olvidada (F16) y limitar intentos de ingreso (F17).
- Reglas extra de contraseña (mayúsculas, números…).
- Avisar por correo del cambio.

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Hay que escribir la actual? → **Sí, la actual y la nueva.**
2. ¿Qué pasa con las sesiones? → **Se cierran todas, también la actual.**
3. ¿La nueva debe ser distinta? → **Sí.**
4. ¿Qué parte se hace? → **API y pantalla.**
