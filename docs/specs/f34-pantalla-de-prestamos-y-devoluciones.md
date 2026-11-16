# F34 · Pantalla de préstamos y devoluciones

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`)
- **Contrato afectado:** ninguno (no cambia ningún `schema.ts`; usa las rutas de F2, F5, F6 y F8 tal como están)

## Objetivo
Que el personal pueda, desde una sola pantalla del mostrador, prestar un libro a una persona, registrar su devolución y ver los vencidos de esa persona, sin escribir identificadores.

## Reglas de negocio

### 1. Acceso
1.1. La pantalla está en `/prestamos`.
1.2. Sin sesión → se redirige a `/ingresar`.
1.3. Con sesión de `EXTERNO`, `ESTUDIANTE` o `DOCENTE` → se ve el título y el aviso «No tienes permiso para ver esta pantalla.», sin formularios (decisión de la persona).
1.4. Con sesión de `BIBLIOTECARIO` o `ADMINISTRADOR` → se ve la pantalla completa.
1.5. La barra de navegación muestra el enlace **Préstamos** (`/prestamos`) solo al personal. Sin sesión o con otro rol no aparece.
1.6. La pantalla no da ningún permiso por sí misma: las rutas de F5, F6 y F8 siguen comprobando sesión y rol en el servidor.

### 2. Persona
2.1. Hay un campo «Correo de la persona». Se usa para prestar, para devolver y para ver sus vencidos.
2.2. El botón «Ver vencidos» consulta los vencidos de ese correo (F8) y muestra, por cada uno: título del libro, fecha de vencimiento, días de retraso y multa; y debajo el total de multas (decisión de la persona).
2.3. Si no tiene vencidos: «No tiene préstamos vencidos.».
2.4. Si se pulsa «Ver vencidos» sin correo: «Escribe el correo de la persona.».

### 3. Libro
3.1. El libro se elige buscándolo (decisión de la persona): un campo «Título o autor» y el botón «Buscar libro», que usa la búsqueda de F2.
3.2. Los resultados se muestran como una lista para elegir uno solo; cada opción dice título, autor y «N de M disponibles».
3.3. Sin resultados: «No se encontraron libros.».
3.4. El libro elegido se muestra aparte: «Libro elegido: <título>, de <autor>».
3.5. Hacer otra búsqueda quita el libro elegido.

### 4. Prestar y devolver (decisión de la persona: una pantalla, dos acciones)
4.1. Hay dos botones: «Prestar» y «Registrar devolución». Los dos usan el correo de la regla 2 y el libro elegido de la regla 3.
4.2. Si falta el correo o no hay libro elegido, no se llama al servidor y se muestra «Escribe el correo de la persona y elige un libro.».
4.3. **Prestar** llama a F5. Si sale bien: «Préstamo registrado. Vence el <fecha>.».
4.4. **Registrar devolución** llama a F6. Si sale bien y fue a tiempo: «Devolución registrada a tiempo.». Si fue tarde: «Devolución registrada con <N> días de retraso. Multa: <M> pesos.» (con «1 día» en singular).
4.5. Si el servidor rechaza la acción con 404 o 409, se muestra **el mensaje del servidor** tal cual (por ejemplo «La persona ya alcanzó su límite de préstamos.»).
4.6. Otros fallos: 400 → «Revisa el correo de la persona.»; 401 → «Tu sesión terminó. Vuelve a ingresar.»; 403 → «No tienes permiso para hacer esto.»; cualquier otro → «No se pudo completar la operación. Intenta de nuevo.».
4.7. Mientras se procesa una acción, los dos botones quedan deshabilitados.
4.8. Después de una acción que sale bien: se repite la búsqueda de libros (para ver los disponibles actualizados), se quita el libro elegido y se borra la lista de vencidos mostrada. El correo se conserva, para seguir atendiendo a la misma persona.
4.9. Los avisos de éxito usan `role="status"` y los de error `role="alert"`.

### 5. Formato
5.1. Las fechas se muestran en español, con día, mes y año y la hora, en la zona horaria del navegador (por ejemplo «29 de noviembre de 2026, 10:00»).
5.2. Las multas se muestran en pesos con separador de miles: «3.000 pesos».
5.3. La pantalla cumple `docs/frontend-rules.md` (360, 768 y 1024 px sin desplazamiento horizontal, HTML semántico, paleta, foco visible, 44 px).

## Entradas y salidas
| Entrada | Tipo / restricción |
| --- | --- |
| Correo de la persona | Texto; se recorta; el servidor valida su forma |
| Título o autor | Texto; las reglas de F2 (máximo 100 caracteres) |
| Libro elegido | Uno de los resultados de la búsqueda |

Salida: una página HTML. Llama a `GET /api/books`, `POST /api/loans`, `POST /api/loans/return` y `GET /api/loans/overdue`.

## Autorización
Solo el personal usa la pantalla (regla 1). La autorización real es la de las rutas de F5, F6 y F8.

## Criterios de aceptación
- **Dado** nadie con sesión, **cuando** abre `/prestamos`, **entonces** termina en `/ingresar`.
- **Dado** un `ESTUDIANTE` con sesión, **cuando** abre `/prestamos`, **entonces** ve «No tienes permiso para ver esta pantalla.» y ningún formulario, y la barra no le muestra «Préstamos».
- **Dado** un `BIBLIOTECARIO`, **cuando** mira la barra, **entonces** ve «Inicio», «Catálogo» y «Préstamos».
- **Dado** un `BIBLIOTECARIO` en `/prestamos`, **cuando** busca «rayuela», elige el libro, escribe el correo de un estudiante y pulsa «Prestar», **entonces** ve «Préstamo registrado. Vence el …» con la fecha de 14 días después, y la lista muestra un disponible menos.
- **Dado** que esa persona ya tiene ese libro, **cuando** se pulsa «Prestar» otra vez, **entonces** se ve «La persona ya tiene prestado este libro.».
- **Dado** el préstamo anterior, **cuando** se elige el libro y se pulsa «Registrar devolución», **entonces** se ve «Devolución registrada a tiempo.» y el libro recupera el disponible.
- **Dado** un préstamo vencido hace 2 días y medio, **cuando** se registra su devolución, **entonces** se ve «Devolución registrada con 3 días de retraso. Multa: 3.000 pesos.».
- **Dado** una persona con dos vencidos, **cuando** se pulsa «Ver vencidos», **entonces** salen los dos con título, vencimiento, días y multa, y el total.
- **Dado** una persona sin vencidos, **cuando** se pulsa «Ver vencidos», **entonces** se ve «No tiene préstamos vencidos.».
- **Dado** un correo sin cuenta, **cuando** se pulsa «Prestar» o «Ver vencidos», **entonces** se ve «No existe una cuenta con ese correo.».
- **Dado** que no se eligió libro, **cuando** se pulsa «Prestar», **entonces** se ve «Escribe el correo de la persona y elige un libro.» y no se llama al servidor.

## Bordes
- Devolución con 1 día de retraso → «…con 1 día de retraso. Multa: 1.000 pesos.».
- Multa en el tope → «Multa: 30.000 pesos.».
- Correo mal escrito (sin forma de correo) → «Revisa el correo de la persona.».
- La sesión vence mientras la pantalla está abierta → «Tu sesión terminó. Vuelve a ingresar.».
- Libro con 0 disponibles → se puede elegir (hace falta para devolver); al prestar, el servidor responde «No hay ejemplares disponibles de este libro.».
- Vencido de un libro que ya no existe (título `null`) → se muestra «Libro retirado».
- Sin conexión → «No se pudo completar la operación. Intenta de nuevo.».

## Fuera de alcance
- «Mis préstamos» y «Mis vencidos» del prestatario (F35).
- Formularios para registrar libros y cuentas (F36).
- Listar todos los préstamos activos de una persona o de la biblioteca (F23).
- Cobrar o saldar multas (F26), renovar (F24).
- Buscar a la persona por nombre; leer códigos de barras.

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Cómo se elige el libro? → **Buscándolo por título o autor.**
2. ¿Cómo se organizan prestar y devolver? → **Una pantalla con las dos acciones.**
3. ¿Muestra los vencidos de la persona? → **Sí, con un botón «Ver vencidos».**
4. ¿Qué ve quien no es del personal? → **Un aviso de que no tiene permiso; sin sesión va a `/ingresar`.**
