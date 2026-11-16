## Entrega: orquestador · F1 Registrar un libro
**Hecho:**
- Contrato del catálogo (entrada de registro y libro) con normalización de ISBN.
- Servicio con la regla de roles y de ISBN repetido; repositorio en memoria y en Firestore (transacción para la unicidad).
- Ruta `POST /api/books` con el orden origen → sesión → rol → cuerpo.
- 39 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/catalog/schema.ts`
- `app/features/catalog/server/`: `book-service.ts`, `register-book-handler.ts`, `repository.ts`, `repository.memory.ts`, `repository.firestore.ts`
- `app/features/catalog/tests/register-book.test.ts`
- `app/features/container.ts`, `app/api/books/route.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 184 pruebas pasan; `npm run build` → compila con la ruta `/api/books`. Con `npm run dev`: `POST /api/books` sin cookie → 401 `NO_AUTENTICADO`; con `Origin` de otro sitio → 403 «Origen no permitido.».

**Decisiones:**
- El manejador de la ruta es una función con dependencias inyectadas (`register-book-handler.ts`) para poder probar el orden de las comprobaciones sin Firebase; `route.ts` solo lo conecta.
- El rol se comprueba dos veces: antes de leer el cuerpo (`assertCanRegister`) y dentro de `register`, para que el servicio sea seguro aunque lo llame otra ruta.
- La unicidad del ISBN la garantiza el repositorio (`insertUnique`), no una consulta previa del servicio.
- Hecho en una sola sesión de Claude Code, sin delegar en subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- Resuelto el 2026-11-15: con el `.env` y el seed de la persona, se probó contra Firestore real con un script temporal (ya borrado): bibliotecario → 201; mismo ISBN → 409; estudiante → 403; dos registros simultáneos del mismo ISBN → un 201 y un 409. Quedaron 2 libros de prueba en `books`.
- No existe todavía forma de ingresar (F4) ni formulario (F36): la ruta solo se puede usar con una cookie de sesión válida.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/catalog/server/repository.firestore.ts` (`insertUnique`) | La unicidad depende de que una consulta dentro de la transacción bloquee inserciones simultáneas del mismo ISBN; no comprobado contra Firestore real | sospecha, pendiente del `.env` | Probar dos registros simultáneos al tener Firebase |
| Info | `app/api/books/route.ts` | Con el entorno sin configurar, una cookie cualquiera produce 500 genérico (no filtra detalles) | `POST` con `Cookie: session=x` y sin `.env` | Esperado (spec F0, regla 5.5) |

Sin hallazgos en autorización (sesión, rol y orden), validación (Zod con longitudes máximas) ni inyección. **Aprobado con observaciones:** correcto con el repositorio en memoria; falta la prueba contra Firestore real.
