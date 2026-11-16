# F8 · Listar los préstamos vencidos de una persona

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Prestatario (`EXTERNO`, `ESTUDIANTE`, `DOCENTE`) ve los suyos; Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`) ve los de cualquiera
- **Contrato afectado:** `app/features/loans/schema.ts` (se añade la consulta y la respuesta de vencidos)

## Objetivo
Saber qué libros tiene una persona sin devolver después de su fecha de vencimiento, cuánto lleva de retraso cada uno y cuánto debe hasta hoy.

## Reglas de negocio

### 1. Qué entra en la lista
1.1. Entran los préstamos de la persona que están **activos** (sin devolver) y **vencidos**: el momento actual es posterior a `due_at` (misma regla que F5 2.4; el tiempo se inyecta).
1.2. No entran los préstamos devueltos (aunque se hayan devuelto tarde) ni los activos que aún no vencen. Un préstamo que vence exactamente ahora todavía no entra.
1.3. **Orden** (decisión de la persona): el más atrasado primero, es decir, por `due_at` de más antiguo a más reciente. Si dos vencen en el mismo instante, por `loan_id`.

### 2. Qué muestra cada préstamo (decisión de la persona)
2.1. Cada elemento trae: `loan_id`, `book_id`, `book_title`, `book_author`, `loaned_at`, `due_at`, `days_late` y `fine_amount`.
2.2. `days_late` y `fine_amount` son el cálculo de F7 hasta el momento actual (1.000 pesos por día empezado, tope de 30.000).
2.3. Si el libro ya no existe en el catálogo, `book_title` y `book_author` van en `null`; el préstamo sigue en la lista.

### 3. Total (decisión de la persona)
3.1. La respuesta trae `total_fine_amount`: la suma de `fine_amount` de los préstamos de la lista. Con la lista vacía es 0.
3.2. El total, como en F7, solo se informa: no se guarda ni se cobra.

### 4. Quién ve qué (decisión de la persona)
4.1. Hace falta sesión. Sin sesión → 401.
4.2. Un **prestatario** ve solo sus propios vencidos. Llama sin parámetros; la persona sale de la sesión.
4.3. Si un prestatario envía `borrower_email`: si es su propio correo (comparado sin espacios y en minúsculas) se le responde lo suyo; si es otro correo → 403, exista o no esa cuenta.
4.4. El **personal** consulta a cualquier persona indicando `borrower_email`. Si no lo envía → 400 `VALIDACION` con `fields` `borrower_email` (el personal no tiene préstamos propios).
4.5. Si el personal consulta un correo sin cuenta → 404 «No existe una cuenta con ese correo.».
4.6. Si el personal consulta el correo de una cuenta del personal → 200 con la lista vacía.

## Entradas y salidas
Ruta: `GET /api/loans/overdue`, con el parámetro opcional `borrower_email` en la URL.

| Entrada | Tipo / restricción |
| --- | --- |
| `borrower_email` | Opcional para prestatarios, obligatorio para el personal. Tras recortar y pasar a minúsculas: forma de correo y máximo 254 caracteres |

Salida exitosa: **200**
```json
{
  "borrower_uid": "uid-ana",
  "overdue_loans": [
    {
      "loan_id": "loan123",
      "book_id": "abc123",
      "book_title": "Rayuela",
      "book_author": "Julio Cortázar",
      "loaned_at": "2026-11-01T15:00:00.000Z",
      "due_at": "2026-11-15T15:00:00.000Z",
      "days_late": 3,
      "fine_amount": 3000
    }
  ],
  "total_fine_amount": 3000
}
```

Errores esperados (formato de F0): 400 `VALIDACION` (correo con mala forma, o falta para el personal); 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (un prestatario pide los de otro); 404 `NO_ENCONTRADO` (regla 4.5).

## Autorización
- **Prestatarios:** solo lo propio. Pedir los de otra persona → 403.
- **Personal:** cualquiera, por correo.
- **Sin sesión:** 401.
- Es una consulta (`GET`): no se valida el origen (regla 2.1 de F0) y no cambia ningún dato.
- Orden: sesión → parámetros → permiso → búsqueda. La identidad del prestatario sale de la sesión.

## Criterios de aceptación
- **Dado** Ana (`ESTUDIANTE`) con un préstamo activo de «Rayuela» que venció hace 2 días y medio, **cuando** Ana consulta sus vencidos, **entonces** recibe 200 con ese préstamo, `book_title: "Rayuela"`, `days_late: 3`, `fine_amount: 3000` y `total_fine_amount: 3000`.
- **Dado** Ana con dos vencidos (uno venció hace 10 días y otro hace 2), **cuando** consulta, **entonces** salen los dos, primero el de 10 días, y `total_fine_amount` es 12000.
- **Dado** Ana con un préstamo activo que aún no vence y otro devuelto tarde, **cuando** consulta, **entonces** la lista está vacía y `total_fine_amount` es 0.
- **Dado** un `BIBLIOTECARIO`, **cuando** consulta con el correo de Ana, **entonces** recibe la misma lista que vería Ana.
- **Dado** un `ADMINISTRADOR`, **cuando** consulta con el correo de Ana, **entonces** recibe 200.
- **Dado** Luis (`DOCENTE`), **cuando** consulta con el correo de Ana, **entonces** recibe 403.
- **Dado** Ana, **cuando** consulta con su propio correo en mayúsculas y con espacios, **entonces** recibe 200 con lo suyo.
- **Dado** un `BIBLIOTECARIO`, **cuando** consulta sin `borrower_email`, **entonces** recibe 400 con `fields` `borrower_email`.
- **Dado** un `BIBLIOTECARIO`, **cuando** consulta un correo sin cuenta, **entonces** recibe 404 «No existe una cuenta con ese correo.».
- **Dado** nadie con sesión, **cuando** se consulta, **entonces** recibe 401.
- **Dado** un vencido de hace 45 días, **cuando** se consulta, **entonces** `days_late` es 45 y `fine_amount` es 30000.

## Bordes
- Préstamo que vence exactamente ahora → no entra; un milisegundo después → entra con `days_late: 1`.
- Los vencidos de otras personas nunca aparecen en la lista de Ana.
- Un prestatario pide los de un correo que no existe → 403 (no se revela si la cuenta existe).
- `borrower_email` sin forma de correo → 400, sea quien sea.
- Libro que ya no existe → `book_title` y `book_author` en `null`.
- Dos vencidos con el mismo `due_at` → ordenados por `loan_id`.
- Personal consulta a otra cuenta del personal → 200 con lista vacía.
- Si `borrower_email` se repite en la URL, vale el primero.

## Fuera de alcance
- Listar todos los préstamos de una persona, activos e historial (F23).
- Listar los vencidos de todas las personas a la vez.
- Guardar o cobrar la multa (F26); renovar (F24).
- Pantalla «Mis vencidos» (F35) y pantalla del mostrador (F34): aquí solo la API.
- Paginación: una persona tiene como máximo 5 préstamos activos (F5).

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Quién ve la lista? → **Cada quien la suya; el personal la de cualquiera.**
2. ¿Qué muestra cada préstamo? → **Libro, fechas, días de retraso y multa.**
3. ¿En qué orden? → **El más atrasado primero.**
4. ¿Incluye el total de multas? → **Sí, la suma.**
