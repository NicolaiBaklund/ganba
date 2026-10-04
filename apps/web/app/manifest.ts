import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ganba",
    short_name: "Ganba",
    start_url: "/today",
    display: "standalone",
    background_color: "#eef0f2",
    theme_color: "#eef0f2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
