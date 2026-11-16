import type { Role } from "@/shared/schema";

/** Enlaces de la barra de navegación (specs F33 1.2–1.4, F34 1.5 y F35 1.5). Lógica pura. */

export interface NavLink {
  href: string;
  label: string;
}

/** Iguales para todos los roles y sin sesión. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "Inicio" },
  { href: "/catalogo", label: "Catálogo" },
];

/** Solo para el personal (`BIBLIOTECARIO`, `ADMINISTRADOR`). */
export const STAFF_NAV_LINKS: readonly NavLink[] = [{ href: "/prestamos", label: "Préstamos" }];

/** Solo para los prestatarios (`EXTERNO`, `ESTUDIANTE`, `DOCENTE`). */
export const BORROWER_NAV_LINKS: readonly NavLink[] = [
  { href: "/mis-prestamos", label: "Mis préstamos" },
  { href: "/mis-vencidos", label: "Mis vencidos" },
];

const STAFF_ROLES: readonly Role[] = ["BIBLIOTECARIO", "ADMINISTRADOR"];

/** Enlaces que dependen del rol; `null` = sin sesión. Se añaden después de `NAV_LINKS`. */
export function roleLinksFor(role: Role | null): readonly NavLink[] {
  if (role === null) {
    return [];
  }
  if (STAFF_ROLES.includes(role)) {
    return STAFF_NAV_LINKS;
  }
  return BORROWER_NAV_LINKS;
}

/** El enlace es el de la pantalla actual solo si la dirección coincide exactamente. */
export function isCurrentPage(pathname: string, href: string): boolean {
  return pathname === href;
}
