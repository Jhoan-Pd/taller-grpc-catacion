"""Servidor gRPC de catación de café a ciegas.

Guarda el estado en memoria (suficiente para el taller). En Cloud Run se
despliega con --max-instances 1 para que todos los jueces vean el mismo estado.
"""
import logging
import os
import queue
import random
import statistics
import threading
import uuid
from concurrent import futures

import grpc
from grpc_reflection.v1alpha import reflection

import catacion_pb2 as pb
import catacion_pb2_grpc as rpc

ATRIBUTOS_ESCALA = ["fragancia", "sabor", "residual", "acidez",
                    "cuerpo", "balance", "puntaje_catador"]
ATRIBUTOS_TAZAS = ["uniformidad", "taza_limpia", "dulzor"]
NOMBRES = {
    "fragancia": "Fragancia/Aroma", "sabor": "Sabor", "residual": "Sabor residual",
    "acidez": "Acidez", "cuerpo": "Cuerpo", "balance": "Balance",
    "puntaje_catador": "Puntaje del catador",
}
UMBRAL_ATRIBUTO = 1.0   # diferencia con el panel que dispara una observación
MIN_PANEL = 3          # jueces previos necesarios para opinar sobre calibración
UMBRAL_TOTAL = 2.0      # diferencia máxima en el total para considerarse calibrado
# Se compara contra la MEDIANA de los otros jueces: así un juez descalibrado
# no arrastra al resto del panel.

log = logging.getLogger("catacion")


def clasificar(puntaje):
    if puntaje >= 90:
        return "Especialidad - Excepcional"
    if puntaje >= 85:
        return "Especialidad - Excelente"
    if puntaje >= 80:
        return "Especialidad - Muy bueno"
    return "No especialidad"


def puntaje_total(cal):
    a = cal.atributos
    escala = sum(getattr(a, n) for n in ATRIBUTOS_ESCALA)
    tazas = 2 * sum(getattr(a, n) for n in ATRIBUTOS_TAZAS)
    defectos = cal.tazas_defectuosas * cal.intensidad_defecto
    return round(escala + tazas - defectos, 2)


def validar(cal):
    errores = []
    if not cal.juez.strip():
        errores.append("Falta el nombre del juez")
    for n in ATRIBUTOS_ESCALA:
        v = getattr(cal.atributos, n)
        if not (6.0 <= v <= 10.0) or abs(v * 4 - round(v * 4)) > 1e-9:
            errores.append(f"{NOMBRES[n]} debe ir de 6.00 a 10.00 en pasos de 0.25 (llegó {v})")
    for n in ATRIBUTOS_TAZAS:
        v = getattr(cal.atributos, n)
        if not (0 <= v <= 5):
            errores.append(f"{n} es el número de tazas buenas, de 0 a 5 (llegó {v})")
    if not (0 <= cal.tazas_defectuosas <= 5):
        errores.append("tazas_defectuosas va de 0 a 5")
    if cal.tazas_defectuosas > 0 and cal.intensidad_defecto not in (2, 4):
        errores.append("intensidad_defecto debe ser 2 (leve) o 4 (falla grave)")
    return errores


class SesionCatacion:
    def __init__(self, nombre):
        self.id = uuid.uuid4().hex[:6].upper()
        self.nombre = nombre
        self.muestras = {}         # codigo -> pb.Muestra
        self.calificaciones = {}   # codigo -> {juez: (total, pb.Atributos)}
        self.revelada = False
        self.suscriptores = set()  # colas de los clientes de SeguirSesion

    def nuevo_codigo(self):
        while True:
            codigo = str(random.randint(100, 999))
            if codigo not in self.muestras:
                return codigo

    def ranking(self):
        filas = []
        for codigo, m in self.muestras.items():
            totales = [t for t, _ in self.calificaciones.get(codigo, {}).values()]
            prom = statistics.mean(totales) if totales else 0.0
            desv = statistics.pstdev(totales) if len(totales) > 1 else 0.0
            p = pb.Posicion(
                codigo=codigo, promedio=round(prom, 2), desviacion=round(desv, 2),
                calificaciones=len(totales),
                clasificacion=clasificar(prom) if totales else "Sin calificar",
            )
            if self.revelada:
                p.finca, p.productor, p.region = m.finca, m.productor, m.region
                p.variedad, p.proceso = m.variedad, m.proceso
            filas.append(p)
        filas.sort(key=lambda p: (p.calificaciones == 0, -p.promedio))
        for i, p in enumerate(filas, 1):
            p.puesto = i
        return filas

    def evento(self, tipo, mensaje):
        return pb.Evento(tipo=tipo, mensaje=mensaje, ranking=self.ranking())

    def difundir(self, tipo, mensaje):
        ev = self.evento(tipo, mensaje)
        for q in list(self.suscriptores):
            q.put(ev)


