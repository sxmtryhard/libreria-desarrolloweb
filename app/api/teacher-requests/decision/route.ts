import { teacherDecisionHandler } from "@/features/container";

/** Aprobar o rechazar una solicitud de docente (spec F12). */
export async function POST(request: Request): Promise<Response> {
  return teacherDecisionHandler(request);
}
