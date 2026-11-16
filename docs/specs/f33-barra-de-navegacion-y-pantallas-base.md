# F33 · Barra de navegación con sesión y las pantallas base

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Todos (con o sin sesión)
- **Contrato afectado:** ninguno (no cambia ningún `schema.ts`; usa la búsqueda de F2 y la sesión de F0/F4)

## Objetivo
Que todas las pantallas compartan una cabecera con navegación y con el estado de la sesión, y que existan las pantallas base: inicio, catálogo y «no encontrada».

## Reglas de negocio

### 1. Cabecera y barra de navegación (en todas las pantallas)
1.1. La cabecera muestra el nombre «Biblioteca de préstamos», que enlaza al inicio (`/`).
1.2. La barra de navegación tiene estos enlaces, iguales para todos los roles y también sin sesión: **Inicio** (`/`) y **Catálogo** (`/catalogo`).
1.3. La barra solo enlaza a pantallas que existen (decisión de la persona). Los enlaces de préstamos (F34) y de «Mis préstamos» (F35) los añadirán esas features.
1.4. El enlace de la pantalla en la que se está se marca como actual (`aria-current="page"`) y se distingue a la vista sin depender solo del color.
1.5. **Sin sesión**, la cabecera muestra el enlace «Ingresar» (`/ingresar`).
1.6. **Con sesión**, la cabecera muestra el correo y el rol en español, separados por un punto medio, por ejemplo «ana@correo.test · Estudiante» (decisión de la persona), y el botón «Cerrar sesión» de F4.
1.7. En pantallas angostas (menos de 1024 px) los enlaces y la sesión se pliegan detrás de un botón «Menú», que los muestra y oculta. Desde 1024 px se ven siempre, en horizontal, y el botón «Menú» no aparece.
1.8. El botón «Menú» indica su estado (`aria-expanded`) y se usa con teclado.
1.9. Lo primero que recibe el foco en cada pantalla sigue siendo «Saltar al contenido».

### 2. Pie de página (en todas las pantallas)
2.1. Muestra «Biblioteca de préstamos · Proyecto del curso de Tendencias» y el enlace «Acerca del proyecto» (`/acerca`).

### 3. Inicio (`/`)
3.1. Pasa a ser una bienvenida de la biblioteca: el título «Biblioteca de préstamos», el texto «Busca libros en el catálogo y lleva el control de tus préstamos.» y el enlace destacado «Buscar en el catálogo» (`/catalogo`).
3.2. El bloque de sesión que F4 puso en el inicio (regla 5.1 de F4) se quita: la sesión ahora se ve en la cabecera. Esto modifica F4.
3.3. El texto actual del inicio (el curso, los agentes, las reglas) se mueve tal cual a `/acerca`, con el título «Acerca del proyecto» (decisión de la persona).

### 4. Catálogo (`/catalogo`)
4.1. Es público: se ve sin sesión.
4.2. Tiene un formulario de búsqueda con el campo «Título o autor» y el botón «Buscar». Al buscar, el texto queda en la URL (`/catalogo?q=…`), así que la búsqueda se puede compartir y funciona al recargar.
4.3. Los resultados son exactamente los de F2 (misma coincidencia, mismo orden, máximo 50). Sin texto se muestran todos los libros (hasta 50).
4.4. Cada libro muestra: título, autor, ISBN y «N de M disponibles» (`available_copies` de `total_copies`).
4.5. Encima de la lista se indica cuántos libros hay: «1 libro» o «N libros».
4.6. Si no hay resultados: «No se encontraron libros.».
4.7. Si salen 50 libros, se añade: «Se muestran los primeros 50. Escribe algo más específico.».
4.8. Si el texto tiene más de 100 caracteres (límite de F2), no se busca y se muestra «La búsqueda no puede tener más de 100 caracteres.».
4.9. El campo conserva el texto buscado.

### 5. No encontrada
5.1. Cualquier dirección que no existe muestra, con la cabecera y el pie: el título «Página no encontrada», el texto «La dirección que abriste no existe.» y el enlace «Volver al inicio».

