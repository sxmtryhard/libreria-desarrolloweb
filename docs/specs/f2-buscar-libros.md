# F2 · Buscar libros por título o autor

- **Estado:** Aprobada (por la persona, 2026-11-15)
- **Rol(es):** Público (cualquiera, con o sin sesión)
- **Contrato afectado:** `app/features/catalog/schema.ts` (se amplía)

## Objetivo
Cualquier persona busca libros del catálogo escribiendo parte del título o del autor, y ve cuántos ejemplares hay disponibles.

## Reglas de negocio
1. La búsqueda recibe un solo texto, `q`, opcional. Antes de usarlo se le quitan los espacios de los extremos.
2. **Coincidencia** (decisión de la persona): un libro aparece si su **título o su autor contiene** el texto buscado, comparando ambos ya *normalizados*.
3. **Normalizar** un texto es: pasarlo a minúsculas, quitarle las tildes y demás signos diacríticos (`á→a`, `ü→u`, `ñ→n`) y dejar un solo espacio donde haya varios seguidos. Así «garcia» encuentra «Gabriel García Márquez» y «CIEN  AÑOS» encuentra «Cien años de soledad».
4. El texto se busca **como una sola frase**, no palabra por palabra: «marquez garcia» no encuentra «Gabriel García Márquez».
5. **Búsqueda vacía** (decisión de la persona): si `q` no se envía o queda vacío tras recortar, se devuelven **todos los libros** (hasta el máximo de la regla 7).
6. **Orden:** por título normalizado, de la A a la Z. Si dos libros tienen el mismo título normalizado, por autor normalizado; si también coincide, por `id`.
7. **Máximo:** se devuelven como mucho **50 libros** (decisión de la persona): los primeros 50 según el orden de la regla 6.
8. `q` admite como máximo **100 caracteres** después de recortar; si tiene más, la búsqueda se rechaza con error de validación.
9. La búsqueda no modifica nada.

## Entradas y salidas
Ruta: `GET /api/books?q=texto`.

| Entrada | Tipo / restricción |
| --- | --- |
| `q` (parámetro de la URL) | Texto opcional, 0–100 caracteres tras recortar |

Salida exitosa: **200** con la lista (puede estar vacía):
```json
{
  "books": [
    {
      "id": "abc123",
      "title": "Cien años de soledad",
      "author": "Gabriel García Márquez",
      "isbn": "9780307474728",
      "total_copies": 3,
      "available_copies": 3,
      "created_at": "2026-11-15T15:00:00.000Z"
    }
  ]
}
```
Cada libro tiene los mismos campos que devuelve F1.

Errores esperados (formato de F0):
- `ZodError` → 400 `VALIDACION` con `fields` que nombra `q`: el texto tiene más de 100 caracteres.

## Autorización
- **SÍ pueden:** todos, **sin sesión** (decisión de la persona). No se lee la cookie de sesión.
- **NO pueden:** nadie queda excluido.
- No se comprueba el origen: la regla de origen de F0 aplica solo a peticiones que modifican datos.

## Criterios de aceptación
Catálogo de ejemplo: «Cien años de soledad» (Gabriel García Márquez), «Rayuela» (Julio Cortázar) y «El amor en los tiempos del cólera» (Gabriel García Márquez).

- **Dado** el catálogo de ejemplo y sin sesión, **cuando** se busca `q=garcia`, **entonces** se recibe 200 con dos libros, en este orden: «Cien años de soledad» y «El amor en los tiempos del cólera».
- **Dado** el catálogo de ejemplo, **cuando** se busca `q=RAYU`, **entonces** se recibe solo «Rayuela».
- **Dado** el catálogo de ejemplo, **cuando** se busca `q=colera`, **entonces** se recibe solo «El amor en los tiempos del cólera».
- **Dado** el catálogo de ejemplo, **cuando** se busca `q=CÓRTAZAR` (tilde en otro sitio), **entonces** se recibe solo «Rayuela».
- **Dado** el catálogo de ejemplo, **cuando** se busca `q=anos de`, **entonces** se recibe solo «Cien años de soledad».
- **Dado** el catálogo de ejemplo, **cuando** se busca `q=marquez garcia`, **entonces** se recibe 200 con `books` vacío.
- **Dado** el catálogo de ejemplo, **cuando** se busca `q=zzz`, **entonces** se recibe 200 con `books` vacío.
- **Dado** el catálogo de ejemplo, **cuando** se busca sin `q`, con `q=` o con `q` de solo espacios, **entonces** se reciben los tres libros ordenados: «Cien años de soledad», «El amor en los tiempos del cólera», «Rayuela».
- **Dado** el catálogo de ejemplo, **cuando** se busca `q=  rayuela  `, **entonces** se recibe «Rayuela».
- **Dado** un catálogo con 60 libros, **cuando** se busca sin `q`, **entonces** se reciben exactamente los 50 primeros por título.
- **Dado** un `q` de 101 caracteres, **cuando** se busca, **entonces** se recibe 400 con `fields` que nombra `q`.
- **Dado** un catálogo vacío, **cuando** se busca cualquier cosa, **entonces** se recibe 200 con `books` vacío.
- **Dado** un libro recién registrado con F1, **cuando** se busca por su título, **entonces** aparece con `available_copies` igual a `total_copies`.

## Bordes
- `q` de 100 caracteres se acepta; de 101 se rechaza.
- Varios espacios seguidos dentro de `q` cuentan como uno: `q=cien    años` encuentra «Cien años de soledad».
- El orden ignora mayúsculas y tildes: «álgebra» va antes que «Biología».
- Exactamente 50 libros coincidentes → se devuelven los 50; con 51 → se devuelven 50.
- La búsqueda no mira el ISBN: buscar un ISBN no encuentra el libro (salvo que el número aparezca en el título o el autor).
- Caracteres especiales en `q` (`%`, `*`, `.`) se tratan como texto normal, no como comodines.
- Si `q` llega repetido en la URL, se usa el primero.
- Con sesión de cualquier rol el resultado es el mismo que sin sesión.

## Fuera de alcance
- La página con el buscador (más adelante, en la ola de pantallas).
- Paginación e indicar cuántos resultados quedaron fuera (F21).
- Filtrar por categoría o año (F20) y buscar por ISBN.
- Libros retirados del catálogo (F19) y copias digitales (F27).
- Buscar palabra por palabra o tolerar errores de escritura.

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Quién puede buscar? → **Cualquiera, sin sesión.**
2. ¿Cómo coincide? → **Contiene el texto, sin distinguir tildes ni mayúsculas.**
3. ¿Búsqueda vacía? → **Muestra todos los libros.**
4. ¿Máximo de resultados? → **50, ordenados por título.**

Propuestas del agente que quedan aceptadas si la persona aprueba la spec (puede cambiarlas antes):
5. La `ñ` se trata como `n` al comparar («nino» encuentra «niño») (regla 3).
6. El texto se busca como una sola frase, no palabra por palabra (regla 4).
7. `q` admite hasta 100 caracteres; más largo responde 400 (regla 8).
8. Desempate del orden: autor y luego `id` (regla 6).
9. La ruta es `GET /api/books?q=` y responde `{ "books": [...] }` con los mismos campos de F1, incluido el número de ejemplares.
10. La búsqueda no incluye el ISBN.
