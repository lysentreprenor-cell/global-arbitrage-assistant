import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In CJS output (dist/index.cjs), __dirname is the dist/ folder itself.
  // In ESM, import.meta.dirname is the dist/ folder.
  // Either way: the public assets live at <that dir>/public.
  const base: string = typeof __dirname !== "undefined"
    ? __dirname
    : (import.meta as any).dirname ?? process.cwd();

  const distPath = path.resolve(base, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
