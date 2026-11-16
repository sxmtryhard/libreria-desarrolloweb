## Entrega: orquestador · F0 Base del proyecto
**Hecho:**
- Contrato común (roles, sesión, cuenta y forma del error) y errores de dominio con su traducción a HTTP.
- Validación de origen, lectura de cuerpo JSON, servicio de sesión (crear, verificar, cerrar, `requireRole`) con puertos.
- Validación del entorno con `npm run check:env`, clientes de Firebase (servidor y navegador) y `npm run seed`.
- 60 pruebas nuevas escritas desde la spec, antes del código; ninguna toca la red.

**Archivos:**
- `app/shared/schema.ts`
- `app/shared/server/`: `errors.ts`, `http.ts`, `session.ts`, `session.firebase.ts`, `env.ts`, `firebase-admin.ts`, `seed.ts`, `seed.firebase.ts`
- `app/shared/ui/firebase-client.ts`
- `app/shared/tests/`: `fakes.ts`, `errors-http.test.ts`, `session.test.ts`, `env.test.ts`, `seed.test.ts`
- `scripts/check-env.ts`, `scripts/seed.ts`, `package.json` (scripts `check:env` y `seed`), `.env.example` (`SEED_PASSWORD`)

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 145 pruebas pasan; `npm run build` → compila. `npm run check:env` → 7 líneas con `OK`/`FALTA`/`INVALIDA`.

**Decisiones:**
- La lógica (sesión, entorno, seed) no importa `server-only` ni Firebase: lo real vive en los archivos `*.firebase.ts` y `firebase-admin.ts`, así las pruebas usan puertos en memoria.
- La vigencia de 8 horas se comprueba dos veces: Firebase vence la cookie y el servicio compara `now` con la hora de emisión.
- Una cookie con error `auth/*` es «sin sesión» (401); un fallo de red o de configuración no se oculta (500).
- Todo se hizo en una sola sesión de Claude Code, sin delegar en los subagentes; la revisión de seguridad la hizo la misma sesión, no un agente independiente.

**Pendiente / bloqueos:**
- **De la persona:** crear el proyecto de Firebase y el `.env` (docs/empezar.md), ejecutar `npm run check:env` y `npm run seed`. Nada de lo que toca Firebase real se ha ejecutado todavía.
- `tests/project/guard.test.ts` falla en este equipo con `EPERM ... symlink`: Windows no permite symlinks sin el Modo de desarrollador. No es código de F0.
- El equipo usa Node 22 y el proyecto pide Node 24.x (ADR-0007).

**Dudas de la especificación:**
- Regla 2.2: detrás de un proxy que reescriba `Host` la comparación podría fallar; en Vercel `Host` es el dominio público. Sin comprobar en despliegue.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Baja | `app/shared/server/http.ts` (`errorToResponse`) | El registro del servidor imprime el error inesperado completo; si una librería incluyera un dato sensible en su mensaje quedaría en el log | sospecha, no reproducido | Revisar al añadir integraciones nuevas |
| Baja | `package.json` | `npm audit` informa 14 vulnerabilidades (1 baja, 13 moderadas) en dependencias que ya traía la plantilla | `npm audit` | Decisión del curso; F0 no añadió dependencias |
| Info | `app/shared/server/session.firebase.ts` | `iat` como hora de emisión de la cookie no se ha comprobado contra Firebase real | pendiente del `.env` | Probar al construir F4 |

Sin hallazgos en autorización, validación, secretos ni atributos de la cookie. **Aprobado con observaciones:** la base falla cerrada (sin sesión válida → 401) y no filtra detalles, pero falta probarla contra Firebase real.
