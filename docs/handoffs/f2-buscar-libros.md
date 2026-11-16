## Entrega: orquestador · F2 Buscar libros por título o autor
**Hecho:**
- Contrato ampliado: parámetros de búsqueda (`q`, máximo 100) y respuesta `{ books }`.
- Normalización de texto (minúsculas, sin tildes, espacios simples), coincidencia por frase y orden título → autor → `id`.
- Servicio `search` (filtra, ordena y corta en 50) y `listAll` en los repositorios en memoria y Firestore.
- Ruta pública `GET /api/books?q=`.
- 32 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/catalog/schema.ts`
- `app/features/catalog/server/`: `search-text.ts`, `search-books-handler.ts` (nuevos); `book-service.ts`, `repository.ts`, `repository.memory.ts`, `repository.firestore.ts` (ampliados)
- `app/features/catalog/tests/search-books.test.ts`
- `app/features/container.ts`, `app/api/books/route.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 216 pruebas pasan; `npm run build` → compila con `/api/books` dinámica. Con `npm run dev` y el `.env`: `GET /api/books` → 200 con todos los libros; `GET /api/books?q=PRUEBA` → los libros de prueba; `?q=zzz` → `{"books":[]}`; `q` de 101 caracteres → 400 con `fields` que nombra `q`.

**Decisiones:**
- El filtro y el orden se hacen en el servicio sobre todos los libros (`listAll`): Firestore no sabe buscar «contiene» ni ignorar tildes. Vale para un catálogo pequeño; si crece, habrá que guardar un campo normalizado o usar un buscador (revisar al hacer F21).
- El orden compara los textos normalizados carácter a carácter, sin depender del idioma del servidor.
- La ruta no lee la cookie ni comprueba el origen: es pública y no modifica nada.
- Hecho en una sola sesión de Claude Code, sin delegar en subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No hay página con buscador todavía; solo la API.
- En Firestore real solo hay 2 libros de prueba sin tildes: tildes, `ñ`, orden y el tope de 50 están comprobados con el repositorio en memoria, no en vivo.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Baja | `app/features/catalog/server/book-service.ts` (`search`) | Cada búsqueda lee toda la colección `books`; al ser pública y sin límite de peticiones, alguien podría gastar la cuota de lecturas de Firestore | Muchas peticiones seguidas a `GET /api/books` | Aceptado por ahora (catálogo pequeño); revisar con F21 o al añadir límite de peticiones |
| Info | `app/shared/server/http.ts` (`fieldsOf`) | El mensaje de cada campo inválido sale en inglés (texto por defecto de Zod); no filtra datos | `GET /api/books?q=` con 101 caracteres | Fuera del alcance de F2; decidir si se traducen |

Sin hallazgos en autorización (pública por decisión de la persona; no expone datos de cuentas), validación (`q` con longitud máxima; se trata como texto, sin expresiones regulares ni consultas construidas con él) ni inyección. **Aprobado con observaciones.**
