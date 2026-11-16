import { describe, expect, it } from "vitest";
import { type Account, ErrorResponseSchema, type Role, type Session } from "@/shared/schema";
import { UnauthenticatedError } from "@/shared/server/errors";
import { type NewTeacherRequest, TeacherRequestInputSchema, TeacherRequestSchema } from "../schema";
import type { AccountDirectory } from "../server/repository";
import { createMemoryTeacherRequestRepository } from "../server/repository.memory";
import { createTeacherRequestHandler } from "../server/teacher-request-handler";
import { createTeacherRequestService } from "../server/teacher-request-service";
import {
  latestRequestMessage,
  reasonProblem,
  TEACHER_REQUEST_MESSAGES,
  teacherRequestFailureMessage,
  teacherRequestScreen,
} from "../ui/teacher-request-view";

const NOW = new Date("2026-11-16T15:00:00.000Z");
const REASON = "Soy profesor de Física en la facultad de Ciencias.";
const ANA: Session = { uid: "uid-ana", email: "ana@correo.test", role: "ESTUDIANTE" };
const LUIS: Session = { uid: "uid-luis", email: "luis@correo.test", role: "EXTERNO" };
const FORBIDDEN_MESSAGE = "Solo un externo o un estudiante puede pedir el rol de docente.";
const PENDING_MESSAGE = "Ya tienes una solicitud pendiente.";

const ACCOUNTS: Record<string, Account> = {
  "uid-ana": { email: "ana@correo.test", name: "Ana Pérez", role: "ESTUDIANTE" },
  "uid-luis": { email: "luis@correo.test", name: "Luis Gómez", role: "EXTERNO" },
};

function directory(): AccountDirectory {
  return {
    findAccount(uid: string): Promise<Account | null> {
      return Promise.resolve(ACCOUNTS[uid] ?? null);
    },
  };
}

function setup(session: Session | null = ANA) {
  const requests = createMemoryTeacherRequestRepository();
  const service = createTeacherRequestService({ requests, accounts: directory() });
  let sessionReads = 0;
  const handler = createTeacherRequestHandler({
    service,
    readSession: () => {
      sessionReads += 1;
      if (session === null) {
        return Promise.reject(new UnauthenticatedError());
      }
      return Promise.resolve(session);
    },
    now: () => NOW,
    rethrow: () => undefined,
  });
  return { requests, service, handler, sessionReads: () => sessionReads };
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/teacher-requests", {
    method: "POST",
    headers: { host: "localhost:3000", origin, "content-type": "application/json" },
    body,
  });
}

function postJson(body: object, origin?: string): Request {
  return post(JSON.stringify(body), origin);
}

async function errorOf(response: Response) {
  return ErrorResponseSchema.parse(await response.json()).error;
}

function stored(status: NewTeacherRequest["status"], uid = "uid-ana", requestedAt = "2026-11-10T10:00:00.000Z") {
  return {
    uid,
    email: ACCOUNTS[uid]?.email ?? "x@correo.test",
    name: ACCOUNTS[uid]?.name ?? "X",
    reason: "Motivo anterior de prueba.",
    status,
    requested_at: requestedAt,
  };
}

describe("F11 · pedir el rol de docente (reglas 2 y 4)", () => {
  it("un estudiante sin solicitudes recibe 201 con PENDIENTE y la hora inyectada", async () => {
    const { handler, requests } = setup();
    const response = await handler(postJson({ reason: REASON }));
    expect(response.status).toBe(201);
    const created = TeacherRequestSchema.parse(await response.json());
    expect(created).toMatchObject({ reason: REASON, status: "PENDIENTE", requested_at: NOW.toISOString() });
    expect(created.id.length).toBeGreaterThan(0);
    expect(Object.keys(created).sort()).toEqual(["id", "reason", "requested_at", "status"]);
    expect(requests.all()).toEqual([
      {
        id: created.id,
        uid: "uid-ana",
        email: "ana@correo.test",
        name: "Ana Pérez",
        reason: REASON,
        status: "PENDIENTE",
        requested_at: NOW.toISOString(),
      },
    ]);
  });

  it("un externo también puede pedir", async () => {
    const { handler } = setup(LUIS);
    expect((await handler(postJson({ reason: REASON }))).status).toBe(201);
  });

  it("el motivo se guarda recortado", async () => {
    const { handler, requests } = setup();
    await handler(postJson({ reason: `   ${REASON}  ` }));
    expect(requests.all()[0]?.reason).toBe(REASON);
  });

  it("la solicitud queda a nombre de quien tiene la sesión aunque el cuerpo diga otra cosa", async () => {
    const { handler, requests } = setup();
    const response = await handler(
      postJson({ reason: REASON, uid: "uid-luis", email: "luis@correo.test", name: "Luis", status: "APROBADA" }),
    );
    expect(response.status).toBe(201);
    expect(requests.all()[0]).toMatchObject({
      uid: "uid-ana",
      email: "ana@correo.test",
      name: "Ana Pérez",
      status: "PENDIENTE",
    });
  });

  it("pedir no cambia el rol: la respuesta no lo menciona", async () => {
    const { handler } = setup();
    const text = await (await handler(postJson({ reason: REASON }))).text();
    expect(text).not.toContain("DOCENTE");
  });
});

