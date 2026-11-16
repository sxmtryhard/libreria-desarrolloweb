## Entrega: orquestador · F34 Pantalla de préstamos y devoluciones
**Hecho:**
- Pantalla `/prestamos` con tres bloques: persona (correo y «Ver vencidos»), libro (búsqueda y elección) y acción («Prestar» y «Registrar devolución»).
- Acceso: sin sesión redirige a `/ingresar`; con sesión sin ser personal muestra el aviso; el personal ve el mostrador.
- Enlace «Préstamos» en la barra, solo para `BIBLIOTECARIO` y `ADMINISTRADOR`.
- 40 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/prestamos/page.tsx`
- `app/features/loans/ui/`: `loan-desk.tsx`, `desk-api.ts`, `desk-messages.ts`
- `app/shared/ui/navigation.ts` (`STAFF_NAV_LINKS`, `roleLinksFor`), `app/shared/ui/site-header.tsx` (`NavItem`, ranura `roleLinks`), `app/layout.tsx`
- `app/features/container.ts` (`currentSession` envuelta en `cache` de React)
- Pruebas: `app/features/loans/tests/desk-messages.test.ts`, `app/shared/tests/navigation-staff.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 518 pruebas pasan; `npm run build` → compila con `/prestamos`. Con `npm run dev`: ingresar como bibliotecario y abrir «Préstamos».

Probado en el navegador contra Firebase real (2026-11-16) con datos desechables ya borrados (un bibliotecario, una estudiante con un préstamo vencido hace 2 días y medio, y 2 libros):
- Sin sesión → `/prestamos` termina en `/ingresar`.
- Estudiante → aviso «No tienes permiso para ver esta pantalla.», ningún formulario y la barra sin «Préstamos».
- Bibliotecario → la barra muestra «Inicio», «Catálogo» y «Préstamos» (marcado como actual en la pantalla).
- «Prestar» sin datos → «Escribe el correo de la persona y elige un libro.».
- «Ver vencidos» → el libro vencido con su fecha, «3 días de retraso · Multa: 3.000 pesos» y «Total de multas: 3.000 pesos».
- Buscar «zeta f34» → 2 libros con sus disponibles; al elegir uno aparece «Libro elegido: …».
- Prestar con un vencido pendiente → «La persona tiene préstamos vencidos.» (mensaje del servidor).
- Registrar la devolución del vencido → «Devolución registrada con 3 días de retraso. Multa: 3.000 pesos.»; la lista se actualizó (1 → 2 disponibles), se quitó el libro elegido y el correo se conservó.
- Prestar → «Préstamo registrado. Vence el 30 de noviembre de 2026, 7:59.» y un disponible menos; prestar otra vez → «La persona ya tiene prestado este libro.».
- Registrar devolución → «Devolución registrada a tiempo.»; «Ver vencidos» → «No tiene préstamos vencidos.».
- Correo sin cuenta → «No existe una cuenta con ese correo.»; correo mal escrito → «Revisa el correo de la persona.».
- Sin desplazamiento horizontal a 360, 768 y 1024 px; botones de 44 px de alto.

**Decisiones:**
- La pantalla no cambia ninguna API: llama por `fetch` a las rutas de F2, F5, F6 y F8 y valida cada respuesta con Zod.
- Fecha y hora se formatean por separado y se unen con «, »: el navegador escribía «a las» y Node una coma; así el texto es el de la spec en los dos.
- Las multas se formatean a mano («3.000 pesos») para no depender de la configuración regional.
- Los enlaces por rol se resuelven en el servidor y se pasan a la cabecera por una ranura; `currentSession` usa `cache` de React para que cabecera, enlaces y página lean la sesión una sola vez por petición.
- El menú de la cabecera ahora recuerda en qué pantalla se abrió y queda cerrado al navegar.
- Texto propio no pedido en la spec: el título «Préstamos y devoluciones», la frase bajo el título, los rótulos «1. Persona», «2. Libro», «3. Prestar o devolver», «Elige un libro», «Total de multas», y los prefijos «Listo:» y «Error:» de los avisos.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real: sesión vencida con la pantalla abierta, sin conexión, «No hay ejemplares disponibles…», 1 día en singular ni un libro retirado en la lista de vencidos. Están en las pruebas automáticas.
- Con sesión, a 1024 px un correo largo hace que la cabecera ocupe dos líneas; no hay desplazamiento horizontal.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/prestamos/page.tsx` (`DeskGate`) | La pantalla oculta el mostrador a quien no es personal, pero eso es solo presentación: quien llame a las rutas directamente sigue recibiendo 401 o 403 del servidor | `POST /api/loans` como estudiante → 403 (F5) | — |
| Info | `app/features/loans/ui/desk-api.ts` | Los mensajes 404/409 del servidor se muestran tal cual; React los escapa y solo los ve el personal | Prestar a un correo sin cuenta | — |

Sin hallazgos: no hay rutas ni escrituras nuevas; la autorización sigue en el servidor; el enlace «Préstamos» y la pantalla no exponen datos a quien no es personal; el correo y el texto de búsqueda se codifican en la URL. **Aprobado con observaciones.**
