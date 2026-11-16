import { describe, expect, it } from "vitest";
import type { Role } from "../schema";
import { BORROWER_NAV_LINKS, isCurrentPage, roleLinksFor } from "../ui/navigation";

describe("F35 · enlaces de los prestatarios en la barra (regla 1.5)", () => {
  it("son Mis préstamos y Mis vencidos, en ese orden", () => {
    expect(BORROWER_NAV_LINKS).toEqual([
      { href: "/mis-prestamos", label: "Mis préstamos" },
      { href: "/mis-vencidos", label: "Mis vencidos" },
    ]);
  });

  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s los ve y no ve Préstamos", (role) => {
    const labels = roleLinksFor(role).map((link) => link.label);
    expect(labels).toEqual(["Mis préstamos", "Mis vencidos"]);
    expect(labels).not.toContain("Préstamos");
  });

  it.each<Role>(["BIBLIOTECARIO", "ADMINISTRADOR"])("un %s no los ve", (role) => {
    const labels = roleLinksFor(role).map((link) => link.label);
    expect(labels).not.toContain("Mis préstamos");
    expect(labels).not.toContain("Mis vencidos");
    expect(labels).toEqual(["Préstamos"]);
  });

  it("sin sesión no aparecen", () => {
    expect(roleLinksFor(null)).toEqual([]);
  });

  it("cada pantalla marca solo su enlace como actual", () => {
    expect(isCurrentPage("/mis-prestamos", "/mis-prestamos")).toBe(true);
    expect(isCurrentPage("/mis-prestamos", "/mis-vencidos")).toBe(false);
    expect(isCurrentPage("/mis-vencidos", "/mis-vencidos")).toBe(true);
  });
});
