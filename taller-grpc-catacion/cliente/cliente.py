"""Cliente de consola para la catación de café a ciegas.

Comandos:
  crear      Crea una sesión (unary)
  cargar     Envía las muestras desde un JSON (client streaming)
  panel      Muestra el ranking en vivo (server streaming)
  juez       Califica muestras de forma interactiva (bidirectional streaming)
  simular    Simula un panel de jueces, uno de ellos descalibrado (bidirectional)
  revelar    Revela fincas y resultados finales (unary)
  demo       Hace todo lo anterior seguido, ideal para la exposición

Servidor: --servidor host:puerto o la variable CATACION_SERVIDOR.
Si el puerto es 443 (Cloud Run) se usa TLS automáticamente.
"""
import argparse
import json
import os
import queue
import random
import sys
import threading
import time

import grpc

import catacion_pb2 as pb
import catacion_pb2_grpc as rpc

ESCALA = [("fragancia", "Fragancia/Aroma"), ("sabor", "Sabor"),
          ("residual", "Sabor residual"), ("acidez", "Acidez"), ("cuerpo", "Cuerpo"),
          ("balance", "Balance"), ("puntaje_catador", "Puntaje del catador")]
TAZAS = [("uniformidad", "Uniformidad"), ("taza_limpia", "Taza limpia"), ("dulzor", "Dulzor")]


# ---------------------------------------------------------------- utilidades
def conectar(args):
    destino = args.servidor
    usar_tls = args.tls or destino.endswith(":443")
    if usar_tls:
        canal = grpc.secure_channel(destino, grpc.ssl_channel_credentials())
    else:
        canal = grpc.insecure_channel(destino)
    return rpc.CatacionStub(canal)


def imprimir_ranking(ranking, revelado=False):
    if not ranking:
        print("  (todavía no hay muestras en la mesa)")
        return
    if revelado:
        print(f"  {'#':>2}  {'Cód':<4} {'Prom':>6} {'±':>5} {'N':>2}  {'Finca':<26} {'Región':<10} "
              f"{'Variedad':<15} {'Proceso':<9} Clasificación")
    else:
        print(f"  {'#':>2}  {'Cód':<4} {'Prom':>6} {'±':>5} {'N':>2}  Clasificación")
    for p in ranking:
        prom = f"{p.promedio:6.2f}" if p.calificaciones else "   -  "
        base = f"  {p.puesto:>2}  {p.codigo:<4} {prom} {p.desviacion:5.2f} {p.calificaciones:>2}  "
        if revelado:
            base += (f"{p.finca[:26]:<26} {p.region[:10]:<10} {p.variedad[:15]:<15} "
                     f"{p.proceso[:9]:<9} ")
        print(base + p.clasificacion)


def imprimir_retro(r, detallado=True):
    if not r.aceptada:
        print(f"  ✗ Rechazada ({r.codigo_muestra}):")
        for e in r.errores:
            print(f"     - {e}")
        return
    marca = "✓" if r.calibrado else "⚠"
    panel = f" | panel ({r.otros_jueces} jueces): {r.promedio_panel:.2f}" if r.otros_jueces else ""
    print(f"  {marca} {r.juez} → muestra {r.codigo_muestra}: {r.puntaje_total:.2f}{panel}")
    if detallado:
        for o in r.observaciones:
            print(f"     · {o}")


def redondear_cuarto(v):
    return min(10.0, max(6.0, round(v * 4) / 4))


# ---------------------------------------------------------------- comandos
def cmd_crear(args):
    s = conectar(args).CrearSesion(pb.CrearSesionRequest(nombre=args.nombre))
    print(f"Sesión creada: {s.id}  ({s.nombre})")
    return s.id


def cmd_cargar(args):
    with open(args.archivo, encoding="utf-8") as f:
        muestras = json.load(f)

    def generador():  # client streaming: enviamos una muestra a la vez
        for m in muestras:
            print(f"  → enviando {m['finca']}")
            yield pb.Muestra(sesion_id=args.sesion, **m)
            time.sleep(0.2)

    resumen = conectar(args).CargarMuestras(generador())
    print(f"\n{resumen.recibidas} muestras cargadas en la sesión {resumen.sesion_id}.")
    print("Marca las tazas con estos códigos (solo el organizador los ve):")
    for a in resumen.asignaciones:
        print(f"  {a.codigo}  →  {a.finca}")


