# Imagen única (plan gratuito de Render o Hugging Face Spaces): servidor gRPC + web Next.js.
# La web (puerto público $PORT) es cliente gRPC del servidor (127.0.0.1:50051).
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*

# ---------- Servidor gRPC (Python) ----------
WORKDIR /app
COPY servidor/requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt grpcio-tools==1.84.0
COPY proto/ proto/
COPY servidor/servidor.py .
RUN python3 -m grpc_tools.protoc -I proto --python_out=. --grpc_python_out=. proto/catacion.proto

# ---------- Web (Next.js) ----------
WORKDIR /web
COPY web/package.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

COPY start.sh /start.sh
# Hugging Face Spaces ejecuta el contenedor como el usuario 1000 ("node" en esta imagen)
RUN chown -R node:node /app /web
USER node

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    GRPC_HOST=127.0.0.1 \
    GRPC_PORT=50051 \
    GRPC_SERVIDOR=127.0.0.1:50051 \
    PORT=10000
EXPOSE 10000
CMD ["sh", "/start.sh"]
