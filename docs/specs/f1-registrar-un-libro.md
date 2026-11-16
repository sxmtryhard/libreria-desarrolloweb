# F1 · Registrar un libro

- **Estado:** Aprobada (por la persona, 2026-11-15)
- **Rol(es):** Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`)
- **Contrato afectado:** `app/features/catalog/schema.ts` (se crea)

## Objetivo
El personal de la biblioteca registra un libro nuevo en el catálogo con sus ejemplares físicos.

## Reglas de negocio
1. Un libro se registra con cuatro datos, todos obligatorios (decisión de la persona): **título**, **autor**, **ISBN** y **número de ejemplares**.
2. **Título:** texto de 1 a 200 caracteres después de quitar los espacios de los extremos.
3. **Autor:** texto de 1 a 120 caracteres después de quitar los espacios de los extremos.
4. **ISBN:** se aceptan guiones y espacios, que se eliminan antes de validar y guardar. Lo que queda debe ser: 13 dígitos, o 10 caracteres donde los 9 primeros son dígitos y el último es un dígito o `X` (mayúscula o minúscula; se guarda en mayúscula). Se guarda siempre sin guiones ni espacios.
5. En esta feature **no** se comprueba el dígito verificador del ISBN (eso es F22).
6. **Ejemplares:** número entero de **1 a 100** (decisión de la persona).
7. **ISBN repetido:** si ya existe un libro con el mismo ISBN (comparado ya normalizado), el registro **se rechaza** con `ConflictError` y el mensaje «Ya existe un libro con ese ISBN.» (decisión de la persona). No se crea nada ni se suman ejemplares.
8. La comprobación de ISBN repetido y la creación son atómicas: dos registros simultáneos del mismo ISBN no pueden crear dos libros.
9. Al registrarse, el libro queda con `available_copies` igual a `total_copies` (todos los ejemplares disponibles) y con `created_at` igual al momento del registro (el tiempo se inyecta).
10. El identificador del libro (`id`) lo genera el sistema; no lo envía el cliente.

## Entradas y salidas
Ruta: `POST /api/books` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `title` | Texto, 1–200 caracteres tras recortar |
| `author` | Texto, 1–120 caracteres tras recortar |
| `isbn` | Texto; tras quitar guiones y espacios: 13 dígitos, o 9 dígitos + dígito o `X` |
| `total_copies` | Entero, 1–100 |

Salida exitosa: **201** con el libro creado:
```json
{
  "id": "abc123",
  "title": "Cien años de soledad",
  "author": "Gabriel García Márquez",
  "isbn": "9780307474728",
  "total_copies": 3,
  "available_copies": 3,
  "created_at": "2026-11-15T15:00:00.000Z"
}
```

Errores esperados (formato de F0):
- `ZodError` → 400 `VALIDACION` con `fields`: falta un dato, tiene el tipo equivocado o no cumple las reglas 2–6.
- `ValidationError` → 400: el cuerpo no es JSON válido.
- `UnauthenticatedError` → 401: no hay sesión válida.
- `ForbiddenError` → 403: el origen no es el del sitio, o el rol no es `BIBLIOTECARIO` ni `ADMINISTRADOR`.
- `ConflictError` → 409 «Ya existe un libro con ese ISBN.»: ISBN repetido.

## Autorización
- **SÍ pueden:** `BIBLIOTECARIO` y `ADMINISTRADOR` (decisión de la persona).
- **NO pueden:** `EXTERNO`, `ESTUDIANTE` y `DOCENTE` → 403.
- **Sin sesión:** 401.
- Orden de comprobación: origen → sesión → rol → cuerpo. Quien no tiene permiso recibe 401 o 403 aunque el cuerpo sea inválido o el ISBN esté repetido (no se revela si un libro existe).

## Criterios de aceptación
- **Dado** un `BIBLIOTECARIO` con sesión, **cuando** registra `{ title: "Rayuela", author: "Julio Cortázar", isbn: "978-84-376-0494-7", total_copies: 3 }`, **entonces** recibe 201 con `isbn: "9788437604947"`, `total_copies: 3`, `available_copies: 3`, un `id` no vacío y `created_at` igual al momento inyectado.
- **Dado** un `ADMINISTRADOR` con sesión, **cuando** registra un libro válido, **entonces** recibe 201.
- **Dado** un `ESTUDIANTE`, un `DOCENTE` o un `EXTERNO` con sesión, **cuando** intenta registrar un libro válido, **entonces** recibe 403 y no se crea nada.
- **Dado** que no hay sesión, **cuando** se intenta registrar un libro, **entonces** se recibe 401 y no se crea nada.
- **Dado** que ya existe un libro con ISBN `9788437604947`, **cuando** el personal registra otro con `isbn: "978-8437604947"`, **entonces** recibe 409 «Ya existe un libro con ese ISBN.» y el catálogo sigue con un solo libro con sus ejemplares sin cambios.
- **Dado** un título de solo espacios, **cuando** se registra, **entonces** se recibe 400 con `fields` que nombra `title`.
- **Dado** un título `"  Rayuela  "`, **cuando** se registra, **entonces** se guarda `"Rayuela"`.
- **Dado** `total_copies: 0`, `101`, `2.5` o `"3"`, **cuando** se registra, **entonces** se recibe 400 con `fields` que nombra `total_copies`.
- **Dado** `isbn: "12345"`, **cuando** se registra, **entonces** se recibe 400 con `fields` que nombra `isbn`.
- **Dado** `isbn: "0-306-40615-x"`, **cuando** se registra, **entonces** se guarda `"030640615X"`.
- **Dado** un `ESTUDIANTE` y un cuerpo inválido, **cuando** intenta registrar, **entonces** recibe 403 (no 400).
- **Dado** un `POST` desde otro origen con sesión de `BIBLIOTECARIO`, **cuando** llega la petición, **entonces** recibe 403 «Origen no permitido.».

## Bordes
- `total_copies`: 1 y 100 se aceptan; 0 y 101 se rechazan; negativo y decimal se rechazan.
- Título de 200 caracteres se acepta; de 201 se rechaza. Autor de 120 se acepta; de 121 se rechaza.
- ISBN de 13 dígitos con una letra → rechazado; `X` en una posición que no es la última → rechazado; ISBN-13 terminado en `X` → rechazado.
- Falta cualquiera de los cuatro campos → 400 con ese campo en `fields`.
- Campos extra en el cuerpo (por ejemplo `id` o `available_copies`) se ignoran: no cambian el libro creado.
- Mismo título y autor con ISBN distinto → se acepta (son ediciones distintas).

## Fuera de alcance
- El formulario para registrar libros (F36) y la búsqueda (F2).
- Dígito verificador del ISBN (F22), categoría y año (F20), editar o retirar (F18, F19).
- Copias digitales (F27).
- Libros de ejemplo en el seed (se decidirá cuando haga falta para probar F2).

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Qué datos se piden? → **Título, autor, ISBN y ejemplares.**
2. ¿Quién puede registrar? → **Bibliotecario y Administrador.**
3. ¿ISBN repetido? → **Se rechaza con error.**
4. ¿Cuántos ejemplares? → **De 1 a 100.**

Propuestas del agente que quedan aceptadas si la persona aprueba la spec (puede cambiarlas antes):
5. Longitudes máximas: título 200 y autor 120 caracteres (reglas 2 y 3).
6. Formato de ISBN aceptado: 10 o 13 caracteres, con guiones o espacios opcionales, guardado sin ellos (regla 4).
7. Texto del error de ISBN repetido: «Ya existe un libro con ese ISBN.» (regla 7).
8. La ruta es `POST /api/books` y responde 201 con el libro creado.
9. Los campos extra del cuerpo se ignoran en vez de rechazarse.
