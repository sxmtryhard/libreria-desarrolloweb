import { pendingTeacherRequestsHandler } from "@/features/container";

/** Ver las solicitudes de docente pendientes (spec F12). */
export async function GET(request: Request): Promise<Response> {
  return pendingTeacherRequestsHandler(request);
}
