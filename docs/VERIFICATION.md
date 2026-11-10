# Verification record

Verified in the authoring environment on 2026-11-05:

- TypeScript type check and Vite production build completed successfully.
- All 17 automated tests passed (16 domain/extraction tests and one end-to-end integration test exercising 12 invoice fixtures and additional API behaviors).
- Repeated the tests with the exact pinned Python dependencies in an isolated virtual environment; all passed.
- Integration coverage: real embedded PDF text, real scanned-PDF OCR, duplicate/alias identity, partial-invoice balance accounting, review/error non-reservation, invalid PDF handling, JSON export, reviewer notes, source-PDF serving, final SSE replay, origin rejection, parallel duplicate submissions and restart persistence.
- Browser QA: rendered desktop dashboard, clean invoice processing, ambiguous PO review, extracted fields and visible decision explanations.
- PDF visual QA: inspected the generated invoice layout; source content was readable without clipping.

Not verified here:

- A live OpenAI API call (no API key was supplied).
- Docker image build (Docker was not installed in this environment).
- A publicly hosted deployment or live recruitment link.
- Mobile-browser rendering on a physical device; responsive CSS is included.

The local application is fully runnable. Complete API-account verification and deployed-environment rehearsal before submitting it for recruitment.
