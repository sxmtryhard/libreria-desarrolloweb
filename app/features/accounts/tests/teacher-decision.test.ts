import { describe, expect, it } from "vitest";
import { type Account, ErrorResponseSchema, type Role, type Session } from "@/shared/schema";
import { UnauthenticatedError } from "@/shared/server/errors";
import {
  DecidedTeacherRequestSchema,
  type NewTeacherRequest,
  PENDING_LIST_LIMIT,
  PendingTeacherRequestsResponseSchema,
} from "../schema";
import type { AccountDirectory } from "../server/repository";
import { createMemoryTeacherRequestRepository } from "../server/repository.memory";
import { createTeacherDecisionHandler, createPendingTeacherRequestsHandler } from "../server/teacher-decision-handlers";
import { createTeacherRequestService } from "../server/teacher-request-service";
import { latestRequestNote } from "../ui/teacher-request-view";

const NOW = new Date("2026-11-17T10:00:00.000Z");
const LIBRARIAN: Session = { uid: "uid-bib", email: "bib@correo.test", role: "BIBLIOTECARIO" };
const ADMIN: Session = { uid: "uid-admin", email: "admin@correo.test", role: "ADMINISTRADOR" };
const DECIDED_MESSAGE = "La solicitud ya fue decidida.";
const NOT_FOUND_MESSAGE = "No existe esa solicitud.";
const ACCOUNT_MESSAGE = "La cuenta ya no puede recibir el rol de docente.";

const NO_ACCOUNTS: AccountDirectory = {
  findAccount(): Promise<Account | null> {
    return Promise.resolve(null);
  },
};

function request(
  uid: string,
  requestedAt: string,
  status: NewTeacherRequest["status"] = "PENDIENTE",
): NewTeacherRequest {
  return {
    uid,
    email: `${uid}@correo.test`,
    name: `Nombre ${uid}`,
    reason: `Motivo de ${uid} para ser docente.`,
    status,
    requested_at: requestedAt,
  };
}

function setup(session: Session | null = LIBRARIAN) {
  const requests = createMemoryTeacherRequestRepository();
  const service = createTeacherRequestService({ requests, accounts: NO_ACCOUNTS });
  let sessionReads = 0;
  const deps = {
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
  };
  return {
    requests,
    service,
    pending: createPendingTeacherRequestsHandler(deps),
    decide: createTeacherDecisionHandler(deps),
    sessionReads: () => sessionReads,
  };
}

/** Una solicitud pendiente de un estudiante con su cuenta. */
function setupWithPending(session: Session | null = LIBRARIAN, role: Role = "ESTUDIANTE") {
  const context = setup(session);
  context.requests.setAccountRole("uid-ana", role);
  const pending = context.requests.seed(request("uid-ana", "2026-11-16T15:00:00.000Z"));
  return { ...context, requestId: pending.id };
}

function getPending(): Request {
  return new Request("http://localhost:3000/api/teacher-requests/pending", {
    headers: { host: "localhost:3000" },
  });
}

function post(body: string, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/teacher-requests/decision", {
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

describe("F12 · ver las pendientes (regla 2)", () => {
  it("devuelve solo las pendientes, la más antigua primero, con sus datos", async () => {
    const { pending, requests } = setup();
    requests.seed(request("uid-luis", "2026-11-15T09:00:00.000Z"));
    requests.seed(request("uid-eva", "2026-11-10T09:00:00.000Z", "RECHAZADA"));
    const ana = requests.seed(request("uid-ana", "2026-11-14T09:00:00.000Z"));
    const response = await pending(getPending());
    expect(response.status).toBe(200);
    const body = PendingTeacherRequestsResponseSchema.parse(await response.json());
    expect(body.requests.map((item) => item.uid)).toEqual(["uid-ana", "uid-luis"]);
    expect(body.requests[0]).toEqual({
      id: ana.id,
      uid: "uid-ana",
      email: "uid-ana@correo.test",
      name: "Nombre uid-ana",
      reason: "Motivo de uid-ana para ser docente.",
      requested_at: "2026-11-14T09:00:00.000Z",
    });
  });

  it("sin pendientes devuelve una lista vacía", async () => {
    const { pending } = setup(ADMIN);
    expect(await (await pending(getPending())).json()).toEqual({ requests: [] });
  });

  it(`devuelve como máximo ${PENDING_LIST_LIMIT}, las más antiguas`, async () => {
    const { pending, requests } = setup();
    for (let index = 0; index < PENDING_LIST_LIMIT + 5; index += 1) {
      const minute = String(index % 60).padStart(2, "0");
      const hour = String(Math.floor(index / 60)).padStart(2, "0");
      requests.seed(request(`uid-${index}`, `2026-11-16T${hour}:${minute}:00.000Z`));
    }
    const body = PendingTeacherRequestsResponseSchema.parse(await (await pending(getPending())).json());
    expect(body.requests).toHaveLength(PENDING_LIST_LIMIT);
    expect(body.requests[0]?.uid).toBe("uid-0");
    expect(body.requests.at(-1)?.uid).toBe(`uid-${PENDING_LIST_LIMIT - 1}`);
  });

  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s recibe 403", async (role) => {
    const { pending } = setup({ ...LIBRARIAN, role });
    expect((await pending(getPending())).status).toBe(403);
  });

  it("sin sesión recibe 401", async () => {
    const { pending } = setup(null);
    expect((await pending(getPending())).status).toBe(401);
  });
});

