// Builds the client for the serverless Android app (mobile/www).
// The ResellAssist API routes run inside the app instead of on a server.
import { defineConfig, mergeConfig } from "vite";
import path from "path";
import baseConfig from "./vite.config";

const shim = path.resolve(import.meta.dirname, "client", "src", "localApi", "expressShim.ts");

export default mergeConfig(
  { ...baseConfig, resolve: { ...baseConfig.resolve, alias: {} } },
  defineConfig({
    base: "./",
    resolve: {
      alias: {
        ...(baseConfig.resolve?.alias as Record<string, string>),
        "@local-api": path.resolve(import.meta.dirname, "client", "src", "localApi", "install.ts"),
        express: shim,
      },
    },
    define: {
      "process.env": "{}",
    },
    build: {
      outDir: path.resolve(import.meta.dirname, "mobile", "www"),
      emptyOutDir: true,
    },
  }),
);
