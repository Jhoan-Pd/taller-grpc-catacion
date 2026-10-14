import { unary, respuestaError } from "@/lib/grpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unary: CrearSesion
export async function POST(req) {
  const { nombre = "" } = await req.json().catch(() => ({}));
  try {
    return Response.json(await unary("CrearSesion", { nombre: String(nombre).slice(0, 80) }));
  } catch (e) {
    return respuestaError(e);
  }
}