describe("F12 · aprobar (reglas 3 y 4)", () => {
  it("un administrador aprueba: 200, la hora inyectada, sin nota, y la cuenta queda DOCENTE", async () => {
    const { decide, requests, requestId } = setupWithPending(ADMIN);
    const response = await decide(postJson({ request_id: requestId, decision: "APROBADA" }));
    expect(response.status).toBe(200);
    expect(DecidedTeacherRequestSchema.parse(await response.json())).toEqual({
      id: requestId,
      status: "APROBADA",
      decided_at: NOW.toISOString(),
      note: null,
    });
    expect(requests.accountRole("uid-ana")).toBe("DOCENTE");
    expect(requests.all()[0]).toMatchObject({
      status: "APROBADA",
      decided_at: NOW.toISOString(),
      decided_by_uid: "uid-admin",
      note: null,
    });
  });

  it("un bibliotecario también aprueba, y la nota se ignora", async () => {
    const { decide, requests, requestId } = setupWithPending();
    const response = await decide(postJson({ request_id: requestId, decision: "APROBADA", note: "Bienvenido." }));
    expect(DecidedTeacherRequestSchema.parse(await response.json()).note).toBeNull();
    expect(requests.all()[0]).toMatchObject({ decided_by_uid: "uid-bib", note: null });
  });

  it("un externo también puede ser aprobado", async () => {
    const { decide, requests, requestId } = setupWithPending(LIBRARIAN, "EXTERNO");
    expect((await decide(postJson({ request_id: requestId, decision: "APROBADA" }))).status).toBe(200);
    expect(requests.accountRole("uid-ana")).toBe("DOCENTE");
  });

  it.each<Role>([
    "DOCENTE",
    "BIBLIOTECARIO",
    "ADMINISTRADOR",
  ])("si la cuenta ya es %s → 409 y la solicitud sigue pendiente", async (role) => {
    const { decide, requests, requestId } = setupWithPending(LIBRARIAN, role);
    const response = await decide(postJson({ request_id: requestId, decision: "APROBADA" }));
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ code: "CONFLICTO", message: ACCOUNT_MESSAGE });
    expect(requests.all()[0]?.status).toBe("PENDIENTE");
    expect(requests.accountRole("uid-ana")).toBe(role);
  });

  it("si la cuenta ya no existe → 409 y nada cambia", async () => {
    const { decide, requests } = setup();
    const orphan = requests.seed(request("uid-sin-cuenta", "2026-11-16T15:00:00.000Z"));
    const response = await decide(postJson({ request_id: orphan.id, decision: "APROBADA" }));
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ message: ACCOUNT_MESSAGE });
    expect(requests.all()[0]?.status).toBe("PENDIENTE");
  });

  it("si falla guardar el cambio de rol → 500 y la solicitud sigue pendiente", async () => {
    const { decide, requests, requestId } = setupWithPending();
    requests.failRoleUpdates();
    const response = await decide(postJson({ request_id: requestId, decision: "APROBADA" }));
    expect(response.status).toBe(500);
    expect(requests.all()[0]?.status).toBe("PENDIENTE");
    expect(requests.accountRole("uid-ana")).toBe("ESTUDIANTE");
  });
});

describe("F12 · rechazar (regla 5)", () => {
  it("rechaza con la nota recortada y el rol no cambia", async () => {
    const { decide, requests, requestId } = setupWithPending();
    const response = await decide(
      postJson({ request_id: requestId, decision: "RECHAZADA", note: "  Falta el contrato.  " }),
    );
    expect(response.status).toBe(200);
    expect(DecidedTeacherRequestSchema.parse(await response.json())).toEqual({
      id: requestId,
      status: "RECHAZADA",
      decided_at: NOW.toISOString(),
      note: "Falta el contrato.",
    });
    expect(requests.accountRole("uid-ana")).toBe("ESTUDIANTE");
    expect(requests.all()[0]).toMatchObject({ status: "RECHAZADA", decided_by_uid: "uid-bib" });
  });

  it.each([
    ["sin nota", {}],
    ["nota vacía", { note: "" }],
    ["nota de solo espacios", { note: "     " }],
  ])("%s → note null", async (_label, extra) => {
    const { decide, requestId } = setupWithPending();
    const response = await decide(postJson({ request_id: requestId, decision: "RECHAZADA", ...extra }));
    expect(DecidedTeacherRequestSchema.parse(await response.json()).note).toBeNull();
  });

  it("nota de 500 caracteres → 200; de 501 → 400 con fields note", async () => {
    const first = setupWithPending();
    const ok = await first.decide(
      postJson({ request_id: first.requestId, decision: "RECHAZADA", note: "a".repeat(500) }),
    );
    expect(ok.status).toBe(200);
    const second = setupWithPending();
    const tooLong = await second.decide(
      postJson({ request_id: second.requestId, decision: "RECHAZADA", note: "a".repeat(501) }),
    );
    expect(tooLong.status).toBe(400);
    expect((await errorOf(tooLong)).fields?.map((field) => field.path)).toEqual(["note"]);
    expect(second.requests.all()[0]?.status).toBe("PENDIENTE");
  });
});

