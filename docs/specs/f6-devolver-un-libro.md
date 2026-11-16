# F6 · Devolver un libro

- **Estado:** Aprobada (por la persona, 2026-11-15)
- **Rol(es):** Personal (`BIBLIOTECARIO`, `ADMINISTRADOR`)
- **Contrato afectado:** `app/features/loans/schema.ts` (se añade la entrada y la respuesta de la devolución)

## Objetivo
El personal registra en el mostrador que una persona devolvió el ejemplar que tenía prestado, y el ejemplar vuelve a estar disponible.

## Reglas de negocio

### 1. Qué se devuelve
1.1. Solo el personal (`BIBLIOTECARIO`, `ADMINISTRADOR`) registra devoluciones (decisión de la persona).
1.2. El personal indica el libro por su identificador (`book_id`) y a la persona por su correo (`borrower_email`), igual que al prestar (decisión de la persona). Como F5 solo permite un préstamo activo por libro y persona, eso identifica un único préstamo.
1.3. El correo se compara sin espacios en los extremos y en minúsculas.
1.4. Si no existe una cuenta con ese correo → 404 «No existe una cuenta con ese correo.».
1.5. Si no existe el libro → 404 «No existe ese libro.».
1.6. Si la persona no tiene un préstamo **activo** de ese libro (nunca lo tuvo, o ya lo devolvió) → 404 «La persona no tiene prestado este libro.» (decisión de la persona: es un error, no se responde bien en silencio).
1.7. Si se cumplen varias, se informa la primera en este orden: cuenta (1.4) → libro (1.5) → préstamo activo (1.6).

### 2. Qué pasa al devolver
2.1. El préstamo queda con `returned_at` igual al momento de la devolución (el tiempo se inyecta). Deja de estar activo.
2.2. `available_copies` del libro sube en 1. `total_copies` no cambia.
2.3. Los cambios de 2.1 y 2.2 son atómicos: dos devoluciones simultáneas del mismo préstamo no pueden salir bien las dos ni sumar dos ejemplares.
2.4. El resto del préstamo (`loaned_at`, `due_at`, `lent_by_uid`…) no cambia.

### 3. Devolución tardía
3.1. Una devolución es **tardía** si el momento de la devolución es posterior a `due_at`. En el instante exacto de `due_at` todavía es a tiempo (misma regla que el vencimiento de F5).
3.2. La devolución tardía **se acepta igual** (decisión de la persona). La respuesta lo avisa con `returned_late: true`; a tiempo es `false`.
3.3. Aquí no se calcula ni se cobra ninguna multa: eso es F7 y F26.
3.4. Después de devolver, ese préstamo ya no cuenta como vencido: la persona puede volver a recibir préstamos si no tiene otros vencidos (regla 3.1 de F5).

## Entradas y salidas
Ruta: `POST /api/loans/return` con cuerpo JSON.

| Entrada | Tipo / restricción |
| --- | --- |
| `book_id` | Texto, 1–128 caracteres tras recortar |
| `borrower_email` | Texto; tras recortar y pasar a minúsculas, con forma de correo y máximo 254 caracteres |

Salida exitosa: **200** con el préstamo ya devuelto y el aviso:
```json
{
  "loan": {
    "id": "loan123",
    "book_id": "abc123",
    "borrower_uid": "uid-ana",
    "lent_by_uid": "uid-bibliotecario",
    "loaned_at": "2026-11-15T15:00:00.000Z",
    "due_at": "2026-11-29T15:00:00.000Z",
    "returned_at": "2026-11-20T10:00:00.000Z"
  },
  "returned_late": false
}
```

Errores esperados (formato de F0): 400 `VALIDACION` (cuerpo inválido o no JSON, con `fields`); 401 `NO_AUTENTICADO`; 403 `NO_AUTORIZADO` (origen o rol); 404 `NO_ENCONTRADO` (reglas 1.4–1.6).

