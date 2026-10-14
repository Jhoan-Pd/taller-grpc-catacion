# Despliegue gratuito en Render

Todo corre en **un solo servicio gratuito de Render** (sin tarjeta de crédito):

```
                    ┌──────────────── Contenedor en Render ────────────────┐
Navegador ──HTTPS──►│ Next.js (web + rutas API)  ──gRPC──►  Servidor gRPC  │
 (organizador,      │  puerto público $PORT        127.0.0.1:50051 (Python)│
  jueces, panel)    └──────────────────────────────────────────────────────┘
```

- La web es **cliente gRPC** del servidor: usa los cuatro tipos de RPC, incluido el streaming
  bidireccional de `Catar`.
- El servidor gRPC escucha solo dentro del contenedor. Render no expone gRPC (HTTP/2) a internet
  en servicios públicos, por eso la web y el servidor viajan juntos.
- Archivos que usa Render: `Dockerfile`, `start.sh` y `render.yaml`. La misma imagen sirve en Hugging Face Spaces.

## Paso 1 · Subir el código a GitHub

El repositorio debe contener la carpeta del proyecto completa (`proto`, `servidor`, `web`,
`Dockerfile`, `start.sh`, `render.yaml`…). Por ejemplo, desde una terminal con git:

```bash
cd taller-grpc-catacion
git init && git add . && git commit -m "Taller gRPC: catación de café"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/taller-grpc-catacion.git
git push -u origin main
```

## Paso 2 · Crear el servicio en Render

1. Crea una cuenta gratuita en <https://render.com> (puedes entrar con GitHub).
2. **New → Web Service**.
3. Conecta tu repositorio, o en **Public Git Repository** pega la URL del repo si es público.
4. Configura:

   | Campo | Valor |
   |---|---|
   | Name | `catacion-grpc` |
   | Language / Runtime | **Docker** |
   | Branch | `main` |
   | Dockerfile Path | `./Dockerfile` |
   | Instance Type | **Free** |
   | Health Check Path (en *Advanced*) | `/api/salud` |

   No hace falta ninguna variable de entorno: el Dockerfile ya trae `GRPC_SERVIDOR=127.0.0.1:50051`.
5. **Deploy Web Service**. La primera construcción tarda unos 5–8 minutos.

Alternativa: **New → Blueprint** y elegir el repo; Render lee `render.yaml` y crea el servicio solo.

## Paso 3 · Verificar

- `https://catacion-grpc-XXXX.onrender.com/api/salud` → `{"ok":true,"servidor":"127.0.0.1:50051",...}`
- En la página de inicio debe aparecer **● Servidor gRPC en línea**.
- **Organizar** → crear sesión → servir la mesa → abrir el panel → simular jueces → revelar.

## Ojo con el plan gratuito

| Situación | Qué pasa | Qué hacer |
|---|---|---|
| 15 min sin visitas | Render apaga el contenedor y se borran las sesiones (están en memoria) | Abre la URL 1–2 minutos antes de exponer y crea la sesión en ese momento |
| Primera visita tras dormir | Tarda ~1 minuto en despertar | Normal; recarga cuando cargue |
| Cambias código | `git push` y Render redespliega solo | — |

## Plan B gratuito · Hugging Face Spaces (sin tarjeta)

Si Render pidiera tarjeta, la misma imagen funciona en Hugging Face Spaces (2 CPU, 16 GB de RAM, gratis):

1. Crea una cuenta en <https://huggingface.co> y un token con permiso **Write**
   (*Settings → Access Tokens*).
2. **New Space** → SDK **Docker** → plantilla **Blank** → visibilidad **Public**.
3. Sube el contenido del proyecto al repositorio del Space con git
   (`git push https://huggingface.co/spaces/TU_USUARIO/catacion-grpc main`, usando el token como contraseña).
   El `README.md` ya trae la cabecera que Hugging Face necesita (`sdk: docker`, `app_port: 10000`).
4. La URL queda como `https://TU_USUARIO-catacion-grpc.hf.space`. El Space se duerme tras 48 h sin uso.

## Alternativa con Google Cloud Run (requiere facturación activa)

`Dockerfile.servidor` contiene solo el servidor gRPC con gRPC público (HTTP/2). Cloud Run usa el
archivo llamado `Dockerfile`, así que primero se intercambian:

```bash
cp Dockerfile Dockerfile.web && cp Dockerfile.servidor Dockerfile
gcloud run deploy catacion-grpc --source . --region us-central1 \
  --allow-unauthenticated --use-http2 --max-instances 1 --timeout 3600
```

Con eso la web puede ir en Vercel (Root Directory `web`, variable
`GRPC_SERVIDOR=<url-de-cloud-run>:443`) y el cliente de consola puede conectarse desde cualquier lugar.