describe("F12 · la decisión es final (regla 3.3 y 3.5)", () => {
  it.each(["APROBADA", "RECHAZADA"] as const)("sobre una ya %s → 409 y nada cambia", async (status) => {
    const { decide, requests } = setup();
    requests.setAccountRole("uid-ana", "ESTUDIANTE");
    const decided = requests.seed(request("uid-ana", "2026-11-16T15:00:00.000Z", status));
    const response = await decide(postJson({ request_id: decided.id, decision: "APROBADA" }));
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ code: "CONFLICTO", message: DECIDED_MESSAGE });
    expect(requests.all()[0]?.status).toBe(status);
    expect(requests.accountRole("uid-ana")).toBe("ESTUDIANTE");
  });

  it("un id que no existe → 404", async () => {
    const { decide } = setup();
    const response = await decide(postJson({ request_id: "no-existe", decision: "RECHAZADA" }));
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toMatchObject({ code: "NO_ENCONTRADO", message: NOT_FOUND_MESSAGE });
  });

  it("aprobar y rechazar a la vez: una 200 y otra 409", async () => {
    const { decide, requests, requestId } = setupWithPending();
    const statuses = await Promise.all([
      decide(postJson({ request_id: requestId, decision: "APROBADA" })),
      decide(postJson({ request_id: requestId, decision: "RECHAZADA" })),
    ]).then((responses) => responses.map((response) => response.status).sort());
    expect(statuses).toEqual([200, 409]);
    expect(requests.all()).toHaveLength(1);
  });
});

describe("F12 · autorización y entrada (reglas 1, 3.2 y bordes)", () => {
  it.each<Role>(["EXTERNO", "ESTUDIANTE", "DOCENTE"])("un %s recibe 403 y nada cambia", async (role) => {
    const { decide, requests, requestId } = setupWithPending({ ...LIBRARIAN, role });
    const response = await decide(postJson({ request_id: requestId, decision: "APROBADA" }));
    expect(response.status).toBe(403);
    expect(requests.all()[0]?.status).toBe("PENDIENTE");
    expect(requests.accountRole("uid-ana")).toBe("ESTUDIANTE");
  });

  it("el rol se revisa antes que el cuerpo", async () => {
    const { decide } = setup({ ...LIBRARIAN, role: "ESTUDIANTE" });
    expect((await decide(post("no es json"))).status).toBe(403);
  });

  it("sin sesión → 401", async () => {
    const { decide, requestId } = setupWithPending(null);
    expect((await decide(postJson({ request_id: requestId, decision: "APROBADA" }))).status).toBe(401);
  });

  it("desde otro origen → 403 sin leer la sesión", async () => {
    const { decide, requests, requestId, sessionReads } = setupWithPending();
    const response = await decide(postJson({ request_id: requestId, decision: "APROBADA" }, "http://otro.test"));
    expect(response.status).toBe(403);
    expect(await errorOf(response)).toMatchObject({ message: "Origen no permitido." });
    expect(sessionReads()).toBe(0);
    expect(requests.all()[0]?.status).toBe("PENDIENTE");
  });

  it.each([
    ["una decisión desconocida", { request_id: "x", decision: "PENDIENTE" }, "decision"],
    ["sin request_id", { decision: "APROBADA" }, "request_id"],
    ["request_id de solo espacios", { request_id: "   ", decision: "APROBADA" }, "request_id"],
    ["request_id de 129 caracteres", { request_id: "a".repeat(129), decision: "APROBADA" }, "request_id"],
  ])("%s → 400 con fields %s", async (_label, body, field) => {
    const { decide } = setup();
    const response = await decide(postJson(body));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).fields?.map((item) => item.path)).toEqual([field]);
  });

  it("un cuerpo que no es JSON → 400", async () => {
    const { decide } = setup();
    expect((await decide(post("{no es json"))).status).toBe(400);
  });
});

describe("F12 · la persona ve la nota del rechazo (regla 5.3)", () => {
  it("la última solicitud trae la nota del personal", async () => {
    const { decide, service, requestId } = setupWithPending();
    await decide(postJson({ request_id: requestId, decision: "RECHAZADA", note: "Falta el contrato." }));
    const latest = await service.latest({ uid: "uid-ana", email: "uid-ana@correo.test", role: "ESTUDIANTE" });
    expect(latest).toMatchObject({ status: "RECHAZADA", note: "Falta el contrato." });
  });

  it("la pantalla la muestra como «Nota del personal: …» solo si la hay", () => {
    expect(latestRequestNote({ status: "RECHAZADA", note: "Falta el contrato." })).toBe(
      "Nota del personal: Falta el contrato.",
    );
    expect(latestRequestNote({ status: "RECHAZADA", note: null })).toBeNull();
    expect(latestRequestNote({ status: "PENDIENTE", note: null })).toBeNull();
  });
});
