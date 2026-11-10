import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test(
  "real PDFs → extraction/OCR → atomic decisions → persisted history",
  { timeout: 120000 },
  async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "invoice-lens-test-"),
    );
    const socket = createServer();
    await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
    const port = (socket.address() as any).port;
    await new Promise<void>((r) => socket.close(() => r()));
    const base = `http://127.0.0.1:${port}`;
    let output = "";
    let child: ReturnType<typeof spawn>;
    async function start() {
      child = spawn(
        process.execPath,
        ["--import", "tsx", "server/index.ts", "--production"],
        {
          env: {
            ...process.env,
            DATA_DIR: directory,
            PORT: String(port),
            EXTRACTION_MODE: "local",
            APP_USER: "",
            APP_PASSWORD: "",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout?.on("data", (b) => (output += b));
      child.stderr?.on("data", (b) => (output += b));
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(base + "/api/health")).ok) return;
        } catch {}
        await wait(100);
      }
      throw new Error("Server did not start: " + output);
    }
    async function stop() {
      if (child.exitCode !== null) return;
      const done = new Promise<void>((r) => child.once("exit", () => r()));
      child.kill();
      await done;
    }
    async function send(filename: string, bytes?: Buffer) {
      const form = new FormData();
      form.append(
        "invoice",
        new Blob(
          [
            new Uint8Array(
              bytes || fs.readFileSync(`datasets/invoices/${filename}`),
            ),
          ],
          { type: "application/pdf" },
        ),
        filename,
      );
      const response = await fetch(base + "/api/runs", {
        method: "POST",
        body: form,
      });
      return { response, body: (await response.json()) as any };
    }
    async function finish(id: string) {
      for (let i = 0; i < 300; i++) {
        const run: any = await (await fetch(`${base}/api/runs/${id}`)).json();
        if (run.status !== "PROCESSING") return run;
        await wait(100);
      }
      throw new Error("Processing timeout");
    }
    try {
      await start();
      const scenarios = JSON.parse(
        fs.readFileSync("datasets/scenarios.json", "utf8"),
      );
      let first = "";
      for (const s of scenarios) {
        const { response, body } = await send(s.file);
        assert.equal(response.status, 202);
        const run = await finish(body.id);
        assert.equal(
          run.status,
          s.expected,
          `${s.file}: ${JSON.stringify(run.checks || run.error)}`,
        );
        assert.ok(run.events.some((e: any) => e.stage === "complete"));
        if (s.id === "01-clean") first = run.id;
        if (s.id === "11-scanned")
          assert.equal(run.reading.pages[0].method, "Tesseract OCR");
      }
      const invalid = await send("bad.pdf", Buffer.from("not a pdf"));
      assert.equal(invalid.response.status, 400);
      const corrupt = await send(
        "corrupt.pdf",
        Buffer.from("%PDF-this is invalid"),
      );
      assert.equal((await finish(corrupt.body.id)).status, "ERROR");
      const before: any = await (await fetch(base + "/api/procurement")).json();
      assert.equal(
        before.pos.find((p: any) => p.id === "PO-102").remainingMinor,
        2500000,
      );
      const repeated = await send("03-partial-first.pdf");
      assert.equal((await finish(repeated.body.id)).status, "REJECTED");
      const after: any = await (await fetch(base + "/api/procurement")).json();
      assert.equal(
        after.pos.find((p: any) => p.id === "PO-102").remainingMinor,
        2500000,
      );
      const sse = await (
        await fetch(`${base}/api/runs/${first}/events`)
      ).text();
      assert.ok(sse.includes("APPROVED"));
      assert.ok(!sse.includes("filePath"));
      const note = await fetch(`${base}/api/runs/${first}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Checked against original PDF." }),
      });
      assert.equal(note.status, 200);
      const attack = await fetch(`${base}/api/runs/${first}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://other.example",
        },
        body: JSON.stringify({ text: "No" }),
      });
      assert.equal(attack.status, 403);
      const exported: any = await (
        await fetch(`${base}/api/runs/${first}/export`)
      ).json();
      assert.equal(exported.notes.length, 1);
      assert.equal(exported.filePath, undefined);
      const file = await fetch(`${base}/api/runs/${first}/file`);
      assert.equal(file.headers.get("content-type"), "application/pdf");
      const parallel = await Promise.all([
        send("03-partial-first.pdf"),
        send("03-partial-first.pdf"),
      ]);
      for (const r of parallel)
        assert.equal((await finish(r.body.id)).status, "REJECTED");
      await stop();
      await start();
      const restored: any = await (
        await fetch(`${base}/api/runs/${first}`)
      ).json();
      assert.equal(restored.status, "APPROVED");
      assert.equal(restored.notes[0].text, "Checked against original PDF.");
    } finally {
      await stop();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
