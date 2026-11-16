# F35 · Pantallas «Mis préstamos» y «Mis vencidos»

- **Estado:** Aprobada (por la persona, 2026-11-16)
- **Rol(es):** Prestatario (`EXTERNO`, `ESTUDIANTE`, `DOCENTE`)
- **Contrato afectado:** `app/features/loans/schema.ts` (se añade la lista de «mis préstamos»; no hay rutas de API nuevas)

## Objetivo
Que cada persona vea, con su sesión, qué libros tiene prestados ahora y cuáles tiene vencidos, con lo que debe hasta hoy.

## Reglas de negocio

### 1. Acceso (igual en las dos pantallas)
1.1. Las pantallas son `/mis-prestamos` y `/mis-vencidos` (decisión de la persona: dos pantallas).
1.2. Sin sesión → se redirige a `/ingresar`.
1.3. Con sesión de `EXTERNO`, `ESTUDIANTE` o `DOCENTE` → se ve el contenido de **esa** persona. La identidad sale de la sesión; no hay forma de ver los de otra.
1.4. Con sesión de `BIBLIOTECARIO` o `ADMINISTRADOR` → se ve el aviso «Esta pantalla es para quienes piden libros prestados.» y el enlace «Ir a Préstamos» (`/prestamos`), sin listas (decisión de la persona).
1.5. La barra de navegación muestra **Mis préstamos** y **Mis vencidos** solo a los prestatarios. El personal y quien no tiene sesión no los ven.

### 2. Mis préstamos (`/mis-prestamos`)
2.1. Muestra los préstamos **activos** de la persona: los que tiene sin devolver, vencidos o no (decisión de la persona: solo los actuales, sin historial).
2.2. Orden: el que vence antes, primero (por `due_at` de más antiguo a más reciente; a igual vencimiento, por identificador).
2.3. Cada préstamo muestra (decisión de la persona): título y autor del libro, «Prestado el <fecha>», «Vence el <fecha>» y un **estado**.
2.4. Estado, según el momento actual (el tiempo se inyecta):
- si ya pasó `due_at` → «Vencido»;
- si faltan menos de 24 horas → «Vence hoy»;
- si faltan 24 horas o más → «Vence en N días», donde N son los días completos de 24 horas que faltan («Vence en 1 día» en singular).

2.5. Encima de la lista: «Tienes 1 libro prestado.» o «Tienes N libros prestados.».
2.6. Sin préstamos: «No tienes libros prestados.».
2.7. Si alguno está vencido, se añade el aviso «Tienes préstamos vencidos.» con el enlace «Ver mis vencidos» (`/mis-vencidos`).
2.8. Si el libro ya no existe en el catálogo, el título se muestra como «Libro retirado» y no se muestra autor.

### 3. Mis vencidos (`/mis-vencidos`)
3.1. Muestra exactamente la lista de F8 para la propia persona: sus préstamos activos vencidos, el más atrasado primero.
3.2. Cada uno muestra: título y autor, «Venció el <fecha>», los días de retraso («1 día de retraso» / «N días de retraso») y «Multa: <M> pesos» (cálculo de F7).
3.3. Debajo: «Total de multas: <T> pesos» y el texto «Devuelve los libros en el mostrador de la biblioteca.».
3.4. Sin vencidos: «No tienes préstamos vencidos.».
3.5. La multa solo se informa (F7): aquí no se paga nada.

### 4. Formato
4.1. Las fechas se muestran en español, con día, mes, año y hora, en la **hora de Colombia** (`America/Bogota`), por ejemplo «29 de noviembre de 2026, 10:00».
4.2. Las multas se muestran como en F34: «3.000 pesos».
4.3. Las pantallas cumplen `docs/frontend-rules.md` (360, 768 y 1024 px sin desplazamiento horizontal, HTML semántico, paleta, foco visible, 44 px). El estado «Vencido» no se comunica solo con el color.

## Entradas y salidas
| Entrada | Tipo / restricción |
| --- | --- |
| Cookie `session` | La de F0; de ella sale de quién son los préstamos |

Las pantallas no reciben ningún otro dato. Salida: páginas HTML.