describe("F11 · una pendiente a la vez (regla 3)", () => {
  it("con una pendiente, otra recibe 409 y sigue habiendo una sola", async () => {
    const { handler, requests } = setup(LUIS);
    requests.seed(stored("PENDIENTE", "uid-luis"));
    const response = await handler(postJson({ reason: REASON }));
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ code: "CONFLICTO", message: PENDING_MESSAGE });
    expect(requests.all()).toHaveLength(1);
  });

  it("si la última fue rechazada, puede volver a pedir", async () => {
    const { handler, requests } = setup();
    requests.seed(stored("RECHAZADA"));
    expect((await handler(postJson({ reason: REASON }))).status).toBe(201);
    expect(requests.all()).toHaveLength(2);
  });

  it("si la última fue aprobada y ya no es docente, puede volver a pedir", async () => {
    const { handler, requests } = setup();
    requests.seed(stored("APROBADA"));
    expect((await handler(postJson({ reason: REASON }))).status).toBe(201);
  });

  it("la pendiente de otra persona no bloquea", async () => {
    const { handler, requests } = setup();
    requests.seed(stored("PENDIENTE", "uid-luis"));
    expect((await handler(postJson({ reason: REASON }))).status).toBe(201);
    expect(requests.all().filter((request) => request.status === "PENDIENTE")).toHaveLength(2);
  });

  it("dos envíos simultáneos de la misma persona: uno 201 y otro 409", async () => {
    const { handler, requests } = setup();
    const statuses = await Promise.all([
      handler(postJson({ reason: REASON })),
      handler(postJson({ reason: REASON })),
    ]).then((responses) => responses.map((response) => response.status).sort());
    expect(statuses).toEqual([201, 409]);
    expect(requests.all()).toHaveLength(1);
  });
});

describe("F11 · autorización (regla 1)", () => {
  it.each<Role>(["DOCENTE", "BIBLIOTECARIO", "ADMINISTRADOR"])("un %s recibe 403 y no se crea nada", async (role) => {
    const { handler, requests } = setup({ ...ANA, role });
    const response = await handler(postJson({ reason: REASON }));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toMatchObject({ code: "NO_AUTORIZADO", message: FORBIDDEN_MESSAGE });
    expect(requests.all()).toHaveLength(0);
  });

  it("el rol se revisa antes que el cuerpo", async () => {
    const { handler } = setup({ ...ANA, role: "DOCENTE" });
    expect((await handler(post("no es json"))).status).toBe(403);
  });

  it("sin sesión responde 401", async () => {
    const { handler } = setup(null);
    const response = await handler(postJson({ reason: REASON }));
    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("NO_AUTENTICADO");
  });

  it("desde otro origen responde 403 sin leer la sesión ni crear nada", async () => {
    const { handler, requests, sessionReads } = setup();
    const response = await handler(postJson({ reason: REASON }, "http://otro.test"));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toMatchObject({ message: "Origen no permitido." });
    expect(sessionReads()).toBe(0);
    expect(requests.all()).toHaveLength(0);
  });

  it("una cuenta sin documento en accounts recibe 401", async () => {
    const { handler, requests } = setup({ uid: "uid-sin-documento", email: "x@correo.test", role: "EXTERNO" });
    expect((await handler(postJson({ reason: REASON }))).status).toBe(401);
    expect(requests.all()).toHaveLength(0);
  });
});

describe("F11 · el motivo (regla 2.1 y bordes)", () => {
  it.each([
    ["9 caracteres", "123456789", 400],
    ["10 caracteres", "1234567890", 201],
    ["9 con espacios alrededor", "   123456789   ", 400],
    ["solo espacios", "            ", 400],
    ["500 caracteres", "a".repeat(500), 201],
    ["501 caracteres", "a".repeat(501), 400],
  ])("%s → %i", async (_label, reason, status) => {
    const { handler } = setup();
    const response = await handler(postJson({ reason }));
    expect(response.status).toBe(status);
    if (status === 400) {
      const error = await errorOf(response);
      expect(error.code).toBe("VALIDACION");
      expect(error.fields?.map((field) => field.path)).toEqual(["reason"]);
    }
  });

  it("sin motivo → 400 con el campo reason", async () => {
    const { handler } = setup();
    const error = await errorOf(await handler(postJson({})));
    expect(error.fields?.map((field) => field.path)).toEqual(["reason"]);
  });

  it("un cuerpo que no es JSON → 400", async () => {
    const { handler } = setup();
    expect((await handler(post("{no es json"))).status).toBe(400);
  });

  it("el esquema ignora los campos extra", () => {
    expect(TeacherRequestInputSchema.parse({ reason: REASON, uid: "otro" })).toEqual({ reason: REASON });
  });
});

