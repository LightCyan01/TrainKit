import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs";

const copySplashPlugin = () => ({
  name: "copy-splash",
  closeBundle() {
    const src = resolve(__dirname, "src/splash.html");
    const dest = resolve(__dirname, ".vite/build/splash.html");
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  },
});

export default defineConfig({
  plugins: [copySplashPlugin()],
});