def cmd_panel(args):
    try:
        for ev in conectar(args).SeguirSesion(pb.SesionId(sesion_id=args.sesion)):
            if args.limpiar:
                print("\033[2J\033[H", end="")
            revelado = ev.tipo == pb.Evento.RESULTADOS_REVELADOS
            print(f"\n[{time.strftime('%H:%M:%S')}] {ev.mensaje}")
            imprimir_ranking(ev.ranking, revelado)
    except KeyboardInterrupt:
        pass


def pedir(texto, convertir, valido, defecto=None):
    sufijo = f" [{defecto}]" if defecto is not None else ""
    while True:
        crudo = input(f"    {texto}{sufijo}: ").strip().replace(",", ".")
        if not crudo and defecto is not None:
            return defecto
        try:
            v = convertir(crudo)
            if valido(v):
                return v
        except ValueError:
            pass
        print("      valor no válido, intenta de nuevo")


def cmd_juez(args):
    stub = conectar(args)
    sesion = stub.ObtenerSesion(pb.SesionId(sesion_id=args.sesion))
    if not sesion.codigos_muestras:
        print("La mesa todavía no tiene muestras.")
        return
    salida = queue.Queue()

    def generador():
        while True:
            cal = salida.get()
            if cal is None:
                return
            yield cal

    respuestas = stub.Catar(generador())  # bidirectional streaming
    print(f"Catación '{sesion.nombre}' — muestras: {', '.join(sesion.codigos_muestras)}")
    print("Escala 6.00–10.00 en pasos de 0.25. Enter acepta el valor por defecto.\n")
    try:
        for codigo in sesion.codigos_muestras:
            print(f"  Muestra {codigo}")
            atr = pb.Atributos()
            for campo, nombre in ESCALA:
                setattr(atr, campo, pedir(nombre, float,
                                          lambda v: 6 <= v <= 10 and (v * 4).is_integer()))
            for campo, nombre in TAZAS:
                setattr(atr, campo, pedir(f"{nombre} (tazas buenas de 5)", int,
                                          lambda v: 0 <= v <= 5, 5))
            defect = pedir("Tazas con defecto", int, lambda v: 0 <= v <= 5, 0)
            intensidad = pedir("Intensidad (2 leve / 4 grave)", int,
                               lambda v: v in (2, 4), 2) if defect else 0
            notas = input("    Notas de taza: ").strip()
            salida.put(pb.Calificacion(sesion_id=args.sesion, juez=args.nombre,
                                       codigo_muestra=codigo, atributos=atr,
                                       tazas_defectuosas=defect,
                                       intensidad_defecto=intensidad, notas=notas))
            imprimir_retro(next(respuestas))
            print()
    finally:
        salida.put(None)


def juez_simulado(stub, sesion_id, nombre, codigos, calidad, irregulares, sesgo, resultados):
    salida = queue.Queue()

    def generador():
        while True:
            cal = salida.get()
            if cal is None:
                return
            yield cal

    respuestas = stub.Catar(generador())
    for codigo in random.sample(codigos, len(codigos)):  # cada juez cata en otro orden
        time.sleep(random.uniform(0.3, 1.2))
        base = calidad[codigo]
        atr = pb.Atributos(uniformidad=5, taza_limpia=5, dulzor=5)
        for campo, _ in ESCALA:
            extra = sesgo.get(campo, 0.0)
            setattr(atr, campo, redondear_cuarto(random.gauss(base + extra, 0.15)))
        if codigo in irregulares:  # la taza es irregular para todo el panel
            atr.uniformidad = 4
        salida.put(pb.Calificacion(sesion_id=sesion_id, juez=nombre,
                                   codigo_muestra=codigo, atributos=atr))
        resultados.put(next(respuestas))
    salida.put(None)


