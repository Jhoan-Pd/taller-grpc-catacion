FROM python:3.12-slim

WORKDIR /app
COPY servidor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt grpcio-tools==1.84.0

COPY proto/ proto/
COPY servidor/servidor.py .
# Los stubs se generan dentro de la imagen a partir del contrato
RUN python -m grpc_tools.protoc -I proto --python_out=. --grpc_python_out=. proto/catacion.proto

ENV PYTHONUNBUFFERED=1
# Cloud Run define PORT (8080); localmente usa 50051
EXPOSE 8080
CMD ["python", "servidor.py"]
