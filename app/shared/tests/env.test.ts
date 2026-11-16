import { describe, expect, it } from "vitest";
import { checkEnv, formatEnvReport, isEnvValid, normalizePrivateKey, readServerEnv } from "@/shared/server/env";

const PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nCLAVE-FALSA-DE-PRUEBA\n-----END PRIVATE KEY-----\n";

function fullEnv(): Record<string, string | undefined> {
  return {
    FIREBASE_PROJECT_ID: "proyecto-de-prueba",
    FIREBASE_CLIENT_EMAIL: "servicio@proyecto-de-prueba.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: PRIVATE_KEY,
    NEXT_PUBLIC_FIREBASE_API_KEY: "clave-publica-falsa",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "proyecto-de-prueba.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "proyecto-de-prueba",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
  };
}

function statusOf(env: Record<string, string | undefined>, name: string): string | undefined {
  return checkEnv(env).find((entry) => entry.name === name)?.status;
}

describe("F0 · comprobación del entorno (reglas 5.1–5.4)", () => {
  it("con el entorno completo las 7 variables salen OK y el resultado es válido", () => {
    const report = checkEnv(fullEnv());
    expect(report).toHaveLength(7);
    expect(report.every((entry) => entry.status === "OK")).toBe(true);
    expect(isEnvValid(report)).toBe(true);
  });

  it("la salida nunca contiene un valor, ni entero ni parcial", () => {
    const env = fullEnv();
    const output = formatEnvReport(checkEnv(env)).join("\n");
    for (const value of Object.values(env)) {
      expect(output).not.toContain(value);
    }
    expect(output).not.toContain("CLAVE-FALSA");
    expect(output).not.toContain("proyecto-de-prueba");
  });

  it("imprime una línea por variable con su nombre y su estado", () => {
    const lines = formatEnvReport(checkEnv(fullEnv()));
    expect(lines).toHaveLength(7);
    expect(lines.some((line) => line.includes("FIREBASE_PROJECT_ID") && line.includes("OK"))).toBe(true);
  });

  it("si falta FIREBASE_PROJECT_ID sale FALTA, las demás OK y el resultado es de fallo", () => {
    const env = fullEnv();
    delete env.FIREBASE_PROJECT_ID;
    const report = checkEnv(env);
    expect(statusOf(env, "FIREBASE_PROJECT_ID")).toBe("FALTA");
    expect(report.filter((entry) => entry.status === "OK")).toHaveLength(6);
    expect(isEnvValid(report)).toBe(false);
  });

  it("una variable con solo espacios sale FALTA", () => {
    const env = { ...fullEnv(), NEXT_PUBLIC_FIREBASE_APP_ID: "   " };
    expect(statusOf(env, "NEXT_PUBLIC_FIREBASE_APP_ID")).toBe("FALTA");
  });

  it("FIREBASE_CLIENT_EMAIL sin forma de correo sale INVALIDA", () => {
    const env = { ...fullEnv(), FIREBASE_CLIENT_EMAIL: "no-es-un-correo" };
    expect(statusOf(env, "FIREBASE_CLIENT_EMAIL")).toBe("INVALIDA");
    expect(isEnvValid(checkEnv(env))).toBe(false);
  });

  it("FIREBASE_PRIVATE_KEY sin «BEGIN PRIVATE KEY» sale INVALIDA", () => {
    const env = { ...fullEnv(), FIREBASE_PRIVATE_KEY: "cualquier-cosa" };
    expect(statusOf(env, "FIREBASE_PRIVATE_KEY")).toBe("INVALIDA");
  });

  it("FIREBASE_PRIVATE_KEY entre comillas y con \\n literales sale OK", () => {
    const quoted = '"-----BEGIN PRIVATE KEY-----\\nCLAVE-FALSA-DE-PRUEBA\\n-----END PRIVATE KEY-----\\n"';
    const env = { ...fullEnv(), FIREBASE_PRIVATE_KEY: quoted };
    expect(statusOf(env, "FIREBASE_PRIVATE_KEY")).toBe("OK");
  });
});

describe("F0 · normalizar la clave privada (regla 4.2)", () => {
  it("quita las comillas envolventes y convierte los \\n literales en saltos de línea", () => {
    const quoted = '"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"';
    const normalized = normalizePrivateKey(quoted);
    expect(normalized.startsWith('"')).toBe(false);
    expect(normalized.endsWith('"')).toBe(false);
    expect(normalized).not.toContain("\\n");
    expect(normalized).toBe("-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n");
  });

  it("deja igual una clave que ya está normalizada", () => {
    expect(normalizePrivateKey(PRIVATE_KEY)).toBe(PRIVATE_KEY);
  });
});

describe("F0 · leer el entorno del servidor (regla 5.5)", () => {
  it("con el entorno completo devuelve las credenciales con la clave normalizada", () => {
    const env = { ...fullEnv(), FIREBASE_PRIVATE_KEY: JSON.stringify(PRIVATE_KEY) };
    expect(readServerEnv(env)).toEqual({
      projectId: "proyecto-de-prueba",
      clientEmail: "servicio@proyecto-de-prueba.iam.gserviceaccount.com",
      privateKey: PRIVATE_KEY,
    });
  });

  it("con el entorno inválido falla nombrando las variables, sin mostrar valores", () => {
    const env = fullEnv();
    env.FIREBASE_CLIENT_EMAIL = "valor-secreto-malo";
    delete env.FIREBASE_PROJECT_ID;
    let message = "";
    try {
      readServerEnv(env);
    } catch (error) {
      if (error instanceof Error) {
        message = error.message;
      }
    }
    expect(message).toContain("FIREBASE_PROJECT_ID");
    expect(message).toContain("FIREBASE_CLIENT_EMAIL");
    expect(message).not.toContain("valor-secreto-malo");
  });
});
