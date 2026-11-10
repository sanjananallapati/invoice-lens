# Architecture and decisions

## End-to-end flow

Browser → POST PDF → persist upload and queued run → Python text extraction/OCR → local parser or OpenAI structured extraction → Zod validation → deterministic rule engine → atomic SQLite decision/reservation → SSE/UI and retained audit record.

The UI's Run sample button fetches an actual sample PDF and submits it through the same multipart endpoint as user-uploaded files. The decision engine has no filename-to-outcome lookup. The scenarios manifest describes expected outcomes for humans only.

## Why this implementation

React/TypeScript and Express keep the main application in one language. Python is limited to mature PDF rendering/text extraction and generating fixtures. Tesseract provides actual image-to-text processing without paid credentials. SQLite removes database account/setup dependencies for a one-week single-workspace demo. This deliberately simplifies the earlier proposed PostgreSQL/object-storage architecture; the runtime data layer is isolated in `server/store.ts`.

The app is an automated process, not a financial dashboard simulation. The backend owns stages and decisions; the browser subscribes to real updates. There are no artificial delays to make processing look elaborate.

## AI boundary

Local mode uses label patterns; it is not presented as an AI model. OpenAI mode receives extracted document text and a strict eight-field schema. A system instruction treats document text as untrusted and forbids inventing facts or following document instructions. Zod checks the resulting structure. A conservative evidence check verifies non-null values appear in source text after simple normalization. A transformed date or ambiguous abbreviation can therefore require review even when the model interpretation is plausible.

This is a guardrail, not proof that an LLM is infallible or immune to prompt injection. Production use should attach per-field source coordinates, benchmark extraction on diverse real layouts, and require human review at appropriate risk thresholds.

OCR confidence is Tesseract's mean word confidence, not a calibrated probability that the invoice is correct. Below 85 triggers review. The total PDF processing timeout is 180 seconds, maximum 10 pages and 10 MB; rendered OCR images are bounded to 2,400 pixels on the long side.

## Rules and outcome precedence

- Required: vendor, invoice number, unambiguous ISO date, explicit currency, subtotal, tax and total.
- PO reference can be absent, but absence always requires review, even if a single candidate exists.
- Date must be real and no later than the current server date.
- Vendor matching uses normalized exact names and explicitly configured aliases, not fuzzy auto-approval.
- Unrecognized vendors require review; explicitly unapproved vendors are blocked.
- Duplicate detection uses SHA-256 of bytes OR canonical vendor ID + normalized invoice number.
- Previous non-error submissions block duplicate processing, including review/rejected runs. A revised document should use a new invoice reference in this prototype; a production superseding/revision workflow is not implemented.
- Amounts are parsed into integer minor units with at most two decimal places. Subtotal + tax must equal total exactly; tax-law correctness and item-level reconciliation are not claimed.
- Explicit PO references must exist; the system never silently substitutes another PO.
- Invoice vendor must own the PO; currency must match. No implicit FX conversion.
- Cumulative usage = seeded historical billed amount + totals from previous APPROVED runs.
- Cumulative allowed amount = PO amount + min(1% of original PO, 100 currency units). This illustrative tolerance is documented, not claimed as an industry standard.
- REJECTED takes precedence over REVIEW, which takes precedence over APPROVED. Every individual check remains visible even when multiple issues coexist.
- ERROR is for a failed processing operation. No financial decision or balance reservation is committed.

Tolerance is total headroom for the whole PO, not a fresh allowance for every invoice. For a PO already above its base amount within tolerance, the UI can show a negative remaining balance; the allowed tolerance is shown in the decision snapshot. Seeded historical usage is an explicit opening balance, not a fabricated run.

## Concurrency and persistence

Uploads receive random IDs and server-controlled paths. One in-process queue processes runs sequentially. The final read of previous outcomes, decision calculation, and save happen inside `BEGIN IMMEDIATE` with no asynchronous await in the transaction. Approved runs themselves form the reservation ledger, so duplicate/rejected/review outcomes do not double-debit a separate balance field.

A restart marks unfinished PROCESSING runs as ERROR rather than pretending they completed. The user can retry. A crash before COMMIT rolls back; a crash after COMMIT retains the approved decision. SQLite WAL is enabled. Use exactly one application replica. A durable queue and retries across workers are production extensions.

SSE replays the current saved run immediately on connection and closes after a terminal result. The UI uses a polling fallback while runs are active. Each event includes a timestamp. Reopening a run retrieves persisted data, not transient frontend state.

## Access and upload handling

Optional HTTP Basic authentication protects every route, including uploaded documents and sample files. Use both APP_USER and APP_PASSWORD, and HTTPS when hosted. This is a shared demo workspace, not per-user authorization. State-changing API routes reject mismatched browser origins. Uploads are limited to one 10 MB PDF, have a PDF header check, and are parsed in a subprocess invoked with argument arrays rather than a shell. HTML text rendering uses React escaping.

This does not include production malware scanning, a sandbox for hostile PDFs, abuse protection across IPs, encrypted-at-rest storage, granular roles, a secrets manager or immutable signed audit logs. Use only synthetic data for the recruitment demo.

## Scope boundaries to explain honestly

- One invoice per PDF; repeated labels trigger review where detected. Robust document splitting is out of scope.
- English labels/OCR and two-decimal currencies; INR and USD fixtures only.
- No bank verification, goods-received check, tax-compliance validation or payment execution.
- No per-line PO quantities/prices, discounts/credit-note workflows or tax-inclusive amount inference. Unclear financial breakdowns require review.
- Reviewer notes record context but do not override rules. There is no final human-approval/payment workflow.
- No inbox integration: upload is the input mechanism chosen for the assignment.
- Purchase-order CSVs are exported fixtures; changing the database requires deliberate seed editing/reset, not a live spreadsheet sync.
- LLM integration is implemented, but live API behavior requires verification with the user's API account.

## How to extend after the interview

Add per-field source highlighting and model evaluation first. Then add revision handling, reviewer authentication, proper human approval transitions, PO line-item matching and goods-received records. Move to PostgreSQL transactions and a durable queue for multiple workers; retain files in object storage. Add monitoring, access logs and lifecycle retention before real business data.
