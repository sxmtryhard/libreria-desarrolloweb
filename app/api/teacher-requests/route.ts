import { teacherRequestHandler } from "@/features/container";

/** Pedir el rol de docente (spec F11). */
export async function POST(request: Request): Promise<Response> {
  return teacherRequestHandler(request);
}
