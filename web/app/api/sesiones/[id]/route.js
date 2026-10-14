import { unary, respuestaError } from "@/lib/grpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unary: ObtenerSesion
export async function GET(_req, { params }) {
  const { id } = await params;
  try {
    return Response.json(await unary("ObtenerSesion", { sesion_id: id }));
  } catch (e) {
    return respuestaError(e);
  }
}
