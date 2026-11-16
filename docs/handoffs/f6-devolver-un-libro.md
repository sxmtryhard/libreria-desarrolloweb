## Entrega: orquestador · F6 Devolver un libro
**Hecho:**
- Contrato de la devolución (entrada y respuesta con `loan` y `returned_late`).
- Servicio: rol de quien recibe, búsqueda de la persona por correo, traducción de «sin libro» y «sin préstamo activo» a 404 y aviso de devolución tardía.
- Repositorio en memoria y en Firestore: devolver ocurre en una transacción que lee el libro y el préstamo activo, pone `returned_at` y sube `available_copies`.
- Ruta `POST /api/loans/return` con el orden origen → sesión → rol → cuerpo.
- 36 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/loans/schema.ts` (se añadió `ReturnBookInputSchema` y `ReturnedLoanSchema`)
- `app/features/loans/server/`: `loan-service.ts`, `return-book-handler.ts`, `repository.ts`, `repository.memory.ts`, `repository.firestore.ts`
- `app/features/loans/tests/return-book.test.ts`
- `app/features/container.ts`, `app/api/loans/return/route.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 393 pruebas pasan; `npm run build` → compila con `/api/loans/return`. Con `npm run dev`: `POST /api/loans/return` sin cookie → 401.

Probado contra Firebase real el 2026-11-15 con un script temporal y datos desechables (2 cuentas y 2 libros, ya borrados):
- Sin sesión → 401; el propio prestatario intenta devolver → 403.
- Devolver sin tenerlo → 404 «La persona no tiene prestado este libro.»; correo sin cuenta → 404; libro inexistente → 404.
- Prestar (disponibles 1 → 0) y devolver a tiempo → 200 con `returned_late: false` (disponibles 0 → 1).
- Devolver otra vez → 404; prestar de nuevo el mismo libro → 201.
- Dos devoluciones simultáneas → una 200 y otra 404; los disponibles subieron solo en 1.
- Con un préstamo vencido: prestar otro → 409 «La persona tiene préstamos vencidos.»; devolver el vencido → 200 con `returned_late: true`; prestar después → 201.

**Decisiones:**
- El repositorio devuelve un resultado (`returned`, `no_book`, `no_active_loan`) y el servicio lo traduce a errores: las reglas y los textos siguen en el servicio.
- La devolución no cambia el contrato del préstamo de F5 (`LoanSchema`): no se añadieron campos.
- `returned_late` usa la misma comparación que el vencimiento de F5 (`isOverdue`).
- En el repositorio en memoria el identificador ahora se pone al final (`{ ...loan, id }`) para que sembrar un préstamo copiado de otro no herede su `id`.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No hay pantalla (F34) ni multa (F7, F26).
- `available_copies` sube sin comprobar que no pase de `total_copies`; no puede pasar mientras solo F5 y F6 lo cambien, pero habrá que cuidarlo al editar ejemplares (F18).
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/loans/server/loan-service.ts` (`returnBook`) | No queda registrado qué miembro del personal recibió la devolución | — | Fuera de alcance por la spec; valorar al hacer F34 |
| Info | `app/features/loans/server/repository.firestore.ts` (`returnLoan`) | `available_copies` no se limita a `total_copies` | Solo si otro proceso altera los ejemplares | Revisar en F18 |

Sin hallazgos en autorización (sesión, rol y orden; el prestatario no puede devolver su propio préstamo), validación (Zod con longitudes máximas), atomicidad (transacción; comprobada con dos peticiones simultáneas), fuga de datos (los 404 solo los ve el personal autorizado) ni inyección. **Aprobado con observaciones.**
