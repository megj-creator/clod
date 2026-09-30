import type { MetadataRoute } from "next";

// Makes "Add to Home Screen" open Uncover full-screen like a real app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Uncover",
    short_name: "Uncover",
    description: "Go somewhere you wouldn't have found yourself.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0b0a",
    theme_color: "#0d0b0a",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
