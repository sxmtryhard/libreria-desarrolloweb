## Entrega: orquestador · F8 Listar los préstamos vencidos de una persona
**Hecho:**
- Contrato de la consulta y de la respuesta de vencidos.
- Servicio `overdue-service.ts`: decide de quién se lista según quién pregunta, filtra los activos vencidos, los ordena (más atrasado primero), les añade título, autor y la multa de F7, y suma el total.
- Puerto propio hacia el catálogo (`BookCatalog`) y `listActive` en el repositorio de préstamos, en memoria y en Firestore.
- Ruta `GET /api/loans/overdue` con el orden sesión → parámetros → permiso → búsqueda.
- 31 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/loans/schema.ts` (se añadió `OverdueQuerySchema`, `StaffOverdueQuerySchema`, `OverdueLoanSchema`, `OverdueLoansResponseSchema`)
- `app/features/loans/server/`: `overdue-service.ts` y `overdue-loans-handler.ts` (nuevos), `repository.ts`, `repository.memory.ts`, `repository.firestore.ts`
- `app/features/loans/tests/overdue-loans.test.ts`
- `app/features/container.ts`, `app/api/loans/overdue/route.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 459 pruebas pasan; `npm run build` → compila con `/api/loans/overdue`. Con `npm run dev`: `GET /api/loans/overdue` sin cookie → 401.

Probado contra Firebase real el 2026-11-16 con un script temporal y datos desechables (3 cuentas, 5 libros y 5 préstamos, ya borrados). Ana tenía dos vencidos (10 días y 2 días, cada uno con una hora más), uno sin vencer y uno devuelto tarde; Luis, uno vencido:
- Sin sesión → 401.
- Ana ve los suyos → 200 con dos préstamos, primero el de 10 días (11 días, 11000) y luego el de 2 (3 días, 3000); total 14000. El que no vence y el devuelto tarde no salen.
- Ana con su propio correo en mayúsculas → la misma lista.
- Luis ve solo el suyo (1 día, 1000); Luis pide los de Ana → 403.
- El personal con el correo de Ana → la misma lista que Ana; sin correo → 400; correo sin cuenta → 404; correo con mala forma → 400.

**Decisiones:**
- Servicio aparte (`createOverdueService`) en lugar de ampliar `createLoanService`: necesita una dependencia más (el catálogo) y así no cambian las pruebas de F5–F7.
- El «correo obligatorio para el personal» se valida con un segundo esquema (`StaffOverdueQuerySchema`), de modo que el 400 sale con `fields` como cualquier otro error de validación.
- Un prestatario que pide otro correo recibe 403 antes de buscar la cuenta: no se revela si existe.
- Título y autor se leen libro por libro (máximo 5 por persona, por el límite de F5).
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real un libro borrado (título y autor en `null`): todavía no se pueden retirar libros (F19). Está en las pruebas automáticas.
- No hay pantalla «Mis vencidos» (F35) ni del mostrador (F34).
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/loans/server/overdue-service.ts` (`borrowerUidFor`) | El correo propio se compara con el de la sesión en minúsculas; depende de que Firebase guarde los correos en minúsculas (lo hace) | — | — |
| Info | `app/api/loans/overdue/route.ts` | El correo viaja en la URL de un `GET`; puede quedar en registros del servidor | Consulta del personal | Aceptado: solo lo usa el personal y es un dato que ya conoce |

Sin hallazgos en autorización (sesión obligatoria; el prestatario solo ve lo suyo y su identidad sale de la sesión; comprobado en real con dos prestatarios), validación (Zod con longitud máxima), fuga de datos (el 403 no distingue cuentas existentes; la respuesta no trae correos ni nombres) ni escritura (la ruta no cambia nada). **Aprobado con observaciones.**
