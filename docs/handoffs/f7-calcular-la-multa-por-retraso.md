## Entrega: orquestador · F7 Calcular la multa por retraso
**Hecho:**
- Función pura `calculateFine(loan, now)`: días de retraso (cada día de 24 horas empezado cuenta), 1.000 pesos por día y tope de 30 días.
- La respuesta de la devolución (`POST /api/loans/return`) añade `days_late` y `fine_amount`; `returned_late` vale `true` exactamente cuando `days_late` es mayor que 0.
- 35 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/features/loans/schema.ts` (se añadió `LoanFineSchema` y dos campos a `ReturnedLoanSchema`)
- `app/features/loans/server/fine.ts` (nuevo), `app/features/loans/server/loan-service.ts`
- `app/features/loans/tests/fine.test.ts` (nuevo), `app/features/loans/tests/return-book.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 428 pruebas pasan; `npm run build` → compila.

Probado contra Firebase real el 2026-11-16 con un script temporal y datos desechables (2 cuentas y 4 libros, ya borrados), devolviendo préstamos con distinto vencimiento:
- Vence en 2 días → `returned_late: false`, `days_late: 0`, `fine_amount: 0`.
- 1 hora tarde → `days_late: 1`, `fine_amount: 1000`.
- 2 días y medio tarde → `days_late: 3`, `fine_amount: 3000`.
- 45 días (y unos instantes) tarde → `days_late: 46`, `fine_amount: 30000` (tope).

**Decisiones:**
- Se cambió una prueba de F6: la que comprobaba que la respuesta de la devolución tenía «exactamente `loan` y `returned_late`» ahora espera los cuatro campos. Lo ordena la regla 2.3 de la spec F7 (cambio de contrato aprobado por la persona); no se cambió para hacer pasar código.
- El valor por día y el tope están en `fine.ts` (`FINE_PER_DAY`, `MAX_FINED_DAYS`); el máximo de `fine_amount` (30000) también lo valida el contrato.
- `calculateFine` ya sirve para préstamos activos (corte = momento actual), aunque en esta feature solo lo usa la devolución; lo usará F8.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- La multa solo se informa: no se guarda ni se cobra (F26).
- No hay pantalla que la muestre (F34, F35).
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/loans/server/fine.ts` | La multa se calcula en el servidor con fechas guardadas y la hora inyectada; el cliente no envía ningún dato que la altere | — | — |

Sin hallazgos: no hay rutas nuevas, la autorización es la de F6, no entra ningún dato nuevo del cliente y la respuesta solo añade dos números. **Aprobado.**
