// Cliente gRPC del lado del servidor (rutas API de Next.js).
// El navegador no habla gRPC nativo; por eso la web llama a estas rutas y
// ellas son las que hablan gRPC con el servidor (en Render: 127.0.0.1:50051).
import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const PROTO = path.join(process.cwd(), "proto", "catacion.proto");
let cliente;

export function destino() {
  return process.env.GRPC_SERVIDOR || "localhost:50051";
}

export function getCliente() {
  if (cliente) return cliente;
  const definicion = protoLoader.loadSync(PROTO, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const paquete = grpc.loadPackageDefinition(definicion).catacion;
  const host = destino();
  const tls = process.env.GRPC_TLS ? process.env.GRPC_TLS === "true" : host.endsWith(":443");
  cliente = new paquete.Catacion(
    host,
    tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure(),
  );
  return cliente;
}

const plazo = (segundos) => ({ deadline: new Date(Date.now() + segundos * 1000) });

// ---------- Unary ----------
export function unary(metodo, solicitud, segundos = 15) {
  return new Promise((resolve, reject) => {
    getCliente()[metodo](solicitud, plazo(segundos), (err, res) => (err ? reject(err) : resolve(res)));
  });
}

// ---------- Client streaming ----------
export function cargarMuestras(sesionId, muestras) {
  return new Promise((resolve, reject) => {
    const llamada = getCliente().CargarMuestras(plazo(30), (err, res) => (err ? reject(err) : resolve(res)));
    for (const m of muestras) llamada.write({ ...m, sesion_id: sesionId });
    llamada.end();
  });
}

// ---------- Bidirectional streaming ----------
// Abre un stream Catar, envía las calificaciones (con pausas opcionales entre
// ellas) y devuelve todas las respuestas que el servidor fue emitiendo.
export function catar(calificaciones, { pausaMs = () => 0, segundos = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const llamada = getCliente().Catar(plazo(segundos));
    const respuestas = [];
    llamada.on("data", (r) => respuestas.push(r));
    llamada.on("error", reject);
    llamada.on("end", () => resolve(respuestas));
    (async () => {
      for (const c of calificaciones) {
        const espera = pausaMs();
        if (espera) await new Promise((r) => setTimeout(r, espera));
        llamada.write(c);
      }
      llamada.end();
    })();
  });
}

// ---------- Errores gRPC → HTTP ----------
const HTTP = {
  [grpc.status.NOT_FOUND]: 404,
  [grpc.status.INVALID_ARGUMENT]: 400,
  [grpc.status.FAILED_PRECONDITION]: 409,
  [grpc.status.UNAVAILABLE]: 503,
  [grpc.status.DEADLINE_EXCEEDED]: 504,
};

export function respuestaError(e) {
  const codigo = grpc.status[e.code] ?? "INTERNAL";
  let mensaje = e.details || e.message || "Error desconocido";
  if (e.code === grpc.status.UNAVAILABLE) {
    mensaje = `No se pudo conectar con el servidor gRPC (${destino()}). ¿Está desplegado y bien configurado GRPC_SERVIDOR?`;
  }
  return Response.json({ error: mensaje, codigo }, { status: HTTP[e.code] ?? 500 });
}

export { grpc };
