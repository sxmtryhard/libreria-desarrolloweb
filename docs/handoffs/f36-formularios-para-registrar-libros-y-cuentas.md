## Entrega: orquestador · F36 Formularios para registrar libros y cuentas
**Hecho:**
- Pantalla `/libros/nuevo` («Registrar libro»): título, autor, ISBN y ejemplares (empieza en 1). Revisa en el navegador título, autor, forma del ISBN y ejemplares enteros de 1 a 100; envía a `POST /api/books` (F1). Tras el éxito: «Libro registrado: <título> (<n> ejemplares).» y el formulario limpio.
- Pantalla `/cuentas/nueva` («Registrar cuenta»): nombre, correo, rol (Externo, Estudiante o Docente, sin elegir al abrir), contraseña inicial y repetirla. Revisa en el navegador y envía a `POST /api/accounts` (F3) sin la repetición. Tras el éxito: «Cuenta creada: <nombre> (<correo>) · <Rol>.» y el formulario limpio.
- Errores del servidor: 409 muestra su mensaje; 400, 401 y 403 tienen su texto; lo demás, «No se pudo registrar. Intenta de nuevo.».
- Acceso: sin sesión → `/ingresar`; prestatarios → «No tienes permiso para ver esta pantalla.» sin formulario.
- La barra del personal muestra «Préstamos», «Registrar libro» y «Registrar cuenta».
- No hay rutas de API nuevas ni cambios en F1 y F3.
- 42 pruebas nuevas escritas desde la spec; ninguna toca la red.

**Archivos:**
- `app/libros/nuevo/page.tsx`, `app/cuentas/nueva/page.tsx`
- `app/features/catalog/ui/`: `book-form-view.ts`, `book-form.tsx`
- `app/features/accounts/ui/`: `desk-account-view.ts`, `desk-account-form.tsx`
- `app/shared/ui/`: `form-messages.ts`, `form-field.tsx`, `post-form.ts`, `staff-only.tsx`, `navigation.ts` (dos enlaces del personal)
- Pruebas: `app/features/catalog/tests/book-form.test.ts`, `app/features/accounts/tests/desk-account-form.test.ts`, `app/shared/tests/navigation-forms.test.ts`; `app/shared/tests/navigation-staff.test.ts` y `navigation-borrower.test.ts` (ajustadas, ver Decisiones)

**Cómo verificar:** `npm run check` → formato, lint y tipos en verde y 724 pruebas pasan (solo falla `tests/project/guard.test.ts`, por el symlink de Windows); `npm run build` → compila con `/libros/nuevo` y `/cuentas/nueva`. Con `npm run dev`: ingresar como bibliotecario y usar «Registrar libro» y «Registrar cuenta».

Probado en el navegador contra Firebase real (2026-11-16) con un bibliotecario y un estudiante desechables; todo lo creado ya se borró:
- Sin sesión, `/libros/nuevo` termina en `/ingresar`.
- Bibliotecario → la barra muestra «Préstamos», «Registrar libro» y «Registrar cuenta».
- Libro: ISBN «123» → «Error: El ISBN debe tener 13 dígitos, o 10 (el último puede ser X).» sin llamar al servidor; con «978-0-00-000036-1» y 3 ejemplares → «Libro registrado: Libro de prueba F36 (3 ejemplares).», formulario limpio con 1, y el libro aparece en `/catalogo` con «3 de 3 disponibles». El mismo ISBN otra vez → «Error: Ya existe un libro con ese ISBN.» y los datos siguen escritos.
- Cuenta: sin rol → «Error: Elige el rol.»; contraseñas distintas → «Error: Las contraseñas no coinciden.», se conservan nombre, correo y rol y se vacían las contraseñas; bien llena con rol Docente → «Cuenta creada: Prueba F36 Nueva (…) · Docente.» y formulario limpio; el mismo correo en mayúsculas → «Error: Ya existe una cuenta con ese correo.». La cuenta creada pudo ingresar.
- Estudiante → en las dos pantallas «Error: No tienes permiso para ver esta pantalla.», sin formulario y sin esos enlaces en su barra.
- Sin desplazamiento horizontal a 360, 768 y 1024 px; campos, lista y botón de 44 px.

**Decisiones:**
- Piezas comunes en `app/shared/ui/` (campo con etiqueta, mensajes, envío con validación de la respuesta y el aviso de «solo personal») para no repetirlas en los dos formularios; no conocen ninguna feature.
- «Ejemplares» es un campo numérico; un valor como «2,5» llega vacío desde el navegador y muestra el aviso de ejemplares.
- Se cambiaron dos pruebas anteriores porque la regla 1.3 de F36 añade enlaces del personal: la de F34 exigía que «Préstamos» fuera el único enlace del personal y ahora comprueba que es el primero; la de F35 exigía que la lista del personal fuera solo «Préstamos» y ahora comprueba que empieza por él. No se cambiaron para hacer pasar código.
- Texto propio no pedido en la spec: las frases bajo cada título y la opción «Elige un rol».
- Hecho en una sola sesión de Claude Code, sin subagentes; la revisión de seguridad la hizo la misma sesión.

**Pendiente / bloqueos:**
- No se probó en real el 401 con la sesión vencida ni el 403 del servidor; están en las pruebas automáticas.
- Con un correo largo, a 1024 px la sesión de la cabecera ocupa dos líneas (ya pasaba en F35); no hay desplazamiento horizontal.
- `tests/project/guard.test.ts` sigue fallando por el symlink de Windows.

**Dudas de la especificación:**
- Ninguna.

### Revisión de seguridad (lista de `security-review`)
| Severidad | archivo:línea | Hallazgo | Cómo reproducirlo | Corrección |
| --- | --- | --- | --- | --- |
| Info | `app/shared/ui/staff-only.tsx` | Ocultar el formulario es solo comodidad; la autorización real sigue en `POST /api/books` y `POST /api/accounts` | Un estudiante que llame a la API recibe 403 (F1, F3) | — |
| Info | `app/features/accounts/ui/desk-account-form.tsx` | La contraseña solo viaja a `POST /api/accounts`; se borra del formulario tras error o éxito y no se muestra en mensajes | — | — |
| Info | `app/shared/ui/post-form.ts` | La respuesta se valida con Zod en el mismo punto; un error del servidor nunca se muestra como HTML | — | — |

Sin hallazgos que bloqueen. **Aprobado.**
