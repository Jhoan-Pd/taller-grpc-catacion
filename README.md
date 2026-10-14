---
title: Catación gRPC
emoji: ☕
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 10000
pinned: false
---

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
                    ┌──────────────── Contenedor en Render ────────────────┐
Navegador ──HTTPS──►│ Next.js (web + rutas API)  ──gRPC──►  Servidor gRPC  │
 (organizador,      │  puerto público               127.0.0.1:50051        │
  jueces, panel)    │  cliente gRPC (grpc-js)       (Python, grpcio)       │
                    └──────────────────────────────────────────────────────┘
```

- **Servidor** (`servidor/`): implementa el servicio `Catacion` con `grpcio`.
- **Web** (`web/`): Next.js. Cada acción del navegador llega a una ruta de API que hace la llamada
  gRPC real: `CargarMuestras` como client streaming, `Catar` como stream bidireccional y
  `SeguirSesion` (server streaming) reenviado al navegador como Server-Sent Events.
- Ambos corren en el mismo contenedor gratuito de Render (`Dockerfile` + `start.sh`).
- **Cliente de consola** (`cliente/`): habla gRPC directo con el servidor cuando corre en local.

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
servidor/servidor.py      Implementación del servicio gRPC
Dockerfile                Imagen única para Render (servidor gRPC + web)
start.sh                  Arranca ambos procesos dentro del contenedor
render.yaml               Blueprint de Render (plan gratuito)
Dockerfile.servidor       Imagen solo del servidor gRPC (alternativa Cloud Run)
cliente/cliente.py        Cliente de consola (organizador, juez, panel, simulación)
cliente/muestras.json     Seis fincas de ejemplo
web/                      App Next.js (cliente gRPC + interfaz)
web/lib/grpc.js           Conexión gRPC desde las rutas de API
web/proto/catacion.proto  Copia del contrato que usa la web
generar.sh                Genera el código gRPC de Python para servidor y cliente
DESPLIEGUE.md             Guía paso a paso del despliegue gratuito en Render
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

Web en local (Node 20 o superior), con el servidor corriendo en la terminal 1:

```bash
cd web && npm install && npm run dev      # http://localhost:3000
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

## Desplegar en la nube

Guía paso a paso en **[DESPLIEGUE.md](DESPLIEGUE.md)**. En resumen: subir el repo a GitHub y en
Render crear un **Web Service** gratuito con runtime **Docker** y `Dockerfile`
(o usar el Blueprint `render.yaml`). No requiere tarjeta.

### Probar con grpcurl (en local)

El servidor tiene *reflection* habilitado, así que grpcurl descubre el servicio sin el `.proto`:

```bash
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext localhost:50051 describe catacion.Catacion
grpcurl -plaintext -d '{"nombre":"Prueba"}' localhost:50051 catacion.Catacion/CrearSesion
```

## Guion sugerido para la exposición (≈5 min)

1. **El problema (30 s)**: en una catación los jueces no saben de qué finca es cada taza, y un juez
   descalibrado puede cambiar el ganador de un concurso.
2. **El contrato (1 min)**: mostrar `catacion.proto` y señalar los cuatro tipos de RPC.
3. **Demo en vivo (2 min)** en la URL de Render (ábrela 2 minutos antes para que despierte):
   - Proyector: el **panel en vivo** de la sesión.
   - Laptop: **Organizar** → crear sesión → servir la mesa (client streaming).
   - Pide a un compañero que entre como juez desde el celular con el código de la sesión
     y califique una taza: verá la respuesta del stream bidireccional al instante.
   - Pulsa **Simular panel de jueces**: el ranking del proyector se mueve solo (server streaming)
     y el "Juez Novato" queda marcado como descalibrado.
4. **Revelación (30 s)**: aparecen las fincas, regiones y variedades.
5. **Nube (1 min)**: en Render, la pestaña *Logs* del servicio muestra en vivo cada llamada gRPC
   que recibe el servidor ("Paula calificó 482 con 87.25").

## Preguntas que pueden hacer

- **¿Por qué no REST?** El panel en vivo y la retroalimentación del juez necesitan que el servidor
  empuje datos; con REST habría que hacer polling o montar WebSockets aparte. gRPC lo trae en el contrato.
- **¿Qué pasa si se escala a varias instancias?** Habría que sacar el estado a Redis o una base de
  datos y difundir los eventos con un pub/sub. Por eso corre una sola instancia.
- **¿Por qué la web no habla gRPC directo?** El navegador no expone HTTP/2 crudo. Las opciones son
  gRPC-Web con un proxy (Envoy) o, como aquí, un *backend for frontend*: las rutas de API de Next.js
  son clientes gRPC del servidor.
- **¿Por qué el servidor gRPC y la web van en el mismo contenedor?** El plan gratuito de Render no
  expone HTTP/2 (gRPC) a internet, pero dentro del contenedor la comunicación sí es gRPC puro.
  Con Google Cloud Run (de pago) se puede exponer el servidor gRPC públicamente: ver DESPLIEGUE.md.
- **¿Qué pasa con datos inválidos?** `Catar` no corta el stream: responde `aceptada=false` con la lista
  de errores y el juez puede corregir. Una sesión inexistente sí devuelve el estado `NOT_FOUND`.
