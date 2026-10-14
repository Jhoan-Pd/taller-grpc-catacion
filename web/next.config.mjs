/** @type {import('next').NextConfig} */
const nextConfig = {
  // El .proto se lee en tiempo de ejecución: hay que incluirlo en las funciones de Vercel
  outputFileTracingIncludes: {
    "/api/**/*": ["./proto/**/*"],
  },
  serverExternalPackages: ["@grpc/grpc-js", "@grpc/proto-loader"],
};

export default nextConfig;
