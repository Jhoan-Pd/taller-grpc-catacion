import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Mesa de Catación · gRPC",
  description: "Catación de café a ciegas con calibración en vivo del panel, construida con gRPC.",
};

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="var(--cafe)" />
      <path d="M16 5c-3 4-3 8 0 11s3 7 0 11" stroke="var(--papel)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function Layout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
        />
      </head>
      <body>
        <header className="barra">
          <div className="contenedor">
            <Link href="/" className="marca"><Logo /> Mesa de Catación</Link>
            <nav className="nav">
              <Link href="/organizador">Organizar</Link>
              <Link href="/#unirse" className="opcional">Unirme</Link>
            </nav>
          </div>
        </header>
        <main className="contenedor">{children}</main>
        <footer className="pie">
          <div className="contenedor">Taller gRPC · Web y servidor gRPC desplegados en Render</div>
        </footer>
      </body>
    </html>
  );
}
