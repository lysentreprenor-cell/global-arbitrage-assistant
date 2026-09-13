import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Try candidate locations in order of preference:
  // 1. <__dirname>/public  — correct when running from compiled dist/index.cjs
  // 2. <cwd>/dist/public   — correct when running via tsx server/index.ts from project root
  const base: string = typeof __dirname !== "undefined"
    ? __dirname
    : (import.meta as any).dirname ?? process.cwd();

  const candidates = [
    path.resolve(base, "public"),
    path.resolve(process.cwd(), "dist", "public"),
  ];

  const distPath = candidates.find(p => fs.existsSync(p));

  if (!distPath) {
    throw new Error(
      `Could not find the build directory (tried: ${candidates.join(", ")}), make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    etag: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      }
    },
  }));

  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
