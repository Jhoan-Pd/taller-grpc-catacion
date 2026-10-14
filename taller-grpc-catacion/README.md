# Taller gRPC — Catación de café a ciegas ☕

App distribuida para conducir una **catación de café a ciegas** con el protocolo de la SCA
(Specialty Coffee Association). Los jueces califican tazas identificadas solo con un código
de 3 dígitos; el servidor les dice **en tiempo real** si están calibrados con el resto del
panel y, al final, el organizador **revela** qué finca había detrás de cada código.

## Por qué gRPC encaja en este caso

| Necesidad del caso | Lo que aporta gRPC |
|---|---|
| El juez necesita retroalimentación inmediata por cada taza | Streaming bidireccional sobre una sola conexión HTTP/2 |
| El panel del organizador se actualiza solo, sin refrescar | Server streaming (el servidor empuja eventos) |
| Las muestras se cargan una a una al servir la mesa | Client streaming |
| Un formulario SCA con 10 atributos y reglas estrictas | Contrato tipado en `.proto`, mensajes binarios compactos |
| Clientes en distintos lenguajes (consola, móvil, web) | Código generado a partir del mismo `.proto` |

## Los cuatro tipos de RPC

| RPC | Tipo | Quién lo usa | Qué hace |
|---|---|---|---|
| `CrearSesion` | Unary | Organizador | Abre una sesión de catación y devuelve su ID |
| `ObtenerSesion` | Unary | Jueces | Consulta los códigos ciegos de la mesa |
| `CargarMuestras` | **Client streaming** | Organizador | Envía las fincas una por una; al cerrar el stream recibe el código ciego de cada una |
| `SeguirSesion` | **Server streaming** | Panel / proyector | Recibe eventos y el ranking actualizado cada vez que alguien califica |
| `Catar` | **Bidirectional streaming** | Jueces | Envía calificaciones y recibe por cada una su puntaje y el veredicto de calibración |
| `RevelarResultados` | Unary | Organizador | Rompe el anonimato y publica el ranking con las fincas |

## Arquitectura

```
 Organizador ──CrearSesion / CargarMuestras / RevelarResultados──┐
                                                                 │
 Juez 1 ─┐                                                       ▼
 Juez 2 ─┼──── Catar (stream ⇄ stream) ───────────►  Servidor gRPC (Python)
 Juez N ─┘                                            en Google Cloud Run
                                                                 │
 Panel en vivo ◄──────── SeguirSesion (stream) ──────────────────┘
```

## Reglas de negocio (formulario SCA)

- Fragancia, sabor, sabor residual, acidez, cuerpo, balance y puntaje del catador:
  de **6.00 a 10.00 en pasos de 0.25**.
- Uniformidad, taza limpia y dulzor: tazas buenas de 5, cada una vale **2 puntos**.
- Defectos: `tazas defectuosas × intensidad` (2 leve, 4 falla grave) se restan.
- Total máximo: 100. Clasificación: ≥90 Excepcional, ≥85 Excelente, ≥80 Muy bueno,
  <80 no es café de especialidad.
- **Calibración**: cuando la muestra ya tiene al menos 3 jueces previos, se compara al juez
  con la **mediana** de ellos. Queda descalibrado si su total se aleja más de 2 puntos o
  si algún atributo se aleja 1 punto o más. Se usa la mediana para que un juez desviado no
  arrastre al panel.

## Estructura

```
proto/catacion.proto      Contrato del servicio (fuente de verdad)
servidor/servidor.py      Implementación del servicio
cliente/cliente.py        Cliente de consola (organizador, juez, panel, simulación)
cliente/muestras.json     Seis fincas de ejemplo
generar.sh                Genera el código gRPC para servidor y cliente
Dockerfile                Imagen del servidor para Cloud Run
```

## Correr en local

Requiere Python 3.10 o superior.

