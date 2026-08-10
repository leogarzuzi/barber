import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/b/ph10",
    name: "PH10 Barbearia",
    short_name: "PH10",
    description: "Agendamento da Barbearia PH10",
    start_url: "/b/ph10",
    scope: "/",
    display: "standalone",
    background_color: "#24211e",
    theme_color: "#24211e",
    icons: [
      {
        src: "/icons/icon-192.png?v=3",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png?v=3",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png?v=3",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
