## Entrega: orquestador · F35 Pantallas «Mis préstamos» y «Mis vencidos»
**Hecho:**
- Pantalla `/mis-prestamos`: préstamos activos de la persona de la sesión, el que vence antes primero, con libro, fechas y estado («Vencido», «Vence hoy», «Vence en N días»), el conteo y el aviso con enlace si hay vencidos.
- Pantalla `/mis-vencidos`: la lista de F8 para la propia persona, con días de retraso, multa y total.
- Acceso en las dos: sin sesión redirige a `/ingresar`; el personal ve el aviso y «Ir a Préstamos»; el prestatario ve lo suyo.
- Enlaces «Mis préstamos» y «Mis vencidos» en la barra, solo para prestatarios.
- 33 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/mis-prestamos/page.tsx`, `app/mis-vencidos/page.tsx`
- `app/features/loans/schema.ts` (se añadió `MyLoanSchema` y `MyLoansResponseSchema`)
- `app/features/loans/server/my-loans-service.ts`
- `app/features/loans/ui/`: `my-loans-view.ts`, `my-loans-list.tsx`
- `app/shared/ui/navigation.ts` (`BORROWER_NAV_LINKS`), `app/shared/ui/site-header.tsx`
- `app/features/container.ts` (`myLoansService`; `currentTime` ahora se exporta para las páginas)
- Pruebas: `app/features/loans/tests/my-loans.test.ts`, `app/shared/tests/navigation-borrower.test.ts`, `app/shared/tests/navigation-staff.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 551 pruebas pasan; `npm run build` → compila con `/mis-prestamos` y `/mis-vencidos`. Con `npm run dev`: ingresar como estudiante y abrir «Mis préstamos».

Probado en el navegador contra Firebase real (2026-11-16) con datos desechables ya borrados (una estudiante con un préstamo que vence en 3 días y medio y otro vencido hace 2 días y medio; un docente con otro préstamo; un bibliotecario):
- Sin sesión → `/mis-prestamos` termina en `/ingresar`.
- Estudiante → la barra muestra «Inicio», «Catálogo», «Mis préstamos» y «Mis vencidos» (sin «Préstamos»).
- `/mis-prestamos` → «Tienes 2 libros prestados.», el aviso «Tienes préstamos vencidos.» con «Ver mis vencidos», primero el vencido («Estado: Vencido») y luego el otro («Estado: Vence en 3 días»), con fechas en hora de Colombia. No aparece el préstamo del docente.
- `/mis-vencidos` → el libro vencido, «3 días de retraso», «Multa: 3.000 pesos», «Total de multas: 3.000 pesos» y «Devuelve los libros en el mostrador de la biblioteca.».
- Bibliotecario → en las dos pantallas «Esta pantalla es para quienes piden libros prestados.» y «Ir a Préstamos», sin listas; su barra no muestra los enlaces de prestatario.
- Sin desplazamiento horizontal a 360, 768 y 1024 px.

**Decisiones:**
- Sin rutas de API nuevas: las páginas llaman a los servicios en el servidor (`myLoansService` y el `overdueService` de F8) con la sesión.
- Servicio aparte (`createMyLoansService`), como en F8, para no tocar las dependencias de los servicios existentes.
- Se cambió una prueba de F34: «un prestatario no ve Préstamos» comprobaba que su lista de enlaces por rol estaba vacía; ahora comprueba que no contiene `/prestamos`, porque la regla 1.5 de F35 les da enlaces propios. No se cambió para hacer pasar código.
- Las fechas usan la zona `America/Bogota` (regla 4.1), fija en `my-loans-view.ts`.
- Los enlaces de la barra ya no se parten en dos líneas (`whitespace-nowrap`): con cuatro enlaces «Mis préstamos» se cortaba.
- Texto propio no pedido en la spec: las frases bajo cada título, y los prefijos «Estado:» y «Aviso:».
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real: «Vence hoy», «Vence en 1 día», lista vacía, 1 día de retraso en singular ni un libro retirado. Están en las pruebas automáticas.
- Con sesión de prestatario y un correo largo, a 1024 px la cabecera ocupa dos líneas; no hay desplazamiento horizontal.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/features/loans/server/my-loans-service.ts` (`listActive`) | La persona sale solo de `session.uid`; no se recibe ningún identificador del cliente | — | — |
| Info | `app/mis-vencidos/page.tsx` | Reutiliza el servicio de F8 sin correo, que para un prestatario lista siempre lo propio | — | — |

Sin hallazgos: no hay rutas ni escrituras nuevas; sin sesión no se muestra nada; un prestatario no puede ver los préstamos de otro (comprobado en real con dos cuentas); el personal no ve listas en estas pantallas. **Aprobado.**
