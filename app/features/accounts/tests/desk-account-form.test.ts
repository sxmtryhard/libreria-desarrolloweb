import { describe, expect, it } from "vitest";
import { FORM_MESSAGES, formFailureMessage } from "@/shared/ui/form-messages";
import { RegisterAccountInputSchema } from "../schema";
import {
  DESK_ACCOUNT_ROLE_OPTIONS,
  deskAccountProblem,
  deskAccountSuccessMessage,
  toRegisterAccountBody,
} from "../ui/desk-account-view";

const VALID = {
  name: "Ana Pérez",
  email: "ana@correo.test",
  role: "ESTUDIANTE",
  password: "clave-inicial-1",
  repeat: "clave-inicial-1",
};

describe("F36 · formulario de cuenta (regla 3)", () => {
  it("el rol se elige entre Externo, Estudiante y Docente", () => {
    expect(DESK_ACCOUNT_ROLE_OPTIONS).toEqual([
      { value: "EXTERNO", label: "Externo" },
      { value: "ESTUDIANTE", label: "Estudiante" },
      { value: "DOCENTE", label: "Docente" },
    ]);
  });

  it("una cuenta bien escrita no tiene problemas", () => {
    expect(deskAccountProblem(VALID)).toBeNull();
  });

  it("muestra el primer problema, en el orden de la spec", () => {
    const empty = { name: "", email: "", role: "", password: "", repeat: "x" };
    expect(deskAccountProblem(empty)).toBe("Escribe el nombre.");
    expect(deskAccountProblem({ ...empty, name: "Ana" })).toBe("Escribe el correo.");
    expect(deskAccountProblem({ ...empty, name: "Ana", email: "a@b.test" })).toBe("Elige el rol.");
    expect(deskAccountProblem({ ...VALID, password: "1234567", repeat: "otra" })).toBe(
      "La contraseña debe tener entre 8 y 128 caracteres.",
    );
    expect(deskAccountProblem({ ...VALID, repeat: "otra-clave-1" })).toBe("Las contraseñas no coinciden.");
  });

  it("un rol que no está en la lista cuenta como no elegido", () => {
    expect(deskAccountProblem({ ...VALID, role: "ADMINISTRADOR" })).toBe("Elige el rol.");
  });

  it("nombre o correo de solo espacios cuentan como vacíos", () => {
    expect(deskAccountProblem({ ...VALID, name: "   " })).toBe("Escribe el nombre.");
    expect(deskAccountProblem({ ...VALID, email: "   " })).toBe("Escribe el correo.");
  });

  it("la contraseña de 8 y de 128 caracteres vale; de 129 no", () => {
    expect(deskAccountProblem({ ...VALID, password: "a".repeat(8), repeat: "a".repeat(8) })).toBeNull();
    expect(deskAccountProblem({ ...VALID, password: "a".repeat(128), repeat: "a".repeat(128) })).toBeNull();
    expect(deskAccountProblem({ ...VALID, password: "a".repeat(129), repeat: "a".repeat(129) })).toBe(
      "La contraseña debe tener entre 8 y 128 caracteres.",
    );
  });

  it("el cuerpo de POST /api/accounts no lleva la repetición y es válido para F3 (regla 3.3)", () => {
    const body = toRegisterAccountBody(VALID);
    expect(body).toEqual({
      name: "Ana Pérez",
      email: "ana@correo.test",
      role: "ESTUDIANTE",
      password: "clave-inicial-1",
    });
    expect(RegisterAccountInputSchema.safeParse(body).success).toBe(true);
  });

  it("el mensaje de éxito dice nombre, correo y rol (regla 3.4)", () => {
    expect(
      deskAccountSuccessMessage({ uid: "u1", name: "Ana Pérez", email: "ana@correo.test", role: "ESTUDIANTE" }),
    ).toBe("Cuenta creada: Ana Pérez (ana@correo.test) · Estudiante.");
  });
});

describe("F36 · errores del servidor (regla 4)", () => {
  it("409 muestra el mensaje del servidor", () => {
    expect(formFailureMessage(409, "Ya existe un libro con ese ISBN.")).toBe("Ya existe un libro con ese ISBN.");
    expect(formFailureMessage(409, "Ya existe una cuenta con ese correo.")).toBe(
      "Ya existe una cuenta con ese correo.",
    );
  });

  it("los demás estados tienen su texto", () => {
    expect(formFailureMessage(400, "x")).toBe("Revisa los datos del formulario.");
    expect(formFailureMessage(401, "x")).toBe("Tu sesión terminó. Vuelve a ingresar.");
    expect(formFailureMessage(403, "x")).toBe("No tienes permiso para hacer esto.");
    expect(formFailureMessage(500, "x")).toBe("No se pudo registrar. Intenta de nuevo.");
    expect(formFailureMessage(409, null)).toBe("No se pudo registrar. Intenta de nuevo.");
  });

  it("el aviso de pantalla sin permiso es el de F34", () => {
    expect(FORM_MESSAGES.forbiddenScreen).toBe("No tienes permiso para ver esta pantalla.");
  });
});
