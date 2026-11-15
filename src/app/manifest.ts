import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taller · Control de coches",
    short_name: "Taller",
    description: "Eventos y fotos por matrícula",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#2f5bea",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
