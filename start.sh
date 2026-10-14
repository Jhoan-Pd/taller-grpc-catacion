#!/bin/sh
# Arranca el servidor gRPC (interno) y la web (pública) en el mismo contenedor.
set -e

cd "${APP_DIR:-/app}"
python3 servidor.py &

# Espera a que el puerto gRPC esté escuchando (máx. ~15 s)
i=0
until python3 -c "import socket; socket.create_connection(('127.0.0.1', int('${GRPC_PORT:-50051}')), 1)" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -ge 30 ] && echo "El servidor gRPC no arrancó" && exit 1
  sleep 0.5
done
echo "Servidor gRPC listo en 127.0.0.1:${GRPC_PORT:-50051}"

cd "${WEB_DIR:-/web}"
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-10000}"
