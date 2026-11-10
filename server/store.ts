import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Vendor, PO, Prior } from "./domain.ts";
export type Run = {
  id: string;
  name: string;
  hash: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  filePath: string;
  events: { stage: string; message: string; at: string }[];
  notes: { text: string; at: string }[];
  [key: string]: any;
};
export function makeStore(root: string) {
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, "uploads"), { recursive: true });
  const db = new DatabaseSync(path.join(root, "invoice-lens.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS procurement(kind TEXT PRIMARY KEY,payload TEXT NOT NULL);",
  );
  for (const kind of ["vendors", "purchase_orders"])
    db.prepare("INSERT OR IGNORE INTO procurement VALUES (?,?)").run(
      kind,
      fs.readFileSync(path.resolve(`datasets/${kind}.json`), "utf8"),
    );
  const all = (): Run[] =>
    db
      .prepare("SELECT payload FROM runs ORDER BY rowid DESC")
      .all()
      .map((r: any) => JSON.parse(r.payload));
  const get = (id: string): Run | undefined => {
    const r: any = db.prepare("SELECT payload FROM runs WHERE id=?").get(id);
    return r ? JSON.parse(r.payload) : undefined;
  };
  const save = (run: Run) => {
    run.updatedAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    ).run(run.id, JSON.stringify(run));
  };
  const vendors = JSON.parse(
    (
      db
        .prepare("SELECT payload FROM procurement WHERE kind='vendors'")
        .get() as any
    ).payload,
  ) as Vendor[];
  const pos = JSON.parse(
    (
      db
        .prepare("SELECT payload FROM procurement WHERE kind='purchase_orders'")
        .get() as any
    ).payload,
  ) as PO[];
  return { db, all, get, save, vendors, pos, prior: () => all() as Prior[] };
}