### 6. Reglas de interfaz
6.1. Todas las pantallas cumplen `docs/frontend-rules.md`: una sola columna a 360 px, sin desplazamiento horizontal a 360, 768 y 1024 px, HTML semántico, paleta azul y blanco, foco visible, objetivos táctiles de 44 px y un solo `h1` por pantalla.

## Entradas y salidas
| Entrada | Tipo / restricción |
| --- | --- |
| `q` (URL de `/catalogo`) | Texto opcional; se recorta; máximo 100 caracteres (regla 4.8) |
| Cookie `session` | La de F0; decide qué muestra la cabecera |

Salida: páginas HTML. No hay rutas de API nuevas.

## Autorización
Todas las pantallas de esta feature son públicas. La cabecera lee la sesión solo para mostrarla; con una cookie inválida o vencida se comporta como sin sesión.

## Criterios de aceptación
- **Dado** nadie con sesión, **cuando** abre `/`, **entonces** ve la cabecera con «Inicio», «Catálogo» e «Ingresar», la bienvenida y el pie con «Acerca del proyecto».
- **Dado** Ana (`ESTUDIANTE`) con sesión, **cuando** abre cualquier pantalla, **entonces** la cabecera muestra «ana@correo.test · Estudiante» y «Cerrar sesión», y no muestra «Ingresar».
- **Dado** Ana con sesión, **cuando** pulsa «Cerrar sesión», **entonces** termina en `/ingresar` y la cabecera muestra «Ingresar».
- **Dado** alguien en `/catalogo`, **cuando** mira la barra, **entonces** «Catálogo» está marcado como la pantalla actual e «Inicio» no.
- **Dado** una pantalla de 360 px, **cuando** se abre, **entonces** los enlaces están ocultos tras «Menú»; **cuando** se pulsa «Menú», **entonces** aparecen; **cuando** se pulsa otra vez, **entonces** se ocultan.
- **Dado** una pantalla de 1024 px, **cuando** se abre, **entonces** los enlaces se ven sin pulsar nada y no hay botón «Menú».
- **Dado** un catálogo con «Rayuela» de Julio Cortázar, **cuando** se busca «cortazar» en `/catalogo`, **entonces** la URL es `/catalogo?q=cortazar`, sale «Rayuela» con su autor, ISBN y disponibles, y el campo conserva «cortazar».
- **Dado** el catálogo, **cuando** se busca «zzzz», **entonces** se ve «No se encontraron libros.».
- **Dado** `/catalogo` sin texto, **cuando** se abre, **entonces** salen todos los libros (hasta 50) ordenados por título.
- **Dado** un texto de 101 caracteres en la URL, **cuando** se abre `/catalogo`, **entonces** se ve «La búsqueda no puede tener más de 100 caracteres.» y no hay lista.
- **Dado** la dirección `/no-existe`, **cuando** se abre, **entonces** se ve «Página no encontrada» con la cabecera, el pie y «Volver al inicio».
- **Dado** `/acerca`, **cuando** se abre, **entonces** se ve el texto que antes estaba en el inicio, con el título «Acerca del proyecto».

## Bordes
- Cookie de sesión vencida → la cabecera muestra «Ingresar».
- Un libro con 0 disponibles → «0 de N disponibles».
- Exactamente 1 resultado → «1 libro».
- `q` de solo espacios → se trata como búsqueda vacía.
- Título o autor muy largo (200 caracteres) → se parte en varias líneas, sin desplazamiento horizontal.
- `/ingresar` también lleva la cabecera y el pie.

## Fuera de alcance
- Pantalla de préstamos y devoluciones (F34) y «Mis préstamos» / «Mis vencidos» (F35), y sus enlaces en la barra.
- Formularios para registrar libros y cuentas (F36).
- Paginación (F21) y filtros por categoría y año (F20).
- Detalle de un libro, portadas, modo oscuro.

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Qué pantallas base? → **Inicio + Catálogo + No encontrada.**
2. ¿Y el texto actual del inicio? → **Se mueve a «Acerca del proyecto».**
3. ¿Enlaces a pantallas que no existen? → **No; se añaden cuando existan.**
4. ¿Cómo se identifica a la persona? → **Correo y rol.**
