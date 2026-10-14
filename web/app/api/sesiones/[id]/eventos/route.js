import { getCliente, grpc } from "@/lib/grpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// En plataformas serverless (Vercel) la función tiene duración máxima; si se corta, el
// navegador (EventSource) se reconecta solo y recibe el ranking completo.
export const maxDuration = 60;

// Server streaming: SeguirSesion → reenviado al navegador como Server-Sent Events
export async function GET(req, { params }) {
  const { id } = await params;
  const llamada = getCliente().SeguirSesion({ sesion_id: id });
  const enc = new TextEncoder();
  let cerrado = false;

  const stream = new ReadableStream({
    start(controller) {
      const enviar = (texto) => {
        if (!cerrado) controller.enqueue(enc.encode(texto));
      };
      const cerrar = () => {
        if (cerrado) return;
        cerrado = true;
        clearInterval(latido);
        try { controller.close(); } catch {}
      };
      const latido = setInterval(() => enviar(": latido\n\n"), 15000);

      enviar("retry: 2000\n\n");
      llamada.on("data", (ev) => enviar(`event: evento\ndata: ${JSON.stringify(ev)}\n\n`));
      llamada.on("error", (e) => {
        if (e.code !== grpc.status.CANCELLED) {
          enviar(`event: fallo\ndata: ${JSON.stringify({ error: e.details || e.message, codigo: grpc.status[e.code] })}\n\n`);
        }
        cerrar();
      });
      llamada.on("end", cerrar);
      req.signal.addEventListener("abort", () => {
        llamada.cancel();
        cerrar();
      });
    },
    cancel() {
      cerrado = true;
      llamada.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
