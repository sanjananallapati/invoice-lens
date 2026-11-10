import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  decide,
  money,
  type Invoice,
  type PO,
  type Vendor,
} from "../server/domain.ts";
import { localExtract } from "../server/extract.ts";
const vendors: Vendor[] = JSON.parse(
  fs.readFileSync("datasets/vendors.json", "utf8"),
);
const pos: PO[] = JSON.parse(
  fs.readFileSync("datasets/purchase_orders.json", "utf8"),
);
const valid: Invoice = {
  vendor_name: "Apex Office Supplies",
  invoice_number: "INV-204",
  invoice_date: "2026-11-01",
  po_number: "PO-101",
  currency: "INR",
  subtotal: "40000.00",
  tax: "7200.00",
  total: "47200.00",
};
const check = (
  patch: Partial<Invoice> = {},
  prior: any[] = [],
  issues: string[] = [],
) =>
  decide(
    { ...valid, ...patch },
    vendors,
    pos,
    prior,
    "new-hash",
    issues,
    "2026-11-05",
  );
test("money uses integer minor units and rejects ambiguous formats", () => {
  assert.equal(money("0.29"), 29);
  assert.equal(money("100.1"), 10010);
  for (const v of ["1e3", "-1", "1.234", "NaN", "1,000", ""])
    assert.equal(money(v), null);
});
test("clean invoice approved with no payment side effect", () => {
  const d = check();
  assert.equal(d.status, "APPROVED");
  assert.equal(d.balance?.projected, 4720000);
});
test("vendor alias plus normalized invoice number detects duplicate", () => {
  assert.equal(
    check(
      {
        vendor_name: "Apex Office Supplies Pvt Ltd",
        invoice_number: "inv 204",
      },
      [
        {
          id: "old",
          status: "APPROVED",
          hash: "different",
          vendorId: "V001",
          invoiceKey: "INV204",
        },
      ],
    ).status,
    "REJECTED",
  );
});
test("identical document hash blocks repeat even if fields differ", () => {
  assert.equal(
    check({}, [{ id: "old", status: "REVIEW", hash: "new-hash" }]).status,
    "REJECTED",
  );
});
test("processing failure permits retry", () => {
  assert.equal(
    check({}, [{ id: "old", status: "ERROR", hash: "new-hash" }]).status,
    "APPROVED",
  );
});
test("cumulative split invoices cannot bypass PO balance", () => {
  const d = check(
    {
      vendor_name: "Nova IT Services",
      invoice_number: "NOVA-302",
      po_number: "PO-102",
      subtotal: "30000.00",
      tax: "0.00",
      total: "30000.00",
    },
    [
      {
        id: "earlier",
        status: "APPROVED",
        hash: "old",
        poId: "PO-102",
        totalMinor: 2500000,
      },
    ],
  );
  assert.equal(d.status, "REJECTED");
  assert.equal(d.balance?.remaining, 2500000);
});
test("review and rejected invoices never consume balance", () => {
  const d = check({}, [
    {
      id: "x",
      hash: "a",
      status: "REVIEW",
      poId: "PO-101",
      totalMinor: 5000000,
    },
    {
      id: "y",
      hash: "b",
      status: "REJECTED",
      poId: "PO-101",
      totalMinor: 5000000,
    },
  ]);
  assert.equal(d.status, "APPROVED");
});
test("ambiguous missing PO stays in review", () => {
  const d = check({
    vendor_name: "Cedar Design Studio",
    po_number: null,
    subtotal: "20000",
    tax: "0",
    total: "20000",
  });
  assert.equal(d.status, "REVIEW");
  assert.equal(d.candidates.length, 2);
  assert.equal(d.poId, undefined);
});
test("even a unique inferred PO needs confirmation", () => {
  assert.equal(
    check({ po_number: null, vendor_name: "Nova IT Services" }).status,
    "REVIEW",
  );
});
test("explicit unknown PO is not silently replaced", () => {
  const d = check({ po_number: "PO-999" });
  assert.equal(d.status, "REVIEW");
  assert.equal(d.poId, undefined);
});
test("wrong vendor and unapproved vendor are blocked", () => {
  assert.equal(check({ vendor_name: "Nova IT Services" }).status, "REJECTED");
  assert.equal(
    check({ vendor_name: "Harbor Logistics", po_number: "PO-106" }).status,
    "REJECTED",
  );
});
test("currency mismatch withholds balance calculation decision", () => {
  const d = check({ currency: "USD" });
  assert.equal(d.status, "REVIEW");
  assert.equal(d.checks.find((c) => c.code === "balance")?.state, "review");
});
test("broken arithmetic, missing number, future or impossible date go to review", () => {
  for (const p of [
    { total: "48000" },
    { invoice_number: null },
    { invoice_date: "2026-12-01" },
    { invoice_date: "2026-02-30" },
    { invoice_date: "yesterday" },
  ])
    assert.equal(check(p).status, "REVIEW");
});
test("source uncertainty prevents auto approval", () =>
  assert.equal(check({}, [], ["Low OCR confidence"]).status, "REVIEW"));
test("tolerance is cumulative and bounded, not replenished per invoice", () => {
  const p = {
    po_number: "PO-108",
    subtotal: "10100",
    tax: "0",
    total: "10100",
  };
  assert.equal(check(p).status, "APPROVED");
  assert.equal(
    check({ ...p, subtotal: "10100.01", total: "10100.01" }).status,
    "REJECTED",
  );
  assert.equal(
    check({ po_number: "PO-108", subtotal: "50", tax: "0", total: "50" }, [
      {
        id: "a",
        hash: "z",
        status: "APPROVED",
        poId: "PO-108",
        totalMinor: 1006000,
      },
    ]).status,
    "REJECTED",
  );
});
test("local extraction reports repeated totals and never invents absent tax", () => {
  const r = localExtract(
    "Vendor: Apex Office Supplies\nTotal: 100.00\nTotal: 120.00",
  );
  assert.equal(r.invoice.tax, null);
  assert.ok(r.issues.some((i) => i.includes("total")));
});
