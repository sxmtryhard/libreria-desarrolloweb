import { describe, expect, it } from "vitest";
import type { Role } from "../schema";
import { isCurrentPage, NAV_LINKS, roleLinksFor, STAFF_NAV_LINKS } from "../ui/navigation";

describe("F34 · enlace «Préstamos» en la barra (regla 1.5)", () => {
  // F36 (regla 1.3) añade «Registrar libro» y «Registrar cuenta» después de «Préstamos».
  it("el primer enlace del personal es Préstamos → /prestamos", () => {
    expect(STAFF_NAV_LINKS[0]).toEqual({ href: "/prestamos", label: "Préstamos" });
  });

  it.each<Role>(["BIBLIOTECARIO", "ADMINISTRADOR"])("un %s ve Préstamos", (role) => {
    expect(roleLinksFor(role)[0]).toEqual({ href: "/prestamos", label: "Préstamos" });
  });

  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s no ve Préstamos", (role) => {
    expect(roleLinksFor(role).map((link) => link.href)).not.toContain("/prestamos");
  });

  it("sin sesión no aparece", () => {
    expect(roleLinksFor(null)).toEqual([]);
  });

  it("los enlaces comunes siguen siendo Inicio y Catálogo", () => {
    expect(NAV_LINKS.map((link) => link.label)).toEqual(["Inicio", "Catálogo"]);
  });

  it("en /prestamos el actual es Préstamos", () => {
    expect(isCurrentPage("/prestamos", "/prestamos")).toBe(true);
    expect(isCurrentPage("/prestamos", "/")).toBe(false);
  });
});
