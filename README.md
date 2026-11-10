# Invoice Lens — Intelligent Invoice Processing & Validation

<p align="center">
  <strong>Automated invoice extraction, procurement matching, and financial validation.</strong>
</p>

<p align="center">
  <a href="[https://invoice-lens.onrender.com](https://invoice-lens.onrender.com/)">🚀 Live Application</a> ·
  <a href="https://github.com/sanjananallapati/invoice-lens">GitHub Repository</a>
</p>

---

## Overview

**Invoice Lens** is an invoice-processing and validation application that automates the process of reading supplier invoices, matching them against procurement records, and evaluating financial business rules.

The application extracts invoice information from PDF documents, validates vendor identities and purchase order references, detects duplicate invoices, checks cumulative billing limits, and generates transparent processing decisions with an audit trail.

It combines a React-based interface, a Node.js backend, Python-powered PDF extraction, and SQLite persistence in a Dockerized application.

**Live Demo:** https://invoice-lens.onrender.com

**Extraction Mode:** Local extraction (no external AI API required).

---

## Key Features

### 1. Invoice Upload & Processing
- Upload PDF invoices using a file picker or drag-and-drop interface.
- Process actual invoice documents rather than relying on predefined sample outputs.
- Display real-time processing progress.
- View original PDF documents alongside extracted information.

### 2. Invoice Data Extraction
- Extract invoice information using Python and PyMuPDF.
- Support scanned, image-based PDF pages through Tesseract OCR.
- Support optional OpenAI structured extraction mode.
- Validate extracted information against a defined schema.
- Flag missing or uncertain information for review.

### 3. Procurement Matching
- Match invoices against vendor records.
- Identify relevant purchase orders.
- Validate vendor and purchase order ownership.
- Calculate remaining purchase order balances.
- Track cumulative invoice amounts.

### 4. Financial Validation
- Detect duplicate invoices, including renamed PDF files.
- Identify invoice total and tax calculation mismatches.
- Detect purchase order overbilling.
- Validate currency consistency.
- Identify unapproved vendors.
- Flag missing invoice identifiers.
- Apply configurable tolerance rules.

### 5. Decision & Audit Trail
- Generate clear processing decisions:
  - **Checks Passed**
  - **Blocked**
  - **Needs Review**
- Display explanations for individual validation rules.
- Maintain invoice processing history.
- Allow reviewers to add notes.
- Export processing decisions as JSON.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express.js, TypeScript |
| PDF Processing | Python, PyMuPDF |
| OCR | Tesseract OCR |
| Optional AI Extraction | OpenAI API, Structured Outputs |
| Database | SQLite |
| Validation | Zod, deterministic business rules |
| Containerization | Docker, Docker Compose |
| Hosting | Render |
| Version Control | Git, GitHub |

---

## Application Architecture

```text
              User / Reviewer
                     |
                     v
             React + TypeScript
                (Frontend)
                     |
                     v
             Express.js Backend
                (REST API)
                     |
          +----------+----------+
          |                     |
          v                     v
    Python PDF Reader     Procurement Data
     PyMuPDF + OCR        Vendors + POs
          |
          v
    Invoice Extraction
    (Local / Optional AI)
          |
          v
    Validation Engine
          |
          v
    Business Rule Evaluation
          |
          v
    Decision & Audit Trail
          |
          v
       SQLite Database
```

The application runs as a single Docker-based web service. The frontend and backend are served through the same deployment.

---

## Business Validation Scenarios

The project includes 12 sample invoice PDFs covering different business scenarios.

| Sample | Scenario | Expected Result |
|---|---|---|
| 01 | Clean invoice | Checks Passed |
| 02 | Renamed duplicate invoice | Blocked |
| 03 | Partial first invoice | Checks Passed |
| 04 | Purchase order overrun | Blocked |
| 05 | Ambiguous purchase order | Needs Review |
| 06 | Mathematical mismatch | Needs Review |
| 07 | Unapproved vendor | Blocked |
| 08 | Missing invoice number | Needs Review |
| 09 | Currency mismatch | Needs Review |
| 10 | Tolerance validation | Depends on configured tolerance |
| 11 | Scanned invoice | OCR extraction |
| 12 | Wrong vendor reference | Blocked |

The application uses deterministic business rules to evaluate invoice decisions. Processing outcomes depend on the existing invoice history and purchase order balances.

---

