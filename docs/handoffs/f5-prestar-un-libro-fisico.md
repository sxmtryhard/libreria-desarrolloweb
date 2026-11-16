## Entrega: orquestador · F5 Prestar un libro físico
**Hecho:**
- Contrato de préstamos (entrada de préstamo y préstamo).
- Servicio con el plazo y el límite por rol, los rechazos en el orden de la regla 3.5 y el rol de quien presta.
- Repositorio en memoria y en Firestore (colección `loans`); prestar ocurre en una transacción que lee el libro y los préstamos activos de la persona, crea el préstamo y baja `available_copies`.
- Ruta `POST /api/loans` con el orden origen → sesión → rol → cuerpo.
- 52 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/loans/schema.ts`
- `app/features/loans/server/`: `loan-service.ts`, `lend-book-handler.ts`, `repository.ts`, `repository.memory.ts`, `repository.firestore.ts`
- `app/features/loans/tests/lend-book.test.ts`
- `app/features/container.ts`, `app/api/loans/route.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 357 pruebas pasan; `npm run build` → compila con `/api/loans`. Con `npm run dev`: `POST /api/loans` sin cookie → 401.

Probado contra Firebase real el 2026-11-15 con un script temporal y datos desechables (3 cuentas y 3 libros, ya borrados):
- Sin sesión → 401; un externo intenta prestar → 403.
- Correo sin cuenta → 404; prestarle al personal → 409; libro inexistente → 404.
- Externo (correo en mayúsculas y con espacios) → 201 con plazo de 7 días y el libro pasó de 2 a 1 disponibles.
- Mismo libro otra vez → 409; segundo libro al externo → 409 por límite.
- Docente → 201 con plazo de 30 días.
- Dos préstamos simultáneos del último ejemplar → uno 201 y otro 409; el libro quedó en 0.

**Decisiones:**
- Préstamos no importa el `server/` de `catalog` ni de `accounts`: declara sus puertos (`LoanRepository`, `BorrowerDirectory`) y su adaptador de Firestore lee `accounts` y cambia solo `available_copies` de `books`.
- El repositorio recibe una función `decide` pura del servicio: las reglas siguen en el servicio y la transacción puede reintentarla.
- La persona se busca por el campo `email` del documento `accounts/{uid}`, fuera de la transacción; su rol es el del momento del préstamo.
- Los números de plazo y límite están en `loan-service.ts` (`LOAN_DAYS`, `MAX_ACTIVE_LOANS`).
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se provocó en Firebase real: el rechazo por vencidos, el mensaje «No hay ejemplares disponibles de este libro.», el plazo de 14 días del estudiante ni los límites de 3 y 5. Están en las pruebas automáticas.
- No hay pantalla (F34) ni devolución (F6): un préstamo creado no se puede cerrar todavía.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/loans/server/loan-service.ts` (`lend`) | Los 404 distinguen «no existe la cuenta» de «no existe el libro»; solo los ve el personal ya autorizado | `POST /api/loans` como bibliotecario con un correo inventado | Aceptado: es lo que pide la spec |
| Info | `app/features/loans/server/repository.firestore.ts` (`findByEmail`) | El rol del prestatario se lee fuera de la transacción: si cambia de rol en ese instante, vale el rol leído | Solo con un cambio de rol simultáneo | Aceptado; no existe aún cambio de rol |

Sin hallazgos en autorización (sesión, rol y orden; `lent_by_uid` sale de la sesión y `borrower_uid` del correo, los del cuerpo se ignoran), validación (Zod con longitudes máximas), atomicidad (transacción; comprobada con dos peticiones simultáneas), fuga de datos (la respuesta solo trae el préstamo) ni inyección (el `book_id` se usa como identificador de documento ya recortado y acotado). **Aprobado con observaciones.**
