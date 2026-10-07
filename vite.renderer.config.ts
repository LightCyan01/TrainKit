import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: { ignored: ["**/backend/**", "**/.vite/**", "**/out/**", "**/logs/**"] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
