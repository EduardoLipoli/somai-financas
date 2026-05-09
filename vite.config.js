import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "safari-pinned-tab.svg",
      ],
      manifest: {
        name: "Somaí Finanças",
        short_name: "Somaí",
        description: "Seu painel financeiro inteligente",
        theme_color: "#121212",
        background_color: "#121212",
        display: "standalone",
        orientation: "portrait",

        // 1. Ícones separados corretamente
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png", // Você pode usar a mesma imagem, mas agora ela tem seu próprio bloco
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],

        // 2. Capturas de tela para a Interface Premium de Instalação
        screenshots: [
          {
            src: "/screenshot-mobile.png",
            sizes: "1080x1920",
            type: "image/png",
            form_factor: "narrow", // Indica que é para telas de celular
          },
          {
            src: "/screenshot-desktop.png",
            sizes: "1920x1080",
            type: "image/png",
            form_factor: "wide", // Indica que é para telas de PC
          },
        ],
      },
    }),
  ],
});
