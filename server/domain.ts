import { z } from "zod";
export const fields = [
  "vendor_name",
  "invoice_number",
  "invoice_date",
  "po_number",
  "currency",
  "subtotal",
  "tax",
  "total",
] as const;
export const InvoiceSchema = z
  .object({
    vendor_name: z.string().nullable(),
    invoice_number: z.string().nullable(),
    invoice_date: z.string().nullable(),
    po_number: z.string().nullable(),
    currency: z.string().nullable(),
    subtotal: z.string().nullable(),
    tax: z.string().nullable(),
    total: z.string().nullable(),
  })
  .strict();
export type Invoice = z.infer<typeof InvoiceSchema>;
export type Vendor = {
  id: string;
  name: string;
  aliases: string[];
  approved: boolean;
};
export type PO = {
  id: string;
  vendor_id: string;
  currency: string;
  amount: string;
  baseline_billed: string;
  description: string;
};
export type Prior = {
  id: string;
  hash: string;
  status: string;
  vendorId?: string;
  invoiceKey?: string;
  poId?: string;
  totalMinor?: number;
};
export type Check = {
  code: string;
  label: string;
  state: "pass" | "review" | "fail";
  detail: string;
};
export const norm = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function money(v: string | null): number | null {
  if (v === null || !/^\d{1,10}(\.\d{1,2})?$/.test(v)) return null;
  const [a, b = ""] = v.split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
export const display = (minor: number, currency = "INR") =>
  `${currency} ${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function decide(
  invoice: Invoice,
  vendors: Vendor[],
  pos: PO[],
  prior: Prior[],
  hash: string,
  extractionIssues: string[] = [],
  today = new Date().toISOString().slice(0, 10),
) {
  const checks: Check[] = [];
  const add = (
    code: string,
    label: string,
    state: Check["state"],
    detail: string,
  ) => checks.push({ code, label, state, detail });
  const missing = fields.filter(
    (k) => k !== "po_number" && (!invoice[k] || !invoice[k]!.trim()),
  );
  add(
    "required",
    "Required fields",
    missing.length ? "review" : "pass",
    missing.length
      ? `Missing: ${missing.join(", ")}. Request a corrected invoice.`
      : "Vendor, invoice identity, date, currency and amounts are present.",
  );
  const date = invoice.invoice_date;
  const parsed = date ? new Date(date) : null;
  const validDate =
    !!date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    parsed &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    date <= today;
  add(
    "date",
    "Invoice date",
    validDate ? "pass" : "review",
    validDate
      ? `Invoice dated ${date}.`
      : "Date is absent, invalid, or in the future. Review the source document.",
  );
  add(
    "extraction",
    "Extraction reliability",
    extractionIssues.length ? "review" : "pass",
    extractionIssues.length
      ? extractionIssues.join(" ")
      : "Required values were found in the source; no extraction warnings.",
  );
  const vendor = vendors.find((v) =>
    [v.name, ...v.aliases].some(
      (n) => norm(n) === norm(invoice.vendor_name || ""),
    ),
  );
  add(
    "vendor",
    "Approved vendor",
    !vendor ? "review" : vendor.approved ? "pass" : "fail",
    !vendor
      ? "Vendor is not recognized. Verify its legal identity before onboarding."
      : vendor.approved
        ? `${vendor.name} is approved.`
        : `${vendor.name} is explicitly not approved.`,
  );
  const invoiceKey = invoice.invoice_number
    ? norm(invoice.invoice_number)
    : undefined;
  const duplicate = prior.find(
    (p) =>
      p.status !== "ERROR" &&
      (p.hash === hash ||
        (vendor &&
          invoiceKey &&
          p.vendorId === vendor.id &&
          p.invoiceKey === invoiceKey)),
  );
  add(
    "duplicate",
    "Duplicate protection",
    duplicate ? "fail" : "pass",
    duplicate
      ? `Previously submitted as run ${duplicate.id}. No additional PO balance is consumed.`
      : "No prior file hash or vendor + normalized invoice-number match.",
  );
  const sub = money(invoice.subtotal),
    tax = money(invoice.tax),
    total = money(invoice.total);
  const numbersValid =
    sub !== null && tax !== null && total !== null && total > 0;
  add(
    "arithmetic",
    "Amount reconciliation",
    numbersValid && sub! + tax! === total ? "pass" : "review",
    !numbersValid
      ? "Amounts must be nonnegative decimals with at most two places, and total must be positive."
      : sub! + tax! === total
        ? `${display(sub!, invoice.currency || "INR")} + ${display(tax!, invoice.currency || "INR")} = ${display(total!, invoice.currency || "INR")}.`
        : `Subtotal + tax is ${display(sub! + tax!, invoice.currency || "INR")}, but total is ${display(total!, invoice.currency || "INR")}. Request a corrected document.`,
  );
  let po: PO | undefined;
  let candidates: PO[] = [];
  if (invoice.po_number) {
    po = pos.find((p) => norm(p.id) === norm(invoice.po_number!));
    add(
      "match",
      "Purchase-order match",
      po ? "pass" : "review",
      po
        ? `Explicit reference matches ${po.id}.`
        : `Referenced PO ${invoice.po_number} was not found. No fallback to a different PO.`,
    );
  } else {
    candidates = pos.filter(
      (p) =>
        p.vendor_id === vendor?.id &&
        p.currency === invoice.currency &&
        remaining(p, prior) > 0,
    );
    // Missing references always require human confirmation, even a single candidate.
    add(
      "match",
      "Purchase-order match",
      "review",
      `${candidates.length} possible open PO(s): ${candidates.map((p) => p.id).join(", ") || "none"}. Missing reference requires confirmation; no automatic guess.`,
    );
  }
  let balance: null | {
    authorized: number;
    previouslyBilled: number;
    remaining: number;
    requested: number | null;
    tolerance: number;
    projected: number | null;
  } = null;
  if (po) {
    add(
      "ownership",
      "PO vendor ownership",
      !vendor ? "review" : po.vendor_id === vendor.id ? "pass" : "fail",
      vendor && po.vendor_id === vendor.id
        ? "Invoice vendor owns this PO."
        : "Invoice vendor does not match the vendor on this PO.",
    );
    add(
      "currency",
      "Currency consistency",
      invoice.currency === po.currency ? "pass" : "review",
      invoice.currency === po.currency
        ? `Both records use ${po.currency}.`
        : `Invoice uses ${invoice.currency || "unknown"}; PO uses ${po.currency}. No currency conversion applied.`,
    );
    const authorized = money(po.amount)!;
    const left = remaining(po, prior);
    const billed = authorized - left;
    const tolerance = Math.min(Math.floor(authorized / 100), 10000);
    balance = {
      authorized,
      previouslyBilled: billed,
      remaining: left,
      requested: total,
      tolerance,
      projected: total === null ? null : billed + total,
    };
    if (total !== null && invoice.currency === po.currency) {
      const within = billed + total <= authorized + tolerance;
      add(
        "balance",
        "Cumulative PO balance",
        within ? "pass" : "fail",
        `${display(billed, po.currency)} already billed + ${display(total, po.currency)} requested. PO limit ${display(authorized, po.currency)} + tolerance ${display(tolerance, po.currency)}. ${within ? "Within cumulative limit." : "Exceeds cumulative limit; request an amended PO."}`,
      );
    } else
      add(
        "balance",
        "Cumulative PO balance",
        "review",
        "Balance check withheld until amounts and currency are reliable.",
      );
  }
  const status = checks.some((c) => c.state === "fail")
    ? "REJECTED"
    : checks.some((c) => c.state === "review")
      ? "REVIEW"
      : "APPROVED";
  return {
    status,
    checks,
    vendorId: vendor?.id,
    invoiceKey,
    poId: po?.id,
    totalMinor: total ?? undefined,
    balance,
    candidates,
    summary:
      status === "APPROVED"
        ? "Ready for AP approval. All configured checks passed; no payment was initiated."
        : status === "REJECTED"
          ? "Blocked by a procurement rule. Resolve the failed checks before resubmitting."
          : "Human review required. Resolve missing or inconsistent evidence before approval.",
  };
}
export function remaining(po: PO, prior: Prior[]) {
  return (
    money(po.amount)! -
    money(po.baseline_billed)! -
    prior
      .filter((p) => p.status === "APPROVED" && p.poId === po.id)
      .reduce((s, p) => s + (p.totalMinor || 0), 0)
  );
}
