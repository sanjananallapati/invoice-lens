# Scenario catalog

All data is synthetic. Expectations assume a fresh database and the numbered order. Amounts are INR unless explicitly stated.

| PDF | Expected outcome | Why |
|---|---|---|
| `01-clean.pdf` | APPROVED | All checks pass. Run this first. |
| `02-renamed-duplicate.pdf` | REJECTED | Run after 01. Alias and normalized invoice ID reveal a duplicate despite a different PDF. |
| `03-partial-first.pdf` | APPROVED | Baseline billed is 30,000. Remaining balance falls from 50,000 to 25,000. |
| `04-partial-overrun.pdf` | REJECTED | Run after 03. Cumulative billing becomes 85,000 against an 80,000 PO. |
| `05-ambiguous.pdf` | REVIEW | Two open POs fit. Never guess which one. |
| `06-math-mismatch.pdf` | REVIEW | Subtotal + tax is 23,600, not the printed 24,000. |
| `07-unapproved.pdf` | REJECTED | The PO exists but this vendor is not approved. |
| `08-missing-number.pdf` | REVIEW | Missing invoice number prevents reliable deduplication. |
| `09-currency.pdf` | REVIEW | PO is USD; invoice is INR. No implicit exchange-rate conversion. |
| `10-tolerance.pdf` | APPROVED | 50 above PO is within the configured min(1% of PO, 100) cumulative tolerance. |
| `11-scanned.pdf` | APPROVED | Real image-only PDF; requires Tesseract OCR. Low OCR quality routes to review. |
| `12-wrong-vendor.pdf` | REJECTED | An explicit PO reference is not proof the vendor owns it. |

## Main four edge cases

1. A re-rendered invoice with an approved vendor alias and altered invoice-number punctuation.
2. Split invoicing that exceeds the remaining PO balance despite being below the original PO total.
3. Missing PO reference with two plausible open orders.
4. An apparently plausible total that disagrees with subtotal plus tax.

## Dataset regeneration

The PDFs are bundled; regeneration is optional. Run your configured Python interpreter on `scripts/generate_data.py`. It writes 5 vendors, 8 POs, JSON/CSV exports and 12 PDFs. The image-only fixture is created by rasterizing the invoice and embedding that image into a new PDF, with no embedded text layer.

Regenerating fixtures does not reset runtime history. New PDF metadata may change byte hashes, but canonical vendor/invoice identity continues to prevent duplicates.