describe("F11 · la última solicitud (regla 5.4)", () => {
  it("sin solicitudes devuelve null", async () => {
    const { service } = setup();
    expect(await service.latest(ANA)).toBeNull();
  });

  it("devuelve la más reciente de la persona, sin datos de otras", async () => {
    const { service, requests } = setup();
    requests.seed(stored("RECHAZADA", "uid-ana", "2026-11-01T10:00:00.000Z"));
    requests.seed(stored("PENDIENTE", "uid-luis", "2026-11-15T10:00:00.000Z"));
    const newest = requests.seed({ ...stored("PENDIENTE", "uid-ana", "2026-11-12T10:00:00.000Z"), reason: REASON });
    expect(await service.latest(ANA)).toEqual({
      id: newest.id,
      reason: REASON,
      status: "PENDIENTE",
      requested_at: "2026-11-12T10:00:00.000Z",
    });
  });
});

describe("F11 · lo que muestra la pantalla (regla 5)", () => {
  const pending = { id: "r1", reason: REASON, status: "PENDIENTE" as const, requested_at: NOW.toISOString() };

  it("un docente ve que ya tiene el rol, sin formulario", () => {
    expect(teacherRequestScreen("DOCENTE", null)).toEqual({ kind: "teacher" });
    expect(TEACHER_REQUEST_MESSAGES.alreadyTeacher).toBe("Ya tienes el rol de docente.");
  });

  it.each<Role>(["BIBLIOTECARIO", "ADMINISTRADOR"])("un %s ve el aviso del personal", (role) => {
    expect(teacherRequestScreen(role, null)).toEqual({ kind: "staff" });
    expect(TEACHER_REQUEST_MESSAGES.staffOnly).toBe("Esta pantalla es para quienes piden libros prestados.");
  });

  it("sin solicitudes: solo el formulario", () => {
    expect(teacherRequestScreen("ESTUDIANTE", null)).toEqual({ kind: "borrower", latest: null, showForm: true });
  });

  it("con una pendiente: sin formulario", () => {
    expect(teacherRequestScreen("EXTERNO", pending)).toEqual({ kind: "borrower", latest: pending, showForm: false });
  });

  it.each(["RECHAZADA", "APROBADA"] as const)("con la última %s: con formulario", (status) => {
    const latest = { ...pending, status };
    expect(teacherRequestScreen("ESTUDIANTE", latest)).toEqual({ kind: "borrower", latest, showForm: true });
  });

  it("el estado de la última solicitud se dice así", () => {
    expect(latestRequestMessage("PENDIENTE")).toBe("Tu solicitud está pendiente.");
    expect(latestRequestMessage("RECHAZADA")).toBe("Tu última solicitud fue rechazada.");
    expect(latestRequestMessage("APROBADA")).toBe("Tu última solicitud fue aprobada.");
  });

  it("revisa el motivo recortado antes de enviarlo (regla 5.5)", () => {
    expect(reasonProblem("")).toBe("Escribe un motivo de al menos 10 caracteres.");
    expect(reasonProblem("   123456789   ")).toBe("Escribe un motivo de al menos 10 caracteres.");
    expect(reasonProblem(" 1234567890 ")).toBeNull();
    expect(reasonProblem("a".repeat(500))).toBeNull();
    expect(reasonProblem("a".repeat(501))).toBe("El motivo puede tener como máximo 500 caracteres.");
  });

  it("traduce los fallos del servidor (regla 5.6)", () => {
    expect(teacherRequestFailureMessage(409, PENDING_MESSAGE)).toBe(PENDING_MESSAGE);
    expect(teacherRequestFailureMessage(403, FORBIDDEN_MESSAGE)).toBe(FORBIDDEN_MESSAGE);
    expect(teacherRequestFailureMessage(400, "Los datos enviados no son válidos.")).toBe("Revisa el motivo.");
    expect(teacherRequestFailureMessage(500, "Ocurrió un error inesperado.")).toBe(
      "No se pudo enviar la solicitud. Intenta de nuevo.",
    );
    expect(teacherRequestFailureMessage(409, null)).toBe("No se pudo enviar la solicitud. Intenta de nuevo.");
  });

  it("tras enviar se ve «Solicitud enviada.» (regla 5.7)", () => {
    expect(TEACHER_REQUEST_MESSAGES.sent).toBe("Solicitud enviada.");
  });
});
