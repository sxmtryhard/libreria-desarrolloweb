# F7 · Calcular la multa por retraso

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Sistema (la usa la devolución de F6; después la usarán F8 y F26)
- **Contrato afectado:** `app/features/loans/schema.ts` (la respuesta de la devolución gana `days_late` y `fine_amount`)

## Objetivo
Que el sistema sepa calcular cuánto debe una persona por devolver tarde un libro, y que el personal lo vea al registrar la devolución.

## Reglas de negocio

### 1. El cálculo
1.1. La multa de un préstamo depende solo de su fecha de vencimiento (`due_at`) y de un **momento de corte**:
- si el préstamo ya se devolvió, el corte es `returned_at`;
- si sigue activo, el corte es el momento actual (el tiempo se inyecta).

1.2. **Días de retraso** (decisión de la persona: cada día empezado cuenta): si el corte no es posterior a `due_at`, son 0. Si es posterior, es el tiempo transcurrido desde `due_at` dividido en días de 24 horas y **redondeado hacia arriba**. Un milisegundo tarde ya es 1 día; 24 horas exactas son 1 día; 24 horas y un milisegundo son 2 días.
1.3. **Valor por día:** 1.000 pesos (decisión de la persona), igual para todos los roles (decisión de la persona).
1.4. **Tope** (decisión de la persona): se cobran como máximo 30 días. La multa de un préstamo nunca supera 30.000 pesos.
1.5. **Multa** = días de retraso (como máximo 30) × 1.000. Es siempre un número entero de pesos, sin decimales.
1.6. El cálculo es una función pura: no guarda nada y no cambia el préstamo.

### 2. Dónde se ve
2.1. La respuesta de la devolución (`POST /api/loans/return`, F6) añade dos campos:
- `days_late`: los días de retraso reales de la regla 1.2 (puede ser mayor que 30);
- `fine_amount`: la multa de la regla 1.5, en pesos.

2.2. A tiempo: `days_late: 0` y `fine_amount: 0`. `returned_late` (F6) sigue igual y vale `true` exactamente cuando `days_late` es mayor que 0.
2.3. Este cambio modifica el contrato de F6: su respuesta pasa de dos campos a cuatro. Nada más de F6 cambia.
2.4. La multa **solo se informa**. No se guarda, no se cobra y no impide nada: registrarla y saldarla es F26.

## Entradas y salidas
El cálculo recibe un préstamo y el momento actual, y devuelve `{ days_late, fine_amount }`.

Respuesta de `POST /api/loans/return` después de esta feature (**200**):
```json
{
  "loan": {
    "id": "loan123",
    "book_id": "abc123",
    "borrower_uid": "uid-ana",
    "lent_by_uid": "uid-bibliotecario",
    "loaned_at": "2026-11-15T15:00:00.000Z",
    "due_at": "2026-11-29T15:00:00.000Z",
    "returned_at": "2026-12-02T10:00:00.000Z"
  },
  "returned_late": true,
  "days_late": 3,
  "fine_amount": 3000
}
```

| Salida | Tipo / restricción |
| --- | --- |
| `days_late` | Entero, 0 o más |
| `fine_amount` | Entero de pesos, de 0 a 30000 |

Errores: los mismos de F6. El cálculo no añade errores.

## Autorización
La misma de F6 (solo `BIBLIOTECARIO` y `ADMINISTRADOR` registran devoluciones y ven la multa). El cálculo no tiene ruta propia.

## Criterios de aceptación
- **Dado** un préstamo que vence el 2026-11-29 a las 15:00 UTC, **cuando** se devuelve el 2026-11-20, **entonces** `days_late` es 0, `fine_amount` es 0 y `returned_late` es `false`.
- **Dado** el mismo préstamo, **cuando** se devuelve el 2026-12-02 a las 10:00 UTC (2 días y 19 horas tarde), **entonces** `days_late` es 3, `fine_amount` es 3000 y `returned_late` es `true`.
- **Dado** el mismo préstamo, **cuando** se devuelve exactamente a la hora de vencimiento, **entonces** `days_late` es 0 y `fine_amount` es 0.
- **Dado** el mismo préstamo, **cuando** se devuelve un milisegundo después del vencimiento, **entonces** `days_late` es 1 y `fine_amount` es 1000.
- **Dado** el mismo préstamo, **cuando** se devuelve exactamente 24 horas tarde, **entonces** `days_late` es 1; **cuando** se devuelve 24 horas y un milisegundo tarde, **entonces** es 2 y la multa 2000.
- **Dado** un préstamo devuelto exactamente 30 días tarde, **entonces** `days_late` es 30 y `fine_amount` es 30000.
- **Dado** un préstamo devuelto 45 días tarde, **entonces** `days_late` es 45 y `fine_amount` es 30000 (tope).
- **Dado** un préstamo activo vencido hace 2 días y medio, **cuando** se calcula su multa ahora, **entonces** `days_late` es 3 y `fine_amount` es 3000.
- **Dado** un préstamo activo que aún no vence, **cuando** se calcula, **entonces** ambos son 0.
- **Dado** un préstamo ya devuelto a tiempo, **cuando** se calcula su multa meses después, **entonces** ambos son 0 (el corte es `returned_at`, no el momento actual).
- **Dado** préstamos iguales de un `EXTERNO`, un `ESTUDIANTE` y un `DOCENTE` devueltos 2 días tarde, **entonces** los tres tienen `fine_amount` 2000.

## Bordes
- 30 días y un milisegundo tarde → `days_late` 31, `fine_amount` 30000.
- Un año tarde → `fine_amount` 30000.
- Préstamo devuelto tarde y consultado después → la multa no sigue creciendo: se calcula con `returned_at`.
- `fine_amount` siempre es múltiplo de 1000.

## Fuera de alcance
- Guardar la multa, cobrarla, saldarla o perdonarla (F26).
- Bloquear préstamos por multas pendientes (F26).
- Listar vencidos con su multa (F8) y mostrarla en pantallas (F34, F35).
- Días hábiles, festivos o zonas horarias: se cuentan días de 24 horas.

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Cuánto por día? → **1.000 pesos.**
2. ¿Igual para todos los roles? → **Sí, igual para todos.**
3. ¿Cómo se cuentan los días? → **Cada día empezado cuenta.**
4. ¿Hay tope? → **Sí, máximo 30 días (30.000 pesos).**
