#!/usr/bin/env bash
# Genera el código gRPC de Python a partir del .proto para servidor y cliente.
set -e
cd "$(dirname "$0")"
for destino in servidor cliente; do
  python -m grpc_tools.protoc -I proto \
    --python_out="$destino" --grpc_python_out="$destino" proto/catacion.proto
done
echo "Stubs generados en servidor/ y cliente/"
