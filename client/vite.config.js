import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

export default defineConfig(() => {
  const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    loadEnvFile(resolve(rootDirectory, ".env"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const apiOrigin = `http://127.0.0.1:${Number(process.env.PORT) || 3002}`;
  return {
    // The root .env is loaded above. Disabling Vite's loader avoids treating
    // server-only values such as NODE_ENV as browser build configuration.
    envDir: false,
    plugins: [vue(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": apiOrigin,
        "/uploads": apiOrigin,
        "/socket.io": { target: apiOrigin, ws: true },
      },
    },
  };
});
