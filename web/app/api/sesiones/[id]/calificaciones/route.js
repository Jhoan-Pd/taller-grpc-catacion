import { catar, respuestaError } from "@/lib/grpc";
import { ESCALA, TAZAS } from "@/lib/sca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bidirectional streaming: Catar. Acepta una calificación o una lista; todas
// viajan por el mismo stream y cada una recibe su propia retroalimentación.
export async function POST(req, { params }) {
  const { id } = await params;
  const cuerpo = await req.json().catch(() => null);
  const lista = Array.isArray(cuerpo) ? cuerpo : cuerpo ? [cuerpo] : [];
  if (!lista.length || lista.length > 30) {
    return Response.json({ error: "Envía entre 1 y 30 calificaciones" }, { status: 400 });
  }
  const calificaciones = lista.map((c) => ({
    sesion_id: id,
    juez: String(c.juez ?? "").slice(0, 40),
    codigo_muestra: String(c.codigo_muestra ?? ""),
    atributos: Object.fromEntries([
      ...ESCALA.map(({ campo }) => [campo, Number(c.atributos?.[campo]) || 0]),
      ...TAZAS.map(({ campo }) => [campo, Math.trunc(Number(c.atributos?.[campo]) || 0)]),
    ]),
    tazas_defectuosas: Math.trunc(Number(c.tazas_defectuosas) || 0),
    intensidad_defecto: Math.trunc(Number(c.intensidad_defecto) || 0),
    notas: String(c.notas ?? "").slice(0, 200),
  }));
  try {
    const respuestas = await catar(calificaciones);
    return Response.json(Array.isArray(cuerpo) ? respuestas : respuestas[0]);
  } catch (e) {
    return respuestaError(e);
  }
}
