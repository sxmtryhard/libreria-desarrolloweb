import { describe, expect, it } from "vitest";
import type { Role } from "../schema";
import { roleLinksFor, STAFF_NAV_LINKS } from "../ui/navigation";

describe("F36 · enlaces de los formularios en la barra (regla 1.3)", () => {
  it("el personal ve Préstamos, Registrar libro y Registrar cuenta, en ese orden", () => {
    expect(STAFF_NAV_LINKS).toEqual([
      { href: "/prestamos", label: "Préstamos" },
      { href: "/libros/nuevo", label: "Registrar libro" },
      { href: "/cuentas/nueva", label: "Registrar cuenta" },
    ]);
  });

  it.each<Role>(["BIBLIOTECARIO", "ADMINISTRADOR"])("un %s los ve", (role) => {
    expect(roleLinksFor(role)).toEqual(STAFF_NAV_LINKS);
  });

  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s no los ve", (role) => {
    const hrefs = roleLinksFor(role).map((link) => link.href);
    expect(hrefs).not.toContain("/libros/nuevo");
    expect(hrefs).not.toContain("/cuentas/nueva");
  });
});
