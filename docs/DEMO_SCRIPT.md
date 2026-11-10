# Five-minute demo and interview preparation

## Before recording

Use a fresh database. Verify all samples in local mode, then enable and rehearse OpenAI mode if you intend to present AI extraction. Do not imply local mode uses an LLM. Have the app open at Overview and ensure your microphone is working. Do not expose `.env` or your API key on screen.

## 0:00–0:35 — Problem and scope

“An AP employee normally reads each vendor invoice, finds the purchase order, and decides whether the request is safe to move forward. Invoice Lens performs that process and makes every check visible. This prototype takes an uploaded invoice and produces an explainable decision; it never sends a payment.”

Point to upload, live decision workspace and history. Briefly identify the configured extraction mode.

## 0:35–1:30 — Clean run

Run Clean invoice. Show the source PDF, extracted fields and the ten checks. Expand amount reconciliation and cumulative PO balance.

“The document reader handles PDF text or OCR. The extracted fields are validated. Approval logic is ordinary code: identity, arithmetic, PO ownership, currency and balance. The language model, when enabled, does not decide approval.”

Show that the run appears in history.

## 1:30–2:15 — Disguised duplicate

Run Duplicate, different layout after the clean run. Open duplicate protection.

“This is a new file with a different vendor spelling and invoice formatting. A file hash alone would miss it. The vendor alias maps to the same canonical record, and the normalized invoice number matches. It is blocked without consuming the PO balance again.”

## 2:15–3:15 — Partial invoicing trap

Run Partial billing: first installment, then Partial billing: overrun. Show the PO balance explanation.

“The PO started at 80,000 with 30,000 already billed. The first new invoice reserves 25,000. The next asks for 30,000. That is smaller than the original PO, but total billing would reach 85,000. The cumulative check blocks it.”

Mention that rule evaluation and saving happen atomically.

## 3:15–4:05 — Ambiguity and human judgment

Run Missing PO, two candidates. Expand the review explanation and show the missing PO field.

“Two open orders are plausible. I chose to request confirmation instead of allowing the model to guess. Review does not consume any spending limit.”

If time permits, mention the inconsistent-total fixture; do not rush to run every sample.

## 4:05–5:00 — Traceability and tradeoffs

Open Audit trail, add a short clarification note, and point to Export decision. Show Purchase orders and history.

“I prioritized a reliable, visible workflow. SQLite and a single worker make the demo portable. For production I would add authenticated reviewer approvals, document revisions, line-item reconciliation, PostgreSQL and a durable queue. The current boundaries are explicit: no payment execution, no tax-law validation, and no automatic approval when extraction evidence is uncertain.”

Finish within five minutes. Record your own narration and be ready to run the same cases live.

## Questions you should be able to answer

1. **Where is AI used?** Only extraction in OpenAI mode; OCR uses Tesseract. Local mode uses label patterns.
2. **Why not let an LLM approve?** Monetary rules need predictable, testable behavior; uncertainty should be visible.
3. **Why integer amounts?** Decimal currency arithmetic should not inherit binary floating-point rounding errors.
4. **What if two invoices arrive together?** The queue serializes them and the database transaction commits each decision against current reservations.
5. **Why two duplicate checks?** Hashes catch identical bytes; canonical vendor/invoice identity catches re-rendered documents.
6. **What happens after a crash?** Committed outcomes persist; unfinished processing becomes ERROR and can be retried.
7. **Why might a legitimate invoice require review?** Missing references, unsupported evidence, poor OCR, currency discrepancies or arithmetic inconsistency.
8. **What is the tolerance?** An explicit demo assumption: cumulative min(1% of original PO, 100 currency units).
9. **Why SQLite instead of PostgreSQL?** Portable one-workspace demo, transactional local persistence, no account setup. Explain the single-replica limitation.
10. **What did you personally understand and validate?** Walk through the source files, rule assumptions, tests and limitations. Describe AI assistance honestly; the guide allows AI tools.
