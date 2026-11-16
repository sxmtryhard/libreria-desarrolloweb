## Entrega: orquestador · F33 Barra de navegación con sesión y las pantallas base
**Hecho:**
- Cabecera en todas las pantallas: nombre de la biblioteca, enlaces «Inicio» y «Catálogo» (con la pantalla actual marcada), sesión («Ingresar» o «correo · Rol» + «Cerrar sesión») y botón «Menú» que pliega todo por debajo de 1024 px.
- Pie de página con el enlace «Acerca del proyecto».
- Inicio nuevo (bienvenida), `/catalogo` (búsqueda pública con la regla de F2), `/acerca` (el texto que estaba en el inicio) y la página «no encontrada».
- Se quitó el bloque de sesión que F4 puso en el inicio (regla 3.2).
- 19 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/layout.tsx`, `app/page.tsx`, `app/not-found.tsx`, `app/catalogo/page.tsx`, `app/acerca/page.tsx`
- `app/shared/ui/navigation.ts`, `app/shared/ui/site-header.tsx`
- `app/features/accounts/ui/`: `session-status.tsx` y `role-labels.ts` (nuevos), `sign-out-button.tsx`; se borró `session-block.tsx`
- `app/features/catalog/ui/`: `catalog-view.ts`, `catalog-search.tsx`
- Pruebas: `app/shared/tests/navigation.test.ts`, `app/features/catalog/tests/catalog-view.test.ts`, `app/features/accounts/tests/session-status.test.ts`

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 478 pruebas pasan; `npm run build` → compila con `/`, `/acerca`, `/catalogo`, `/ingresar` y la página de no encontrada. Con `npm run dev`: abrir `http://localhost:3000`.

Probado en el navegador contra Firebase real (2026-11-16), con una cuenta desechable ya borrada:
- **360 px:** enlaces ocultos tras «Menú»; al pulsarlo aparecen «Inicio», «Catálogo» e «Ingresar» y `aria-expanded` pasa a `true`; al pulsarlo otra vez se ocultan. Con sesión el menú muestra «correo · Docente» y «Cerrar sesión».
- **768 px:** igual con «Menú»; el catálogo usa 2 columnas.
- **1024 px:** enlaces y sesión visibles sin botón «Menú»; el catálogo usa 3 columnas.
- Sin desplazamiento horizontal en los tres anchos.
- Catálogo: sin texto → 2 libros; buscar «PRUEBA» → la URL queda en `/catalogo?q=PRUEBA`, «2 libros» y el campo conserva el texto; «zzzz» → «No se encontraron libros.»; 101 caracteres → el aviso y ninguna lista. «Catálogo» sale marcado como pantalla actual.
- `/no-existe` → «Página no encontrada» con cabecera y pie (HTTP 404). `/acerca` → título «Acerca del proyecto» y las seis secciones de antes.
- Ingresar → la cabecera muestra «correo · Docente»; «Cerrar sesión» desde la cabecera → termina en `/ingresar` y la cabecera vuelve a «Ingresar».

**Decisiones:**
- La cabecera es un componente de cliente en `app/shared/ui` (necesita el estado del menú y la ruta actual); el bloque de sesión se resuelve en el servidor dentro de `<Suspense>` y se le pasa ya renderizado, así `shared` no importa features.
- La pantalla de catálogo llama al servicio de F2 directamente (página → servicio), no a la ruta HTTP; el formulario envía por `GET` y funciona sin JavaScript.
- `app/catalogo/page.tsx` llama a `connection()` antes de consultar: sin eso el servidor de desarrollo marcaba un error de Cache Components por los valores aleatorios que usa Firestore.
- El aviso de error de «Cerrar sesión» lleva fondo claro para mantener el contraste sobre la cabecera oscura.
- Texto propio no pedido en la spec: «Busca libros por título o por autor.» (bajo el título del catálogo), los rótulos «Resultados» y «Ejemplares», y «Cargando el catálogo…» / «Comprobando la sesión…» mientras carga.
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó la nota «Se muestran los primeros 50…» en real (solo hay 2 libros); está en las pruebas automáticas.
- No se hizo una revisión con lector de pantalla ni de contraste medido; se usaron solo los pares de la paleta permitidos.
- El primer ingreso tras arrancar el servidor de desarrollo tardó más de 4 segundos (compilación de la ruta); el segundo fue inmediato.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/catalogo/page.tsx` | El texto de `q` se muestra de vuelta en el campo; React lo escapa y se limita a 100 caracteres antes de buscar | `/catalogo?q=<script>` | — |
| Info | `app/layout.tsx` (`HeaderSession`) | La cabecera verifica la sesión en cada página (lectura de Firebase y Firestore) | Abrir cualquier pantalla | Aceptado; valorar caché corta si pesa |

Sin hallazgos: no hay rutas de API nuevas ni escrituras; las pantallas son públicas y solo muestran datos que ya eran públicos (F2); la cabecera no expone nada más que el correo y el rol de la propia sesión; los destinos de los enlaces son fijos. **Aprobado con observaciones.**