## Autorización
- **SÍ pueden:** `BIBLIOTECARIO` y `ADMINISTRADOR`.
- **NO pueden:** `EXTERNO`, `ESTUDIANTE` y `DOCENTE` → 403, tampoco para su propio préstamo.
- **Sin sesión:** 401.
- Orden: origen → sesión → rol → cuerpo. Quien no tiene permiso recibe 401 o 403 aunque el cuerpo sea inválido.

## Criterios de aceptación
- **Dado** un préstamo activo de Ana que vence el 2026-11-29 y un libro con 2 disponibles, **cuando** un `BIBLIOTECARIO` registra la devolución el 2026-11-20, **entonces** recibe 200 con `returned_at` igual a ese momento, `returned_late: false`, y el libro queda con 3 disponibles.
- **Dado** el mismo préstamo, **cuando** la devolución se registra el 2026-12-05, **entonces** recibe 200 con `returned_late: true` y el libro también recupera el ejemplar.
- **Dado** un `ADMINISTRADOR`, **cuando** registra una devolución válida, **entonces** recibe 200.
- **Dado** el propio prestatario con sesión, **cuando** llama a `POST /api/loans/return` por su préstamo, **entonces** recibe 403 y el préstamo sigue activo.
- **Dado** nadie con sesión, **cuando** se llama, **entonces** recibe 401.
- **Dado** un préstamo ya devuelto, **cuando** se intenta devolver otra vez, **entonces** recibe 404 «La persona no tiene prestado este libro.» y los disponibles no cambian.
- **Dado** una persona que nunca tuvo ese libro, **cuando** se registra la devolución, **entonces** recibe 404 «La persona no tiene prestado este libro.».
- **Dado** un correo sin cuenta, **cuando** se registra, **entonces** recibe 404 «No existe una cuenta con ese correo.».
- **Dado** un `book_id` que no existe, **cuando** se registra, **entonces** recibe 404 «No existe ese libro.».
- **Dado** dos devoluciones simultáneas del mismo préstamo, **cuando** se procesan, **entonces** una recibe 200, la otra 404 y los disponibles suben solo en 1.
- **Dado** un `EXTERNO` que devolvió su único préstamo, **cuando** se le presta otro libro (F5), **entonces** recibe 201.
- **Dado** una persona cuyo único préstamo vencido se devuelve, **cuando** se le presta otro libro, **entonces** recibe 201.

## Bordes
- Devolución en el instante exacto de `due_at` → `returned_late: false`; un milisegundo después → `true`.
- Ana tiene prestados dos libros distintos y devuelve uno → el otro sigue activo.
- Dos personas tienen prestado el mismo libro y una devuelve → solo cambia su préstamo; el de la otra sigue activo.
- La persona tuvo ese libro antes (ya devuelto) y lo tiene otra vez → se devuelve el préstamo activo; el antiguo no cambia.
- `borrower_email` con mayúsculas y espacios → se normaliza.
- `borrower_email` sin forma de correo, `book_id` vacío o de 129 caracteres, o falta alguno → 400 con `fields`.
- Correo de una cuenta del personal → 404 «La persona no tiene prestado este libro.» (nunca puede tener préstamos).
- Petición desde otro origen → 403 sin mirar sesión ni cuerpo.

## Fuera de alcance
- Calcular la multa (F7) y registrarla o saldarla (F26).
- Listar vencidos (F8), renovar (F24), pantalla de préstamos y devoluciones (F34).
- Guardar quién recibió la devolución o el estado del ejemplar (dañado, perdido).
- Devolver un libro retirado del catálogo (F19).

## Preguntas abiertas
Respondidas por la persona (2026-11-15):
1. ¿Cómo se indica el préstamo? → **Libro + correo de la persona.**
2. ¿Quién registra la devolución? → **Bibliotecario y Administrador.**
3. ¿Y si se devuelve tarde? → **Se acepta y se avisa que fue tarde.**
4. ¿Y si ya estaba devuelto o no existe? → **Error 404: no hay préstamo activo.**
