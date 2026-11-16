import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { MyTeacherRequest } from "@/features/accounts/schema";
import { TeacherRequestForm } from "@/features/accounts/ui/teacher-request-form";
import {
  latestRequestMessage,
  latestRequestNote,
  TEACHER_REQUEST_MESSAGES,
  teacherRequestScreen,
} from "@/features/accounts/ui/teacher-request-view";
import { currentSession, teacherRequestService } from "@/features/container";
import { formatLibraryDateTime } from "@/features/loans/ui/my-loans-view";

export const metadata: Metadata = {
  title: "Solicitar docente · Biblioteca de préstamos",
};

/** Estado de la última solicitud (F11 regla 5.4). El motivo solo se ve si está pendiente; la nota, si fue rechazada (F12 5.3). */
function LatestRequest({ request }: { request: MyTeacherRequest }) {
  const note = latestRequestNote(request);
  return (
    <article className="mt-6 rounded-lg border border-line bg-surface-alt p-4">
      <h2 className="text-lg font-semibold text-primary-strong">{latestRequestMessage(request.status)}</h2>
      <p className="mt-2 text-ink-muted">
        Enviada el <time dateTime={request.requested_at}>{formatLibraryDateTime(request.requested_at)}</time>
      </p>
      {request.status === "PENDIENTE" && <p className="mt-2 break-words">Motivo: {request.reason}</p>}
      {note !== null && <p className="mt-2 break-words">{note}</p>}
    </article>
  );
}

/** Quién ve qué (spec F11, regla 5): sin sesión → `/ingresar`; docente y personal → aviso; los demás → estado y formulario. */
async function TeacherRequestGate() {
  const session = await currentSession();
  if (session === null) {
    redirect("/ingresar");
  }
  let latest: MyTeacherRequest | null = null;
  if (session.role === "EXTERNO" || session.role === "ESTUDIANTE") {
    latest = await teacherRequestService.latest(session);
  }
  const screen = teacherRequestScreen(session.role, latest);
  if (screen.kind === "teacher") {
    return (
      <p role="status" className="mt-6 font-semibold">
        {TEACHER_REQUEST_MESSAGES.alreadyTeacher}
      </p>
    );
  }
  if (screen.kind === "staff") {
    return (
      <p role="status" className="mt-6 font-semibold">
        {TEACHER_REQUEST_MESSAGES.staffOnly}
      </p>
    );
  }
  return (
    <>
      {screen.latest !== null && <LatestRequest request={screen.latest} />}
      <TeacherRequestForm showForm={screen.showForm} />
    </>
  );
}

export default function TeacherRequestPage() {
  return (
    <section aria-labelledby="solicitar-docente-titulo" className="mx-auto w-full max-w-2xl">
      <h1 id="solicitar-docente-titulo" className="text-3xl font-bold text-primary-strong">
        Solicitar el rol de docente
      </h1>
      <p className="mt-2 text-ink-muted">
        Cuéntale al personal de la biblioteca por qué necesitas el rol de docente. Lo revisarán y te responderán aquí.
      </p>
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <TeacherRequestGate />
      </Suspense>
    </section>
  );
}
