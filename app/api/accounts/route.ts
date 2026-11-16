import { registerAccountHandler } from "@/features/container";

/** Registrar una cuenta desde el mostrador (spec F3). */
export async function POST(request: Request): Promise<Response> {
  return registerAccountHandler(request);
}
