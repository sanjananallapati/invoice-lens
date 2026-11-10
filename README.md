# Invoice Lens

A runnable PS-1 invoice-processing submission: upload a PDF, read its real contents, match procurement records, evaluate deterministic rules, and inspect the decision and audit trail.

**Start here:** use the Docker option below if you want the fewest setup steps. The included samples work without an API key. To evaluate varied invoice layouts with an LLM, enable OpenAI mode after the local workflow works.

## What you receive

- React + TypeScript interface with upload/drop zone, sample runner, real processing progress, original PDF viewer, extracted fields, expandable rule explanations, PO balances, reviewer notes, search/filter history, and JSON decision export.
- Node.js + Express + TypeScript backend; persistent SQLite database and retained PDF uploads.
- Python PDF reader using PyMuPDF; real Tesseract OCR for image-only pages.
- Optional OpenAI structured extraction with schema validation, retries and source checks.
- Five fictional vendors, eight POs, CSV/JSON datasets, and twelve actual invoice PDFs, including an image-only scanned PDF.
- Automated tests, Docker configuration, architecture notes, scenario guide and a five-minute demo script.

This is a working single-workspace prototype, not a trained model or a production payment platform. `APPROVED` means all configured checks passed and the amount is reserved against the PO; it does not send a payment or constitute a human payment authorization.

## 1. Run with Docker (simplest, including Windows)

Install Docker Desktop and start it. Extract this archive. Open a terminal **inside the `invoice-lens` folder**, where `package.json` and `compose.yaml` are located.

Create the configuration file:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

Then, on any of those systems:

```bash
docker compose up --build
```

Wait until the logs say `Invoice Lens running`. Open **http://localhost:3000**.

Choose **Clean invoice** and click **Run sample**. It should show **Checks passed**. The sample button downloads the actual PDF and sends it through the same upload endpoint as your own files.

Stop with Ctrl+C, or `docker compose down`. The named `invoice_data` volume preserves records and PDFs between starts.

Run the automated checks in the container:

```bash
docker compose exec app npm run check
```

Docker configuration is included but was not built in the authoring environment because Docker was unavailable. The underlying application was built and tested natively.

## 2. Run without Docker

Requirements: **Node.js 24.x**, **Python 3.11+**, and **Tesseract OCR with English language data**.

### Windows PowerShell

Install Node.js 24 and Python. Install Tesseract using a Windows distribution linked from the official Tesseract installation documentation. Add its installation folder (often `C:\Program Files\Tesseract-OCR`) to PATH, then open a new terminal.

```powershell
node --version
python --version
tesseract --version
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `.env` in a text editor and change the Python setting to:

```dotenv
PYTHON_BIN=.venv/Scripts/python.exe
```

Start the app:

```powershell
npm run dev
```

### macOS / Linux

Install Tesseract with your system package manager (`brew install tesseract` on macOS, or `sudo apt-get install tesseract-ocr tesseract-ocr-eng` on Debian/Ubuntu). Then:

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```

Set `PYTHON_BIN=.venv/bin/python` in `.env`, then:

```bash
npm run dev
```

Open **http://localhost:3000**. No separate frontend server or database server is required. The initial procurement dataset is loaded automatically on first startup.

## 3. Enable real LLM extraction

The default `local` mode uses explicit English label patterns. It is an honest, limited offline parser, not an AI model. OCR actually runs for scanned pages. It can read your own PDFs if they use supported labels, but it is not suitable for arbitrary layouts.

To enable LLM extraction, edit `.env`:

```dotenv
EXTRACTION_MODE=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Use a model available to your API account that supports Chat Completions and strict structured outputs. The key stays on the server. This mode sends extracted invoice text (including OCR text) to OpenAI. It does not transmit the procurement database. ChatGPT subscriptions do not supply API credentials for this application.

Restart the native server, or run:

```bash
docker compose up -d --force-recreate
```

The UI should report OpenAI extraction. If the key/model/quota is invalid, the run shows an error and consumes no PO balance; it does not silently fall back to local extraction. Missing fields remain null. Structured JSON is validated with Zod, and unsupported extracted values trigger review.

**Verification boundary:** the local workflow and actual OCR were tested. A live OpenAI call was not tested because no API key was supplied. Run the same scenario set with your API account before recording the submission video; model extraction may conservatively route a case to review.

## 4. Rehearse the intended cases

On a fresh database, run:

1. `01-clean.pdf` → **Checks passed**.
2. `02-renamed-duplicate.pdf` → **Blocked**: alias and normalized invoice identity match the earlier invoice, despite a new PDF layout/hash.
3. `03-partial-first.pdf` → **Checks passed**: PO-102 had 30,000 already billed; this reserves another 25,000.
4. `04-partial-overrun.pdf` → **Blocked**: another 30,000 would bring cumulative billing to 85,000 against an 80,000 PO.
5. `05-ambiguous.pdf` → **Needs review**: two plausible POs and no explicit reference.
6. `06-math-mismatch.pdf` → **Needs review**: subtotal plus tax does not equal the printed total.

These provide the clean path plus four business edge cases required for your chosen scope. Additional fixtures exercise unapproved vendors, missing invoice identity, currency mismatch, bounded tolerance, scanned input and wrong-vendor PO references.

See `docs/SCENARIOS.md` for every expected result. Re-uploading an already processed sample correctly flags a duplicate. Expectations depend on the run order and prior records, not the filename.

## 5. Reset a local rehearsal safely

Stop the server before resetting. This command **archives** the data directory rather than deleting it:

```bash
npm run reset -- --confirm
npm run dev
```

For Docker, stop the service and archive the contents inside the persistent volume:

```bash
docker compose stop app
docker compose run --rm app node -e "const f=require('fs'),p='/app/data',b=p+'/rehearsal-backup-'+Date.now(); f.mkdirSync(b); for(const n of f.readdirSync(p)){if(!n.startsWith('rehearsal-backup-'))f.renameSync(p+'/'+n,b+'/'+n)}; console.log('Archived old runs in '+b)"
docker compose up -d
```

The next start seeds a fresh database. Do not reset while invoices are processing.

## 6. Build and test

```bash
npm run build
npm test
```

`npm run check` does both. The integration test builds a separate temporary database, starts its own server on a free port, processes all 12 PDFs, checks real OCR, malformed uploads, repeated/parallel submissions, balance preservation, notes, export, cross-origin-write protection and restart persistence. It does not modify your demo data.

For a production-mode local run:

```bash
npm run build
npm start
```

`npm run build` checks TypeScript and bundles the React frontend. The Node backend runs TypeScript through `node --import tsx`.

## 7. Make a runnable link for the recruitment submission

This archive is runnable locally; it has **not** been publicly deployed. Zamp asks for a live runnable link and a demo video, so deploy after testing locally.

Use a host that can run this Docker image and attach persistent disk storage (a container host or Linux VM):

1. Put the project in your Git repository; never commit `.env`, `data`, or credentials.
2. Build using the supplied `Dockerfile` and expose container port 3000.
3. Attach a persistent disk at `/app/data`. Set `DATA_DIR=/app/data`.
4. Set the extraction variables and API key as server-side secrets.
5. Set both `APP_USER` and a strong `APP_PASSWORD` for the shared demo workspace. Give the reviewer those credentials separately.
6. Enable HTTPS using the hosting platform's TLS proxy.
7. Run **one replica**. This prototype uses a single-process queue and local SQLite file; do not scale it horizontally.
8. Check the deployed upload, sample run, SSE progress, PDF viewer and history after a restart.

Static-only hosting cannot run this backend. An ephemeral disk will lose uploads and decisions on redeployment. This prototype intentionally avoids a cloud storage/database account for local setup. For a multi-user production system, migrate to PostgreSQL, object storage, a durable worker queue and user-level authorization.

## Repository map

| Path | Responsibility |
|---|---|
| `src/main.tsx`, `src/style.css` | React interface and responsive styling |
| `server/index.ts` | Upload API, serial processing queue, SSE progress, HTTP access control |
| `server/extract.ts` | Local/LLM extraction, schema validation, source and OCR checks |
| `server/domain.ts` | Deterministic decision rules and integer-money arithmetic |
| `server/store.ts` | SQLite persistence and procurement seed loading |
| `scripts/read_pdf.py` | PDF text extraction and Tesseract OCR |
| `scripts/generate_data.py` | Reproducible synthetic datasets and PDFs |
| `datasets/` | CSV/JSON procurement data and sample invoices |
| `tests/` | Unit and end-to-end tests |
| `docs/ARCHITECTURE.md` | Design decisions, assumptions and limitations |
| `docs/DEMO_SCRIPT.md` | Five-minute walkthrough and interview preparation |

## Troubleshooting

- **`node:sqlite` unavailable:** install Node.js 24.x, then rerun `npm ci`.
- **Python cannot be found:** set `PYTHON_BIN` to the interpreter where requirements were installed. Paths with spaces are supported; no shell is used for PDF processing.
- **`No module named fitz`:** install requirements with that same Python interpreter. Do not install the unrelated package named `fitz`.
- **OCR cannot start:** verify `tesseract --version` works in the terminal that starts the server. Docker includes it.
- **Sample now says duplicate:** expected after a previous run. Use the documented reset procedure for a fresh rehearsal.
- **Changed CSV has no effect:** runtime seed data comes from JSON and is loaded once into SQLite. Edit the corresponding JSON, archive the old database, and restart. The CSVs are readable exports, not live spreadsheet integrations.
- **Blank PDF viewer:** use the file endpoint in a separate tab or download the source; browser PDF support varies.
- **Port 3000 occupied:** set `PORT=3001` in `.env` for native runs, or change the host side of the Docker port mapping to `3001:3000`.

## Technical references

- Structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Chat Completions API: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- Node 24 SQLite: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- Tesseract installation: https://tesseract-ocr.github.io/tessdoc/Installation.html

See `docs/ARCHITECTURE.md` for what the prototype deliberately does and does not verify.
