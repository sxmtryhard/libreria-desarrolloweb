import { describe, expect, it } from "vitest";
import { ROLES } from "@/shared/schema";
import { ROLE_LABELS, sessionLabel } from "../ui/role-labels";

describe("F33 · cómo se identifica a la persona en la cabecera (regla 1.6)", () => {
  it("correo y rol en español separados por un punto medio", () => {
    expect(sessionLabel({ uid: "uid-ana", email: "ana@correo.test", role: "ESTUDIANTE" })).toBe(
      "ana@correo.test · Estudiante",
    );
  });

  it("cada rol tiene su nombre en español", () => {
    expect(ROLE_LABELS).toEqual({
      EXTERNO: "Externo",
      ESTUDIANTE: "Estudiante",
      DOCENTE: "Docente",
      BIBLIOTECARIO: "Bibliotecario",
      ADMINISTRADOR: "Administrador",
    });
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort());
  });

  it("el personal también se identifica con correo y rol", () => {
    expect(sessionLabel({ uid: "u", email: "admin@biblioteca.test", role: "ADMINISTRADOR" })).toBe(
      "admin@biblioteca.test · Administrador",
    );
  });
});
