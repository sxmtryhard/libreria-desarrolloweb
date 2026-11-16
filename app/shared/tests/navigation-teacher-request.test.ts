import { describe, expect, it } from "vitest";
import type { Role } from "../schema";
import { roleLinksFor, TEACHER_REQUEST_NAV_LINK } from "../ui/navigation";

describe("F11 · enlace «Solicitar docente» en la barra (regla 5.8)", () => {
  it("apunta a /solicitar-docente", () => {
    expect(TEACHER_REQUEST_NAV_LINK).toEqual({ href: "/solicitar-docente", label: "Solicitar docente" });
  });

  it.each<Role>(["EXTERNO", "ESTUDIANTE"])("un %s lo ve después de Mis vencidos", (role) => {
    expect(roleLinksFor(role).map((link) => link.label)).toEqual([
      "Mis préstamos",
      "Mis vencidos",
      "Solicitar docente",
    ]);
  });

  it.each<Role>(["DOCENTE", "BIBLIOTECARIO", "ADMINISTRADOR"])("un %s no lo ve", (role) => {
    expect(roleLinksFor(role).map((link) => link.label)).not.toContain("Solicitar docente");
  });

  it("sin sesión no aparece", () => {
    expect(roleLinksFor(null)).toEqual([]);
  });
});
