import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { makeStore, type Run } from "./store.ts";
import { readPDF, extract } from "./extract.ts";
import { decide, remaining } from "./domain.ts";
const root = path.resolve(process.env.DATA_DIR || "data");
const store = makeStore(root);
const app = express();
app.disable("x-powered-by");
if (!["local", "openai"].includes(process.env.EXTRACTION_MODE || "local"))
  throw new Error("EXTRACTION_MODE must be local or openai.");
if (!!process.env.APP_USER !== !!process.env.APP_PASSWORD)
  throw new Error("Set both APP_USER and APP_PASSWORD, or neither.");
const equal = (a: string, b: string) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (
  process.env.APP_USER &&
  !(req.method === "GET" && req.path === "/api/health")
){
    const encoded = req.headers.authorization?.split(" ")[1] || "";
    const value = Buffer.from(encoded, "base64").toString();
    if (!equal(value, `${process.env.APP_USER}:${process.env.APP_PASSWORD}`)) {
      res.setHeader(
        "WWW-Authenticate",
        'Basic realm="Invoice Lens", charset="UTF-8"',
      );
      res.status(401).send("Sign in to Invoice Lens");
      return;
    }
  }
  next();
});
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (
    ["POST", "PUT", "DELETE", "PATCH"].includes(req.method) &&
    req.headers.origin
  ) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        res.status(403).json({ error: "Cross-origin writes are not allowed." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid origin." });
      return;
    }
  }
  next();
});
app.use(express.json({ limit: "20kb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
});
const publicRun = (run: Run) => {
  const { filePath, ...visible } = run;
  return visible;
};
const scenarios = JSON.parse(
  fs.readFileSync("datasets/scenarios.json", "utf8"),
);
for (const run of store.all())
  if (run.status === "PROCESSING") {
    run.status = "ERROR";
    run.error =
      "Server restarted during processing. Re-upload the invoice; no approval was committed.";
    store.save(run);
  }
const event = (run: Run, stage: string, message: string) => {
  run.events.push({ stage, message, at: new Date().toISOString() });
  store.save(run);
};
async function processRun(id: string) {
  const run = store.get(id)!;
  try {
    event(run, "read", "Reading every page; image-only pages use OCR.");
    const reading = await readPDF(run.filePath);
    run.reading = reading;
    event(
      run,
      "extract",
      `Read ${reading.pages.length} page(s). Extracting invoice fields using ${process.env.EXTRACTION_MODE || "local"} mode.`,
    );
    const result = await extract(reading);
    run.invoice = result.invoice;
    run.extractionMode = result.mode;
    run.extractionIssues = result.issues;
    event(
      run,
      "validate",
      "Validating fields, vendor identity, PO ownership, duplicates and cumulative balance.",
    );
    // No await inside this transaction: decision and reservation are atomic.
    store.db.exec("BEGIN IMMEDIATE");
    try {
      Object.assign(
        run,
        decide(
          result.invoice,
          store.vendors,
          store.pos,
          store.prior().filter((p) => p.id !== id),
          run.hash,
          result.issues,
        ),
      );
      run.events.push({
        stage: "complete",
        message: run.summary,
        at: new Date().toISOString(),
      });
      store.save(run);
      store.db.exec("COMMIT");
    } catch (e) {
      store.db.exec("ROLLBACK");
      throw e;
    }
  } catch (e: any) {
    run.status = "ERROR";
    run.error = e.message || "Processing failed.";
    event(run, "error", run.error);
  }
}
const queue: string[] = [];
let working = false;
async function drain() {
  if (working) return;
  working = true;
  try {
    while (queue.length) await processRun(queue.shift()!);
  } finally {
    working = false;
  }
}
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    mode: process.env.EXTRACTION_MODE || "local",
    aiConfigured: !!process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  }),
);
app.get("/api/scenarios", (_req, res) => res.json(scenarios));
app.get("/api/samples/:id", (req, res) => {
  const s = scenarios.find((s: any) => s.id === req.params.id);
  if (!s) {
    res.status(404).json({ error: "Sample not found." });
    return;
  }
  res.download(path.resolve("datasets/invoices", s.file));
});
app.get("/api/procurement", (_req, res) =>
  res.json({
    vendors: store.vendors,
    pos: store.pos.map((p) => ({
      ...p,
      remainingMinor: remaining(p, store.prior()),
    })),
  }),
);
app.get("/api/runs", (_req, res) => res.json(store.all().map(publicRun)));
app.post("/api/runs", upload.single("invoice"), (req, res) => {
  if (queue.length + (working ? 1 : 0) >= 10) {
    res
      .status(429)
      .json({ error: "Processing queue is full. Wait for a run to finish." });
    return;
  }
  const f = req.file;
  if (!f || !f.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    res.status(400).json({ error: "Upload a valid PDF under 10 MB." });
    return;
  }
  const id = randomUUID();
  const filePath = path.join(root, "uploads", `${id}.pdf`);
  fs.writeFileSync(filePath, f.buffer);
  const run: Run = {
    id,
    name: path.basename(f.originalname).slice(0, 150),
    hash: createHash("sha256").update(f.buffer).digest("hex"),
    status: "PROCESSING",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    filePath,
    events: [
      {
        stage: "queued",
        message: "Upload received and saved. Waiting for document reader.",
        at: new Date().toISOString(),
      },
    ],
    notes: [],
  };
  store.save(run);
  queue.push(id);
  res.status(202).json(publicRun(run));
  void drain();
});
app.get("/api/runs/:id", (req, res) => {
  const run = store.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "Run not found." });
    return;
  }
  res.json(publicRun(run));
});
app.get("/api/runs/:id/file", (req, res) => {
  const run = store.get(req.params.id);
  if (!run) {
    res.sendStatus(404);
    return;
  }
  res.type("pdf").sendFile(run.filePath);
});
app.get("/api/runs/:id/export", (req, res) => {
  const run = store.get(req.params.id);
  if (!run) {
    res.sendStatus(404);
    return;
  }
  res.attachment(`decision-${run.id}.json`).json(publicRun(run));
});
app.post("/api/runs/:id/notes", (req, res) => {
  const run = store.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "Run not found." });
    return;
  }
  if (run.status === "PROCESSING") {
    res.status(409).json({ error: "Wait until processing finishes." });
    return;
  }
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 2000) {
    res
      .status(400)
      .json({ error: "Write a note between 1 and 2,000 characters." });
    return;
  }
  run.notes.push({ text: text.trim(), at: new Date().toISOString() });
  store.save(run);
  res.json(publicRun(run));
});
app.get("/api/runs/:id/events", (req, res) => {
  if (!store.get(req.params.id)) {
    res.sendStatus(404);
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  let last = "";
  const tick = () => {
    const run = store.get(req.params.id);
    if (!run) {
      res.end();
      return;
    }
    const data = JSON.stringify(publicRun(run));
    if (data !== last) {
      res.write(`data: ${data}\n\n`);
      last = data;
    } else res.write(": heartbeat\n\n");
    if (run.status !== "PROCESSING") {
      clearInterval(timer);
      res.end();
    }
  };
  const timer = setInterval(tick, 300);
  tick();
  req.on("close", () => clearInterval(timer));
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API endpoint not found." }),
);
if (process.argv.includes("--production")) {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) =>
    res
      .status(error instanceof multer.MulterError ? 400 : 500)
      .json({
        error:
          error instanceof multer.MulterError
            ? "Upload one PDF under 10 MB."
            : error instanceof SyntaxError
              ? "Invalid JSON request."
              : "Unexpected server error. Check server logs.",
      }),
);
const portArg = process.argv.indexOf("--port");
const hostArg = process.argv.indexOf("--host");
const port = Number(
  portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT || 3000,
);
const host = hostArg >= 0 ? process.argv[hostArg + 1] : "0.0.0.0";
app.listen(port, host, () =>
  console.log(
    `Invoice Lens running at http://localhost:${port} (${process.env.EXTRACTION_MODE || "local"} extraction)`,
  ),
);