def cmd_simular(args):
    stub = conectar(args)
    sesion = stub.ObtenerSesion(pb.SesionId(sesion_id=args.sesion))
    codigos = list(sesion.codigos_muestras)
    if not codigos:
        print("La mesa todavía no tiene muestras.")
        return
    calidad = {c: random.uniform(7.0, 9.1) for c in codigos}  # "verdad" oculta
    irregulares = {c for c in codigos if random.random() < 0.15}
    jueces = [f"Q-Grader {i}" for i in range(1, args.jueces + 1)]
    jueces.append("Juez Novato")  # este sobrevalora acidez y sabor
    sesgos = {j: {} for j in jueces}
    sesgos["Juez Novato"] = {"acidez": 1.5, "sabor": 1.0, "puntaje_catador": 1.0}
    resultados = queue.Queue()
    hilos = [threading.Thread(target=juez_simulado,
                              args=(stub, args.sesion, j, codigos, calidad, irregulares,
                                    sesgos[j], resultados))
             for j in jueces]
    print(f"Simulando {len(jueces)} jueces sobre {len(codigos)} muestras "
          f"(uno de ellos descalibrado a propósito)...\n")
    for h in hilos:
        h.start()
    pendientes = len(jueces) * len(codigos)
    while pendientes:
        imprimir_retro(resultados.get(), detallado=args.detallado)
        pendientes -= 1
    for h in hilos:
        h.join()


def cmd_revelar(args):
    r = conectar(args).RevelarResultados(pb.SesionId(sesion_id=args.sesion))
    print(f"\nResultados finales — {r.nombre}\n")
    imprimir_ranking(r.ranking, revelado=True)
    if r.ranking and r.ranking[0].calificaciones:
        g = r.ranking[0]
        print(f"\n🏆 Mejor taza: {g.finca} ({g.productor}, {g.region}) con {g.promedio:.2f} puntos")


def cmd_demo(args):
    args.sesion = cmd_crear(args)
    print(f"\nAbre el panel en otra terminal:\n  python cliente.py panel --sesion {args.sesion}"
          f" --servidor {args.servidor}\n")
    if not args.sin_pausa:
        input("Presiona Enter para cargar las muestras...")
    cmd_cargar(args)
    if not args.sin_pausa:
        input("\nPresiona Enter para que empiece el panel de jueces...")
    cmd_simular(args)
    if not args.sin_pausa:
        input("\nPresiona Enter para revelar las fincas...")
    cmd_revelar(args)


def main():
    p = argparse.ArgumentParser(description="Catación de café a ciegas con gRPC")
    p.add_argument("--servidor", default=os.environ.get("CATACION_SERVIDOR", "localhost:50051"))
    p.add_argument("--tls", action="store_true", help="forzar TLS")
    sub = p.add_subparsers(dest="comando", required=True)

    s = sub.add_parser("crear"); s.add_argument("--nombre", default="Catación del taller")
    s = sub.add_parser("cargar"); s.add_argument("--sesion", required=True)
    s.add_argument("--archivo", default="muestras.json")
    s = sub.add_parser("panel"); s.add_argument("--sesion", required=True)
    s.add_argument("--limpiar", action="store_true", help="limpiar pantalla en cada evento")
    s = sub.add_parser("juez"); s.add_argument("--sesion", required=True)
    s.add_argument("--nombre", required=True)
    s = sub.add_parser("simular"); s.add_argument("--sesion", required=True)
    s.add_argument("--jueces", type=int, default=5)
    s.add_argument("--detallado", action="store_true")
    s = sub.add_parser("revelar"); s.add_argument("--sesion", required=True)
    s = sub.add_parser("demo"); s.add_argument("--nombre", default="Catación del taller")
    s.add_argument("--archivo", default="muestras.json")
    s.add_argument("--jueces", type=int, default=5)
    s.add_argument("--detallado", action="store_true")
    s.add_argument("--sin-pausa", action="store_true")

    args = p.parse_args()
    comandos = {"crear": cmd_crear, "cargar": cmd_cargar, "panel": cmd_panel,
                "juez": cmd_juez, "simular": cmd_simular, "revelar": cmd_revelar,
                "demo": cmd_demo}
    if hasattr(args, "sesion") and args.sesion:
        args.sesion = args.sesion.strip().upper()
    try:
        comandos[args.comando](args)
    except grpc.RpcError as e:
        print(f"\nError gRPC [{e.code().name}]: {e.details()}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
