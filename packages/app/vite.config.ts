import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(() => {
  const apiPort = parseInt(process.env.API_PORT || "3001", 10);

  return {
    plugins: [tailwindcss(), react()],
    build: {
      outDir: "dist",
    },
    server: {
      proxy: {
        "/api": `http://localhost:${apiPort}`,
      },
    },
  };
});
