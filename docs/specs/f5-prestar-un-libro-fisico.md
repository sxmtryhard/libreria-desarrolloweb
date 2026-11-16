# F5 · Prestar un libro físico

- **Estado:** Aprobada (por la persona, 2026-11-15)
- **Rol(es):** Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`) presta; Prestatario (`EXTERNO`, `ESTUDIANTE`, `DOCENTE`) recibe
- **Contrato afectado:** `app/features/loans/schema.ts` (se crea)

## Objetivo
El personal registra en el mostrador que le presta un ejemplar físico de un libro a una persona, con su fecha de devolución.

## Reglas de negocio

### 1. Quién presta y a quién
1.1. Solo el personal (`BIBLIOTECARIO`, `ADMINISTRADOR`) registra préstamos. El prestatario no se presta a sí mismo.
1.2. El personal indica el libro por su identificador (`book_id`) y a la persona por su correo (`borrower_email`).
1.3. El correo se compara sin espacios en los extremos y en minúsculas.
1.4. Si no existe una cuenta con ese correo → 404 «No existe una cuenta con ese correo.».
1.5. Solo reciben préstamos las cuentas de rol `EXTERNO`, `ESTUDIANTE` o `DOCENTE`. Si la cuenta es de `BIBLIOTECARIO` o `ADMINISTRADOR` → 409 «El personal no puede recibir préstamos.».
1.6. Si no existe el libro → 404 «No existe ese libro.».

### 2. Plazo (decisión de la persona: según el rol)
2.1. El plazo depende del rol del prestatario en el momento del préstamo:

| Rol | Días |
| --- | --- |
| `EXTERNO` | 7 |
| `ESTUDIANTE` | 14 |
| `DOCENTE` | 30 |

2.2. `loaned_at` es el momento del préstamo (el tiempo se inyecta). `due_at` es `loaned_at` más los días del rol, contados como días exactos de 24 horas.
2.3. Un préstamo está **activo** mientras no tenga fecha de devolución (`returned_at` es `null`). Devolver es de F6.
2.4. Un préstamo activo está **vencido** cuando el momento actual es posterior a `due_at`. En el instante exacto de `due_at` todavía no está vencido.

### 3. Cuándo se rechaza (todas con 409 `CONFLICTO`)
3.1. **Vencidos** (decisión de la persona: se bloquea): si la persona tiene al menos un préstamo activo vencido → «La persona tiene préstamos vencidos.».
3.2. **Mismo libro** (decisión de la persona: uno por libro): si la persona ya tiene un préstamo activo de ese libro → «La persona ya tiene prestado este libro.».
3.3. **Límite** (decisión de la persona: según el rol): si la persona ya tiene tantos préstamos activos como permite su rol → «La persona ya alcanzó su límite de préstamos.».

| Rol | Préstamos activos a la vez |
| --- | --- |
| `EXTERNO` | 1 |
| `ESTUDIANTE` | 3 |
| `DOCENTE` | 5 |

3.4. **Sin ejemplares:** si el libro tiene `available_copies` en 0 → «No hay ejemplares disponibles de este libro.».
3.5. Si se cumplen varias a la vez, se informa la primera en este orden: cuenta inexistente (1.4) → personal (1.5) → libro inexistente (1.6) → vencidos (3.1) → mismo libro (3.2) → límite (3.3) → sin ejemplares (3.4).

### 4. Qué pasa al prestar
4.1. Se crea el préstamo y `available_copies` del libro baja en 1. `total_copies` no cambia.
4.2. Las comprobaciones de la regla 3 y el cambio de 4.1 son atómicos: dos préstamos simultáneos del último ejemplar no pueden salir bien los dos, y dos préstamos simultáneos a la misma persona no pueden superar su límite.
4.3. El préstamo guarda quién lo registró (`lent_by_uid`), que sale de la sesión, nunca del cuerpo.
4.4. El identificador del préstamo lo genera el sistema.

## Entradas y salidas
Ruta: `POST /api/loans` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `book_id` | Texto, 1–128 caracteres tras recortar |
| `borrower_email` | Texto; tras recortar y pasar a minúsculas, con forma de correo y máximo 254 caracteres |

Salida exitosa: **201** con el préstamo:
```json
{
  "id": "loan123",
  "book_id": "abc123",
  "borrower_uid": "uid-ana",
  "lent_by_uid": "uid-bibliotecario",
  "loaned_at": "2026-11-15T15:00:00.000Z",
  "due_at": "2026-11-29T15:00:00.000Z",
  "returned_at": null
}
```

Errores esperados (formato de F0): 400 `VALIDACION` (cuerpo inválido o no JSON, con `fields`); 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (origen o rol); 404 `NO_ENCONTRADO` (reglas 1.4 y 1.6); 409 `CONFLICTO` (reglas 1.5 y 3).

## Autorización
- **SÍ pueden prestar:** `BIBLIOTECARIO` y `ADMINISTRADOR`.
- **NO pueden:** `EXTERNO`, `ESTUDIANTE` y `DOCENTE` → 403.
- **Sin sesión:** 401.
- Orden: origen → sesión → rol → cuerpo. Quien no tiene permiso recibe 401 o 403 aunque el cuerpo sea inválido (no se revela si un libro o una cuenta existen).

## Criterios de aceptación
- **Dado** un `BIBLIOTECARIO`, un libro con 3 ejemplares disponibles y una cuenta `ESTUDIANTE` sin préstamos, **cuando** presta el libro el 2026-11-15 a las 15:00 UTC, **entonces** recibe 201 con `due_at` 2026-11-29 a las 15:00 UTC, `returned_at: null`, `lent_by_uid` igual al `uid` del bibliotecario, y el libro queda con 2 disponibles.
- **Dado** un prestatario `EXTERNO`, **cuando** se le presta, **entonces** `due_at` es 7 días después; **dado** un `DOCENTE`, 30 días después.
- **Dado** un `ADMINISTRADOR`, **cuando** presta un libro válido, **entonces** recibe 201.
- **Dado** un `ESTUDIANTE` con sesión, **cuando** llama a `POST /api/loans`, **entonces** recibe 403 y no se crea nada.
- **Dado** nadie con sesión, **cuando** se llama a `POST /api/loans`, **entonces** recibe 401.
- **Dado** un correo sin cuenta, **cuando** se presta, **entonces** recibe 404 «No existe una cuenta con ese correo.».
- **Dado** el correo de un `BIBLIOTECARIO`, **cuando** se le presta, **entonces** recibe 409 «El personal no puede recibir préstamos.».
- **Dado** un `book_id` que no existe, **cuando** se presta, **entonces** recibe 404 «No existe ese libro.».
- **Dado** un `EXTERNO` con 1 préstamo activo sin vencer, **cuando** se le presta otro libro, **entonces** recibe 409 «La persona ya alcanzó su límite de préstamos.» y el libro conserva sus disponibles.
- **Dado** un `ESTUDIANTE` con 3 préstamos activos, **cuando** se le presta un cuarto, **entonces** recibe 409; **dado** uno con 2, **entonces** recibe 201.
- **Dado** un `DOCENTE` con 5 préstamos activos, **cuando** se le presta un sexto, **entonces** recibe 409.
- **Dado** una persona con un préstamo activo cuyo `due_at` ya pasó, **cuando** se le presta otro libro, **entonces** recibe 409 «La persona tiene préstamos vencidos.».
- **Dado** una persona que ya tiene prestado ese libro, **cuando** se le presta otra vez, **entonces** recibe 409 «La persona ya tiene prestado este libro.».
- **Dado** un libro con 0 disponibles, **cuando** se presta, **entonces** recibe 409 «No hay ejemplares disponibles de este libro.».
- **Dado** un libro con 1 disponible y dos préstamos simultáneos a dos personas distintas, **cuando** se procesan, **entonces** uno recibe 201, el otro 409 y el libro queda con 0 disponibles.
- **Dado** un cuerpo con `lent_by_uid` o `borrower_uid` inventados, **cuando** se presta, **entonces** se ignoran: valen la sesión y el correo.

## Bordes
- `borrower_email` con mayúsculas y espacios (`"  Ana@Correo.TEST "`) → se busca `ana@correo.test`.
- `borrower_email` sin forma de correo → 400 con `fields` `borrower_email`.
- `book_id` vacío o de solo espacios → 400 con `fields` `book_id`; de 129 caracteres → 400.
- Falta `book_id` o `borrower_email` → 400.
- Préstamo activo con `due_at` exactamente igual al momento actual → no está vencido; un milisegundo después → vencido.
- Persona vencida que además está en su límite → se informa «La persona tiene préstamos vencidos.» (orden de la regla 3.5).
- Persona en su límite y libro sin ejemplares → se informa el límite.
- Préstamos ya devueltos (`returned_at` con fecha) no cuentan para el límite, ni para vencidos, ni para «mismo libro».
- Petición desde otro origen → 403 sin mirar sesión ni cuerpo.

## Fuera de alcance
- Devolver (F6), multas (F7, F26), listar vencidos (F8), ver mis préstamos (F23), renovar (F24), reservar (F25).
- Pantalla de préstamos y devoluciones (F34): aquí solo la API.
- Préstamo de copias digitales (F38).
- Cuentas desactivadas (F14).
- Buscar a la persona por nombre.

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Cuántos días dura un préstamo? → **Según el rol: Externo 7, Estudiante 14, Docente 30.**
2. ¿Cuántos libros a la vez? → **Según el rol: Externo 1, Estudiante 3, Docente 5.**
3. ¿Se presta a alguien con vencidos? → **No, se bloquea.**
4. ¿Dos ejemplares del mismo libro a la vez? → **No, uno por libro.**