Lista de «mis préstamos» (contrato interno entre el servicio y la pantalla):
```json
{
  "loans": [
    {
      "loan_id": "loan123",
      "book_id": "abc123",
      "book_title": "Rayuela",
      "book_author": "Julio Cortázar",
      "loaned_at": "2026-11-15T15:00:00.000Z",
      "due_at": "2026-11-29T15:00:00.000Z",
      "overdue": false
    }
  ]
}
```

## Autorización
- Solo los prestatarios ven listas, y solo las suyas.
- El personal ve el aviso de la regla 1.4; sin sesión se va a `/ingresar`.
- No se envía ningún identificador de persona: no hay nada que manipular para ver los préstamos de otro.

## Criterios de aceptación
- **Dado** nadie con sesión, **cuando** abre `/mis-prestamos` o `/mis-vencidos`, **entonces** termina en `/ingresar`.
- **Dado** Ana (`ESTUDIANTE`) con dos préstamos activos, uno que vence en 3 días y medio y otro en 10 días, **cuando** abre `/mis-prestamos`, **entonces** ve «Tienes 2 libros prestados.», primero el de 3 días con «Vence en 3 días» y luego el otro con «Vence en 10 días».
- **Dado** Ana con un préstamo que vence en 5 horas, **cuando** abre `/mis-prestamos`, **entonces** su estado es «Vence hoy».
- **Dado** Ana con un préstamo vencido y otro al día, **cuando** abre `/mis-prestamos`, **entonces** el vencido sale primero con «Vencido» y se ve «Tienes préstamos vencidos.» con el enlace «Ver mis vencidos».
- **Dado** Ana sin préstamos, **cuando** abre `/mis-prestamos`, **entonces** ve «No tienes libros prestados.».
- **Dado** Ana con un préstamo ya devuelto, **cuando** abre `/mis-prestamos`, **entonces** ese préstamo no aparece.
- **Dado** Ana con un vencido de hace 2 días y medio de «Rayuela», **cuando** abre `/mis-vencidos`, **entonces** ve «Rayuela», «3 días de retraso», «Multa: 3.000 pesos» y «Total de multas: 3.000 pesos».
- **Dado** Ana sin vencidos, **cuando** abre `/mis-vencidos`, **entonces** ve «No tienes préstamos vencidos.».
- **Dado** Luis con sesión, **cuando** abre `/mis-prestamos`, **entonces** ve solo los suyos, nunca los de Ana.
- **Dado** un `BIBLIOTECARIO`, **cuando** abre `/mis-prestamos`, **entonces** ve «Esta pantalla es para quienes piden libros prestados.» y «Ir a Préstamos», y ninguna lista.
- **Dado** un `ESTUDIANTE`, **cuando** mira la barra, **entonces** ve «Inicio», «Catálogo», «Mis préstamos» y «Mis vencidos», y no ve «Préstamos».
- **Dado** un `BIBLIOTECARIO`, **cuando** mira la barra, **entonces** no ve «Mis préstamos» ni «Mis vencidos».

## Bordes
- Faltan exactamente 24 horas → «Vence en 1 día»; un milisegundo menos → «Vence hoy».
- Vence exactamente ahora → todavía no está vencido: «Vence hoy»; un milisegundo después → «Vencido».
- Un solo préstamo → «Tienes 1 libro prestado.».
- Vencido de 1 día → «1 día de retraso».
- Vencido de 45 días → «45 días de retraso» y «Multa: 30.000 pesos».
- Libro retirado → «Libro retirado», sin autor.
- Título o autor muy largos → se parten en varias líneas, sin desplazamiento horizontal.

## Fuera de alcance
- Historial de préstamos devueltos (F23).
- Renovar (F24), reservar (F25), pagar multas (F26).
- Avisos por correo de vencimiento.
- Que el personal vea los préstamos activos de una persona (hoy ve los vencidos en F34).

## Preguntas abiertas
Respondidas por la persona (2026-11-16):
1. ¿Qué muestra «Mis préstamos»? → **Solo los que tengo ahora.**
2. ¿Cómo se organizan? → **Dos pantallas, cada una con su enlace.**
3. ¿Qué muestra cada préstamo? → **Libro, fechas y estado.**
4. ¿Qué ve el personal? → **Un aviso de que son para prestatarios.**