class ServicioCatacion(rpc.CatacionServicer):
    def __init__(self):
        self.sesiones = {}
        self.lock = threading.Lock()

    def _sesion(self, sesion_id, context):
        s = self.sesiones.get(sesion_id.strip().upper())
        if s is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"No existe la sesión '{sesion_id}'")
        return s

    def _a_mensaje(self, s):
        return pb.Sesion(id=s.id, nombre=s.nombre, revelada=s.revelada,
                         codigos_muestras=list(s.muestras))

    # ---------- Unary ----------
    def CrearSesion(self, request, context):
        nombre = request.nombre.strip() or "Catación sin nombre"
        with self.lock:
            s = SesionCatacion(nombre)
            self.sesiones[s.id] = s
        log.info("Sesión creada %s (%s)", s.id, nombre)
        return self._a_mensaje(s)

    def ObtenerSesion(self, request, context):
        with self.lock:
            return self._a_mensaje(self._sesion(request.sesion_id, context))

    def RevelarResultados(self, request, context):
        with self.lock:
            s = self._sesion(request.sesion_id, context)
            s.revelada = True
            s.difundir(pb.Evento.RESULTADOS_REVELADOS,
                       f"Se revelaron los resultados de '{s.nombre}'")
            log.info("Sesión %s revelada", s.id)
            return pb.Resultados(sesion_id=s.id, nombre=s.nombre, ranking=s.ranking())

    # ---------- Client streaming ----------
    def CargarMuestras(self, request_iterator, context):
        asignaciones, sesion_id = [], ""
        for m in request_iterator:
            with self.lock:
                s = self._sesion(m.sesion_id, context)
                if s.revelada:
                    context.abort(grpc.StatusCode.FAILED_PRECONDITION,
                                  "La sesión ya fue revelada")
                codigo = s.nuevo_codigo()
                s.muestras[codigo] = m
                sesion_id = s.id
                s.difundir(pb.Evento.MUESTRA_AGREGADA,
                           f"Nueva muestra en la mesa: {codigo}")
            asignaciones.append(pb.CodigoAsignado(codigo=codigo, finca=m.finca))
            log.info("Sesión %s: muestra %s cargada", sesion_id, codigo)
        return pb.ResumenCarga(sesion_id=sesion_id, recibidas=len(asignaciones),
                               asignaciones=asignaciones)

    # ---------- Server streaming ----------
    def SeguirSesion(self, request, context):
        cola = queue.Queue()
        with self.lock:
            s = self._sesion(request.sesion_id, context)
            s.suscriptores.add(cola)
            inicial = s.evento(pb.Evento.CONEXION, f"Conectado al panel de '{s.nombre}'")
        log.info("Panel conectado a %s", s.id)
        try:
            yield inicial
            while context.is_active():
                try:
                    ev = cola.get(timeout=1)
                except queue.Empty:
                    continue
                yield ev
                if ev.tipo == pb.Evento.RESULTADOS_REVELADOS:
                    break
        finally:
            with self.lock:
                s.suscriptores.discard(cola)

    # ---------- Bidirectional streaming ----------
    def Catar(self, request_iterator, context):
        for cal in request_iterator:
            respuesta = self._procesar_calificacion(cal)
            yield respuesta

    def _procesar_calificacion(self, cal):
        errores = validar(cal)
        with self.lock:
            s = self.sesiones.get(cal.sesion_id.strip().upper())
            if s is None:
                errores.append(f"No existe la sesión '{cal.sesion_id}'")
            elif s.revelada:
                errores.append("La sesión ya fue revelada; no se aceptan más calificaciones")
            elif cal.codigo_muestra not in s.muestras:
                errores.append(f"La muestra {cal.codigo_muestra} no está en esta mesa")
            if errores:
                return pb.Retroalimentacion(codigo_muestra=cal.codigo_muestra,
                                            juez=cal.juez, aceptada=False, errores=errores)

            total = puntaje_total(cal)
            notas_muestra = s.calificaciones.setdefault(cal.codigo_muestra, {})
            juez = cal.juez.strip()
            corrigio = juez in notas_muestra
            otros = {j: v for j, v in notas_muestra.items() if j != juez}
            atr = pb.Atributos()
            atr.CopyFrom(cal.atributos)
            notas_muestra[juez] = (total, atr)

            r = pb.Retroalimentacion(codigo_muestra=cal.codigo_muestra, juez=juez,
                                     aceptada=True, puntaje_total=total,
                                     otros_jueces=len(otros))
            if corrigio:
                r.observaciones.append("Calificación corregida: se reemplazó la anterior")
            if len(otros) < MIN_PANEL:
                r.calibrado = True
                if otros:
                    r.promedio_panel = round(statistics.median(t for t, _ in otros.values()), 2)
                r.observaciones.append(
                    f"Calibración pendiente: se necesitan al menos {MIN_PANEL} jueces más "
                    f"en esta muestra (hay {len(otros)})")
            else:
                prom_total = statistics.median(t for t, _ in otros.values())
                r.promedio_panel = round(prom_total, 2)
                alertas = []
                for n in ATRIBUTOS_ESCALA:
                    prom = statistics.median(getattr(a, n) for _, a in otros.values())
                    dif = getattr(atr, n) - prom
                    if abs(dif) >= UMBRAL_ATRIBUTO:
                        alertas.append(f"{NOMBRES[n]}: tú {getattr(atr, n):.2f} vs panel "
                                       f"{prom:.2f} ({dif:+.2f})")
                r.calibrado = abs(total - prom_total) <= UMBRAL_TOTAL and not alertas
                r.observaciones.extend(alertas)
                if r.calibrado:
                    r.observaciones.append("Calibrado con el panel")
                else:
                    r.observaciones.append(
                        f"Descalibrado: tu total difiere {total - prom_total:+.2f} del panel")

            s.difundir(pb.Evento.CALIFICACION_RECIBIDA,
                       f"{juez} calificó la muestra {cal.codigo_muestra}")
        log.info("Sesión %s: %s calificó %s con %.2f", s.id, juez, cal.codigo_muestra, total)
        return r


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    # Cloud Run inyecta PORT. En Render la web usa PORT, así que el servidor gRPC
    # escucha en GRPC_PORT (interno) y en GRPC_HOST (127.0.0.1 dentro del contenedor).
    puerto = os.environ.get("GRPC_PORT") or os.environ.get("PORT", "50051")
    host = os.environ.get("GRPC_HOST", "[::]")
    servidor = grpc.server(futures.ThreadPoolExecutor(max_workers=64))
    rpc.add_CatacionServicer_to_server(ServicioCatacion(), servidor)
    # Reflection: permite explorar el servicio con grpcurl sin tener el .proto
    reflection.enable_server_reflection(
        (pb.DESCRIPTOR.services_by_name["Catacion"].full_name, reflection.SERVICE_NAME),
        servidor)
    servidor.add_insecure_port(f"{host}:{puerto}")
    servidor.start()
    log.info("Servidor de catación escuchando en %s:%s", host, puerto)
    servidor.wait_for_termination()


if __name__ == "__main__":
    main()
