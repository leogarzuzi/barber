import type { Metadata, Viewport } from "next";
import LegacyStorageCleanup from "@/components/LegacyStorageCleanup";
import "./globals.css";

export const metadata: Metadata = {
  title: "PH10 Barbearia",
  description: "Gestão e agendamento da Barbearia PH10",
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