## Live Deployment

Invoice Lens is deployed using **Render** with Docker.

**Live URL:** https://invoice-lens.onrender.com

### Deployment Configuration

| Configuration | Value |
|---|---|
| Hosting | Render Web Service |
| Runtime | Docker |
| Repository | GitHub |
| Branch | main |
| Container Port | 3000 |
| Extraction Mode | local |
| Data Directory | /app/data |
| Health Endpoint | /api/health |

### Storage Considerations

The application uses SQLite for local data persistence.

For persistent deployment, attach a Render persistent disk mounted at `/app/data`.

The application uses a single-process processing queue and SQLite database. It is designed to run as a single instance rather than being horizontally scaled.

### Authentication

The shared demo workspace is protected using HTTP Basic Authentication.

The application username and password are configured through server-side environment variables:

- `APP_USER`
- `APP_PASSWORD`

Never commit actual credentials or `.env` files to GitHub.

---

## Run Locally

### Prerequisites

- Docker Desktop
- Git
- Node.js 24.x (for native development)
- Python 3.11+
- Tesseract OCR (for native development)

### Option 1: Docker (Recommended)

Clone the repository:

```bash
git clone https://github.com/sanjananallapati/invoice-lens.git
```

Navigate to the project directory:

```bash
cd invoice-lens
```

Create the environment file:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Start the application:

```bash
docker compose up --build
```

Open:

```text
http://localhost:3000
```

The included sample invoices can be used to test the application without an API key.

### Option 2: Native Development

Install dependencies:

```bash
npm ci
```

Create a Python virtual environment:

```bash
python -m venv .venv
```

Install Python dependencies:

```bash
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Copy the environment configuration:

```powershell
Copy-Item .env.example .env
```

Configure `PYTHON_BIN` in `.env`:

```env
PYTHON_BIN=.venv/Scripts/python.exe
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Optional: OpenAI Extraction Mode

The default extraction mode is local.

To enable OpenAI-based structured extraction, configure:

```env
EXTRACTION_MODE=openai
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4.1-mini
```

Restart the application after updating the configuration.

The OpenAI API key must remain server-side and must never be exposed in frontend code or committed to GitHub.

Note: Local extraction uses explicit English label patterns and is more limited than LLM-based extraction. OCR is used for image-only pages.

---

## Testing

Run the complete verification suite:

```bash
npm run check
```

Alternatively:

```bash
npm run build
npm test
```

The test suite covers business rules, invoice processing, duplicate detection, financial validation, upload handling, and database behavior.

---

## Repository Structure

```text
invoice-lens/
│
├── datasets/
│   ├── invoices/
│   ├── purchase_orders.csv
│   ├── purchase_orders.json
│   ├── vendors.csv
│   ├── vendors.json
│   └── scenarios.json
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEMO_SCRIPT.md
│   ├── SCENARIOS.md
│   └── VERIFICATION.md
│
├── scripts/
│   ├── generate_data.py
│   ├── read_pdf.py
│   └── reset.mjs
│
├── server/
│   ├── domain.ts
│   ├── extract.ts
│   ├── index.ts
│   └── store.ts
│
├── src/
│   ├── main.tsx
│   └── style.css
│
├── tests/
│   ├── domain.test.ts
│   └── integration.test.ts
│
├── Dockerfile
├── compose.yaml
├── package.json
├── requirements.txt
├── tsconfig.json
└── vite.config.ts
```

---

## Important Design Considerations

- Invoice decisions are based on deterministic business rules, not solely on AI-generated responses.
- Missing or ambiguous information can be routed for manual review.
- Duplicate detection uses invoice identity and normalized information, not just PDF filenames.
- Monetary calculations use integer-based arithmetic to avoid floating-point rounding issues.
- SQLite and the processing queue are designed for a single application instance.
- An `APPROVED` decision means configured checks passed and the invoice amount was reserved against the purchase order. It does not initiate payment or replace human payment authorization.

This project is a working single-workspace prototype, not a production payment platform.

---

## Author

**Sanjana Nallapati**

GitHub: https://github.com/sanjananallapati

Project: [Invoice Lens](https://github.com/sanjananallapati/invoice-lens)

Live Application: [https://invoice-lens.onrender.com](https://invoice-lens.onrender.com)

---

*Built to demonstrate practical invoice automation, document extraction, procurement validation, and transparent financial decision-making.*
