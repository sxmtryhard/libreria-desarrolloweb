# F36 · Formularios para registrar libros y cuentas

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`)
- **Contrato afectado:** ninguno de la API. `app/shared/ui/navigation.ts` (dos enlaces nuevos del personal). Usa `POST /api/books` (F1) y `POST /api/accounts` (F3) sin cambiarlas.

## Objetivo
Que el personal registre libros y cuentas desde pantallas, sin usar la API a mano.

## Reglas de negocio

### 1. Pantallas y acceso
1.1. Dos pantallas (decisión de la persona): **`/libros/nuevo`** («Registrar libro») y **`/cuentas/nueva`** («Registrar cuenta»).
1.2. Sin sesión → se va a `/ingresar`. Con sesión de prestatario → «No tienes permiso para ver esta pantalla.», sin formulario (como F34).
1.3. La barra del personal muestra, en este orden: «Préstamos», «Registrar libro» y «Registrar cuenta». Los prestatarios no los ven.
1.4. La autorización real sigue en el servidor (F1 y F3): la pantalla solo evita mostrar formularios que no servirían.

### 2. Formulario de libro (`/libros/nuevo`)
2.1. Campos: «Título», «Autor», «ISBN» y «Ejemplares»; botón «Registrar libro». «Ejemplares» empieza en **1** (decisión de la persona).
2.2. Antes de llamar al servidor se comprueba, y se muestra el primer problema:
- título vacío → «Escribe el título.»;
- autor vacío → «Escribe el autor.»;
- ISBN que, sin guiones ni espacios, no tiene 13 dígitos o 9 dígitos y un dígito o `X` → «El ISBN debe tener 13 dígitos, o 10 (el último puede ser X).»;
- ejemplares que no son un número entero de 1 a 100 → «Los ejemplares deben ser un número entero de 1 a 100.».

2.3. Se envía a `POST /api/books` con `total_copies` como número.
2.4. Éxito (201) → «Libro registrado: <título> (<n> ejemplares).» (o «1 ejemplar»), y el formulario queda limpio con «Ejemplares» en 1 (decisión de la persona).

### 3. Formulario de cuenta (`/cuentas/nueva`)
3.1. Campos: «Nombre», «Correo», «Rol» (lista con «Externo», «Estudiante» y «Docente», sin opción elegida al abrir), «Contraseña inicial» y «Repetir contraseña»; botón «Registrar cuenta». La contraseña se escribe dos veces (decisión de la persona).
3.2. Antes de llamar al servidor se comprueba, y se muestra el primer problema:
- nombre vacío → «Escribe el nombre.»;
- correo vacío → «Escribe el correo.»;
- sin rol → «Elige el rol.»;
- contraseña de menos de 8 o más de 128 caracteres → «La contraseña debe tener entre 8 y 128 caracteres.»;
- contraseñas distintas → «Las contraseñas no coinciden.».

3.3. Se envía a `POST /api/accounts` con `name`, `email`, `role` y `password` (sin la repetición).
3.4. Éxito (201) → «Cuenta creada: <nombre> (<correo>) · <Rol>.» y el formulario queda limpio.
3.5. Tras un error se conservan nombre, correo y rol, y se borran las dos contraseñas.

### 4. Errores del servidor (los dos formularios)
4.1. 409 → el mensaje del servidor («Ya existe un libro con ese ISBN.» o «Ya existe una cuenta con ese correo.»).
4.2. 400 → «Revisa los datos del formulario.»; 401 → «Tu sesión terminó. Vuelve a ingresar.»; 403 → «No tienes permiso para hacer esto.»; cualquier otro fallo → «No se pudo registrar. Intenta de nuevo.».
4.3. Tras un error del libro, los datos escritos se conservan.
4.4. Mientras se envía, el botón queda deshabilitado y dice «Registrando…». Los errores se muestran con `role="alert"` y los éxitos con `role="status"`.
4.5. Las pantallas cumplen `docs/frontend-rules.md` (360, 768 y 1024 px sin desplazamiento horizontal, HTML semántico, paleta, foco visible, 44 px, etiquetas en todos los campos).

## Entradas y salidas
No hay rutas nuevas. Usa:
- `POST /api/books` con `{ title, author, isbn, total_copies }` (F1).
- `POST /api/accounts` con `{ name, email, role, password }` (F3).

## Autorización
- Pantallas: solo `BIBLIOTECARIO` y `ADMINISTRADOR` ven los formularios. Sin sesión → `/ingresar`.
- La API ya exige sesión, rol y origen (F1, F3).

## Criterios de aceptación
- **Dado** un bibliotecario, **cuando** registra «Rayuela», «Julio Cortázar», «978-84-376-0494-7» con 3 ejemplares, **entonces** ve «Libro registrado: Rayuela (3 ejemplares).», el formulario queda vacío con 1 ejemplar y el libro aparece en `/catalogo`.
- **Dado** un ISBN ya registrado, **cuando** se envía, **entonces** se ve «Ya existe un libro con ese ISBN.» y los datos siguen escritos.
- **Dado** el ISBN «123», **cuando** se envía, **entonces** se ve el aviso del ISBN y no se llama al servidor.
- **Dado** un administrador, **cuando** registra «Ana Pérez», «ana@correo.test», «Estudiante» y la misma contraseña dos veces, **entonces** ve «Cuenta creada: Ana Pérez (ana@correo.test) · Estudiante.» y la persona puede ingresar.
- **Dado** contraseñas distintas, **cuando** se envía, **entonces** se ve «Las contraseñas no coinciden.» y no se llama al servidor.
- **Dado** un correo que ya tiene cuenta, **cuando** se envía, **entonces** se ve «Ya existe una cuenta con ese correo.», se conservan nombre, correo y rol y se borran las contraseñas.
- **Dado** un estudiante, **cuando** abre cualquiera de las dos pantallas, **entonces** ve «No tienes permiso para ver esta pantalla.» y su barra no tiene esos enlaces.
- **Dado** que no hay sesión, **cuando** abre cualquiera de las dos, **entonces** termina en `/ingresar`.

## Bordes
- Ejemplares 0, 101, 2,5 o vacío → aviso de ejemplares; 100 → se envía.
- ISBN con guiones y espacios («978-84 376-0494-7») o con `x` minúscula al final → válido.
- Título o autor de solo espacios → «Escribe el título.» / «Escribe el autor.».
- Contraseña de 8 caracteres → se envía; de 7 → aviso.
- Si la sesión venció mientras la pantalla estaba abierta → «Tu sesión terminó. Vuelve a ingresar.».

## Fuera de alcance
- Editar o retirar libros (F18, F19); validar el dígito verificador del ISBN (F22).
- Crear cuentas de personal (F13, pantalla en F37).
- Ver la lista de cuentas.

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Dónde van? → **Dos pantallas con enlace en la barra del personal.**
2. ¿Qué pasa tras el éxito? → **Mensaje y formulario limpio.**
3. ¿Se repite la contraseña? → **Sí.**
4. ¿Ejemplares al abrir? → **1.**
