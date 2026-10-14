"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EstadoServidor from "@/components/EstadoServidor";

export default function Inicio() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const id = codigo.trim().toUpperCase();

  return (
    <div className="pila">
      <section className="hero">
        <span className="etiqueta">Taller gRPC · Catación SCA</span>
        <h1>Catación de café a ciegas, con un panel que se calibra en vivo</h1>
        <p>
          Los jueces califican tazas marcadas solo con un código. Cada calificación viaja por un
          stream bidireccional de gRPC y el servidor responde al instante si el juez está de
          acuerdo con el resto del panel. Al final se revela qué finca había detrás de cada taza.
        </p>
        <EstadoServidor />
      </section>

      <section className="rejilla rejilla-3">
        <div className="tarjeta pila">
          <span className="etiqueta">1 · Organizador</span>
          <h3>Montar la mesa</h3>
          <p className="sutil peque">Crea la sesión, sirve las muestras y revela los resultados al final.</p>
          <Link className="boton" href="/organizador">Organizar una catación</Link>
        </div>

        <div className="tarjeta pila" id="unirse">
          <span className="etiqueta">2 · Juez</span>
          <h3>Calificar tazas</h3>
          <form onSubmit={(e) => { e.preventDefault(); if (id) router.push(`/juez/${id}`); }} className="pila">
            <div>
              <label htmlFor="codigo">Código de la sesión</label>
              <input id="codigo" type="text" className="mono" placeholder="Ej. 5FDA29" value={codigo}
                onChange={(e) => setCodigo(e.target.value)} maxLength={6} autoComplete="off" />
            </div>
            <div className="botones">
              <button className="boton" disabled={!id}>Entrar como juez</button>
              <button type="button" className="boton secundario" disabled={!id}
                onClick={() => router.push(`/panel/${id}`)}>Ver panel</button>
            </div>
          </form>
        </div>

        <div className="tarjeta pila">
          <span className="etiqueta">3 · Panel</span>
          <h3>Proyectar el ranking</h3>
          <p className="sutil peque">
            El panel recibe un stream del servidor y se actualiza solo con cada taza calificada.
          </p>
        </div>
      </section>

      <section className="tarjeta">
        <h2>Cómo se usa gRPC aquí</h2>
        <div className="tabla-envoltura">
          <table>
            <thead><tr><th>RPC</th><th>Tipo</th><th>Dónde lo ves</th></tr></thead>
            <tbody>
              <tr><td className="mono">CrearSesion</td><td><span className="rpc">unary</span></td><td>Organizador · paso 1</td></tr>
              <tr><td className="mono">CargarMuestras</td><td><span className="rpc">client streaming</span></td><td>Organizador · servir la mesa</td></tr>
              <tr><td className="mono">SeguirSesion</td><td><span className="rpc">server streaming</span></td><td>Panel en vivo</td></tr>
              <tr><td className="mono">Catar</td><td><span className="rpc">bidirectional</span></td><td>Pantalla del juez y simulación del panel</td></tr>
              <tr><td className="mono">RevelarResultados</td><td><span className="rpc">unary</span></td><td>Organizador · revelar</td></tr>
            </tbody>
          </table>
        </div>
        <p className="sutil peque" style={{ marginTop: 12, marginBottom: 0 }}>
          El navegador no puede hablar gRPC nativo, así que esta web llama a sus propias rutas de API,
          y esas rutas son clientes gRPC del servidor (Python) que corre junto a ella en la nube.
        </p>
      </section>
    </div>
  );
}