```bash
pip install -r cliente/requirements.txt grpcio-reflection
./generar.sh                      # en Windows: ejecuta los dos comandos protoc del script

# Terminal 1: servidor
cd servidor && python servidor.py

# Terminal 2: demo completa (crea sesión, carga muestras, simula jueces, revela)
cd cliente && python cliente.py demo

# Terminal 3: panel en vivo (usa el ID de sesión que imprime la demo)
cd cliente && python cliente.py panel --sesion ABC123
```

Comandos sueltos del cliente:

```bash
python cliente.py crear --nombre "Concurso Taza de la Excelencia"
python cliente.py cargar  --sesion ABC123 --archivo muestras.json
python cliente.py panel   --sesion ABC123
python cliente.py juez    --sesion ABC123 --nombre "Paula"     # calificar a mano
python cliente.py simular --sesion ABC123 --jueces 5            # 5 Q-Graders + 1 novato
python cliente.py revelar --sesion ABC123
```

## Desplegar en la nube (Google Cloud Run)

Cloud Run soporta gRPC, incluido el streaming, si se activa HTTP/2 de extremo a extremo.

```bash
gcloud auth login
gcloud config set project TU_PROYECTO
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Desde la raíz del proyecto (usa el Dockerfile)
gcloud run deploy catacion-grpc \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --use-http2 \
  --max-instances 1 \
  --timeout 3600
```

- `--use-http2`: obligatorio para gRPC.
- `--max-instances 1`: el estado vive en memoria; con una sola instancia todos los jueces ven la misma sesión.
- `--timeout 3600`: los streams (panel y jueces) pueden durar hasta una hora.

Cloud Run devuelve una URL como `https://catacion-grpc-xxxxx-uc.a.run.app`. Conéctate con el puerto 443
(el cliente activa TLS solo):

```bash
export CATACION_SERVIDOR=catacion-grpc-xxxxx-uc.a.run.app:443
python cliente.py demo
```

### Probar sin cliente, con grpcurl

El servidor tiene *reflection* habilitado, así que grpcurl descubre el servicio sin el `.proto`:

```bash
grpcurl catacion-grpc-xxxxx-uc.a.run.app:443 list
grpcurl catacion-grpc-xxxxx-uc.a.run.app:443 describe catacion.Catacion
grpcurl -d '{"nombre":"Prueba"}' catacion-grpc-xxxxx-uc.a.run.app:443 catacion.Catacion/CrearSesion
```

## Guion sugerido para la exposición (≈5 min)

1. **El problema (30 s)**: en una catación los jueces no saben de qué finca es cada taza, y un juez
   descalibrado puede cambiar el ganador de un concurso.
2. **El contrato (1 min)**: mostrar `catacion.proto` y señalar los cuatro tipos de RPC.
3. **Demo en vivo (2 min)**, con el servidor ya desplegado en Cloud Run:
   - Pantalla izquierda: `python cliente.py panel --sesion …`
   - Pantalla derecha: `python cliente.py demo`
   - Mostrar cómo el panel se actualiza solo (server streaming) y cómo el "Juez Novato" recibe
     alertas de descalibración en acidez y sabor (bidireccional).
4. **Revelación (30 s)**: aparecen las fincas, regiones y variedades.
5. **Nube (1 min)**: consola de Cloud Run con los logs llegando en vivo, y `grpcurl list` contra la URL pública.

## Preguntas que pueden hacer

- **¿Por qué no REST?** El panel en vivo y la retroalimentación del juez necesitan que el servidor
  empuje datos; con REST habría que hacer polling o montar WebSockets aparte. gRPC lo trae en el contrato.
- **¿Qué pasa si se escala a varias instancias?** Habría que sacar el estado a Redis o Firestore y
  difundir los eventos con Pub/Sub. Por eso se fija `--max-instances 1`.
- **¿Se puede usar desde un navegador?** No directamente: el navegador no expone HTTP/2 crudo.
  Se necesita gRPC-Web con un proxy como Envoy.
- **¿Qué pasa con datos inválidos?** `Catar` no corta el stream: responde `aceptada=false` con la lista
  de errores y el juez puede corregir. Una sesión inexistente sí devuelve el estado `NOT_FOUND`.
