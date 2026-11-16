import { describe, expect, it } from "vitest";
import { isCurrentPage, NAV_LINKS } from "../ui/navigation";

describe("F33 · enlaces de la barra (reglas 1.2–1.4)", () => {
  it("la barra tiene Inicio y Catálogo, en ese orden, y nada más", () => {
    expect(NAV_LINKS).toEqual([
      { href: "/", label: "Inicio" },
      { href: "/catalogo", label: "Catálogo" },
    ]);
  });

  it("en / el actual es Inicio y no Catálogo", () => {
    expect(isCurrentPage("/", "/")).toBe(true);
    expect(isCurrentPage("/", "/catalogo")).toBe(false);
  });

  it("en /catalogo el actual es Catálogo y no Inicio", () => {
    expect(isCurrentPage("/catalogo", "/catalogo")).toBe(true);
    expect(isCurrentPage("/catalogo", "/")).toBe(false);
  });

  it("en una pantalla que no está en la barra ningún enlace es el actual", () => {
    for (const path of ["/ingresar", "/acerca", "/no-existe"]) {
      expect(NAV_LINKS.filter((link) => isCurrentPage(path, link.href))).toEqual([]);
    }
  });

  it("una dirección que solo empieza parecido no cuenta", () => {
    expect(isCurrentPage("/catalogo-viejo", "/catalogo")).toBe(false);
  });
});
