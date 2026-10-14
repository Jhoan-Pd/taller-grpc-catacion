"use client";
import { useEffect, useState } from "react";

export default function EstadoServidor() {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    fetch("/api/salud").then((r) => r.json()).then(setEstado)
      .catch(() => setEstado({ ok: false, error: "No responde la API" }));
  }, []);
  if (!estado) return <span className="peque sutil"><span className="punto" /> Verificando servidor gRPC…</span>;
  return estado.ok ? (
    <span className="peque sutil"><span className="punto ok" /> Servidor gRPC en línea · {estado.ms} ms</span>
  ) : (
    <span className="peque" style={{ color: "var(--error)" }} title={estado.error}>
      <span className="punto mal" /> Sin conexión con el servidor gRPC ({estado.servidor || "?"})
    </span>
  );
}
