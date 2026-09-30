import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host?.includes("localhost") ? "http" : "https");
  const imageUrl = host ? `${protocol}://${host}/og.png` : "/og.png";
  return {
    title: "Camisa 10 | Camisetas para todos os estilos",
    description:
      "Loja de camisetas em Martinópolis-SP. Escolha seus produtos e finalize o pedido pelo WhatsApp.",
    openGraph: {
      title: "Camisa 10 — Camisetas para todos os estilos",
      description: "Vista o que representa você.",
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: "Camisa 10 — Camisetas para todos os estilos",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Camisa 10 — Camisetas para todos os estilos",
      description: "Vista o que representa você.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
