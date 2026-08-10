import type { Metadata, Viewport } from "next";
import LegacyStorageCleanup from "@/components/LegacyStorageCleanup";
import "./globals.css";

export const metadata: Metadata = {
  title: "PH10 Barbearia",
  description: "Gestão e agendamento da Barbearia PH10",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-48.png?v=3", type: "image/png", sizes: "48x48" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "PH10",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#24211e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full"><LegacyStorageCleanup />{children}</body>
    </html>
  );
}
