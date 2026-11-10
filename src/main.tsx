import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  XCircle,
  AlertTriangle,
  Database,
  BookOpen,
  Activity,
  Plus,
  ExternalLink,
} from "lucide-react";
import "./style.css";
type Run = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  events: { stage: string; message: string; at: string }[];
  invoice?: Record<string, string | null>;
  checks?: { code: string; label: string; state: string; detail: string }[];
  summary?: string;
  error?: string;
  extractionMode?: string;
  reading?: {
    text: string;
    pages: { method: string }[];
    ocrConfidence: number | null;
  };
  balance?: {
    authorized: number;
    previouslyBilled: number;
    remaining: number;
    requested: number;
    tolerance: number;
    projected: number;
  };
  notes: { text: string; at: string }[];
};
type Scenario = {
  id: string;
  title: string;
  expected: string;
  note: string;
  file: string;
};
const labels: Record<string, string> = {
  APPROVED: "Checks passed",
  REVIEW: "Needs review",
  REJECTED: "Blocked",
  ERROR: "Processing error",
  PROCESSING: "Processing",
};
const amount = (n: number, c = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 2,
  }).format(n / 100);
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, options);
  if (!r.ok) {
    let message = `Request failed (${r.status})`;
    try {
      message = (await r.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  return r.json();
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <i />
      {labels[status] || status}
    </span>
  );
}
function App() {
  const [page, setPage] = useState("Overview"),
    [runs, setRuns] = useState<Run[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [scenario, setScenario] = useState("01-clean"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [health, setHealth] = useState<any>(null),
    [proc, setProc] = useState<any>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [tab, setTab] = useState("Decision"),
    [note, setNote] = useState(""),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const run = runs.find((r) => r.id === selected);
  const active = runs.filter((r) => r.status === "PROCESSING");
  const merge = (r: Run) =>
    setRuns((old) =>
      [r, ...old.filter((x) => x.id !== r.id)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
  const reload = async () => {
    const [r, p] = await Promise.all([
      api("/api/runs"),
      api("/api/procurement"),
    ]);
    setRuns(r);
    setProc(p);
  };
  useEffect(() => {
    Promise.all([
      api("/api/health"),
      api("/api/scenarios"),
      api("/api/runs"),
      api("/api/procurement"),
    ])
      .then(([h, s, r, p]) => {
        setHealth(h);
        setScenarios(s);
        setRuns(r);
        setProc(p);
        if (r.length) setSelected(r[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);
  const activeKey = active.map((r) => r.id).join(",");
  useEffect(() => {
    if (!activeKey) return;
    const streams = activeKey.split(",").map((id) => {
      const es = new EventSource(`/api/runs/${id}/events`);
      es.onmessage = (e) => {
        const next = JSON.parse(e.data);
        merge(next);
        if (next.status !== "PROCESSING") {
          es.close();
          api("/api/procurement")
            .then(setProc)
            .catch(() => {});
        }
      };
      es.onerror = () => {
        es.close();
      };
      return es;
    });
    const polling = setInterval(
      () => void reload().catch((e) => setError(e.message)),
      2500,
    );
    return () => {
      streams.forEach((s) => s.close());
      clearInterval(polling);
    };
  }, [activeKey]);
  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF invoice.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("invoice", file);
      const r = await api("/api/runs", { method: "POST", body: data });
      merge(r);
      setSelected(r.id);
      setTab("Decision");
      setPage("Overview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function useSample() {
    setError("");
    setBusy(true);
    try {
      const s = scenarios.find((s) => s.id === scenario)!;
      const r = await fetch(`/api/samples/${s.id}`);
      if (!r.ok) throw new Error("Could not load sample PDF.");
      await upload(
        new File([await r.blob()], s.file, { type: "application/pdf" }),
      );
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }
  const passed = runs.filter((r) => r.status === "APPROVED").length;
  const review = runs.filter((r) => r.status === "REVIEW").length;
  const blocked = runs.filter((r) => r.status === "REJECTED").length;
  const filtered = runs.filter(
    (r) =>
      (filter === "ALL" || r.status === filter) &&
      `${r.name} ${r.invoice?.vendor_name || ""} ${r.invoice?.invoice_number || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const scen = scenarios.find((s) => s.id === scenario);
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <div className="brand-icon">
            <FileText size={23} />
          </div>
          <span>
            invoice<span className="brand-light">lens</span>
            <small>DECISION WORKSPACE</small>
          </span>
        </a>
        <div className="workspace">
          <span className="avatar">AP</span>
          <div>
            Procurement workspace<small>Synthetic demo company</small>
          </div>
        </div>
        <div className="navlabel">WORKSPACE</div>
        <nav>
          {[
            [LayoutDashboard, "Overview"],
            [FolderOpen, "Run history"],
            [Database, "Purchase orders"],
            [BookOpen, "Demo guide"],
          ].map(([Icon, name]: any) => (
            <button
              key={name}
              className={page === name ? "nav active" : "nav"}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              {name}
              {name === "Run history" && (
                <span className="navcount">{runs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <ShieldCheck size={24} />
          <strong>Every decision, explained.</strong>
          <p>
            Source documents, explicit rules, and a traceable audit history.
          </p>
          <div className="mode">
            <span />
            {health
              ? health.mode === "openai"
                ? "OpenAI extraction"
                : "Local extraction + OCR"
              : "Connecting…"}
          </div>
        </div>
        <div className="profile">
          <span className="avatar dark">IL</span>
          <div>
            Invoice Lens<small>PS-1 · Finance operations</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <span className="top-meta">
            <span className="online-dot" />{" "}
            {health ? "Service connected" : "Connecting"}{" "}
            <span className="separator">|</span> Synthetic data
          </span>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <div className="eyebrow">ACCOUNTS PAYABLE, WITH CLARITY</div>
              <h1>{page === "Overview" ? "From invoice to insight." : page}</h1>
              <p>
                {page === "Overview"
                  ? "A clear path from messy documents to confident decisions."
                  : page === "Run history"
                    ? "Every upload, every check, every decision — in one place."
                    : page === "Purchase orders"
                      ? "The procurement records behind every invoice decision."
                      : "A small workflow. Meaningful edge cases. Real execution."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <Plus size={18} />
              New invoice
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
            }}
          />
          {error && (
            <div role="alert" className="error-banner">
              <AlertTriangle size={18} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          {health?.mode === "local" && (
            <div className="mode-notice">
              <Sparkles size={16} />
              <span>
                <strong>Local mode</strong> reads supported invoice labels and
                uses real OCR. Enable OpenAI in the server configuration for
                more varied layouts.
              </span>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="stats">
                {[
                  [
                    FileText,
                    "Invoices processed",
                    runs.filter((r) => r.status !== "PROCESSING").length,
                    "All completed runs",
                    "neutral",
                  ],
                  [
                    CheckCircle2,
                    "Checks passed",
                    passed,
                    "Ready for AP approval",
                    "green",
                  ],
                  [
                    Clock3,
                    "Needs review",
                    review,
                    "Human judgment required",
                    "amber",
                  ],
                  [
                    ShieldCheck,
                    "Blocked",
                    blocked,
                    "Procurement rules enforced",
                    "red",
                  ],
                ].map(([Icon, title, value, sub, color]: any) => (
                  <div className="stat" key={title}>
                    <div className={`stat-icon ${color}`}>
                      <Icon size={19} />
                    </div>
                    <span>{title}</span>
                    <strong>{value.toString().padStart(2, "0")}</strong>
                    <small>{sub}</small>
                  </div>
                ))}
              </div>
              <div className="work-grid">
                <section className="card intake">
                  <div className="card-heading">
                    <div>
                      <h2>Start a new review</h2>
                      <p>Upload an invoice. We’ll follow the evidence.</p>
                    </div>
                    <span className="step-label">01 / INPUT</span>
                  </div>
                  <button
                    disabled={busy}
                    className={`dropzone ${drag ? "dragging" : ""}`}
                    onClick={() => input.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(false);
                      if (!busy && e.dataTransfer.files[0])
                        void upload(e.dataTransfer.files[0]);
                    }}
                  >
                    <span className="upload-icon">
                      {busy ? (
                        <Loader2 className="spin" />
                      ) : (
                        <UploadCloud size={27} />
                      )}
                    </span>
                    <strong>
                      {busy ? "Uploading invoice…" : "Drop your invoice here"}
                    </strong>
                    <span>
                      or <u>browse files</u> to get started
                    </span>
                    <small>PDF up to 10 MB · maximum 10 pages</small>
                  </button>
                  <div className="or">
                    <span />
                    OR TRY A REAL SAMPLE
                    <span />
                  </div>
                  <label className="field-label" htmlFor="scenario">
                    Choose a scenario
                  </label>
                  <select
                    id="scenario"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                  >
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <p className="scenario-note">{scen?.note}</p>
                  <div className="sample-actions">
                    <button
                      className="secondary"
                      disabled={busy || !scen}
                      onClick={() => void useSample()}
                    >
                      Run sample <ArrowRight size={16} />
                    </button>
                    {scen && (
                      <a
                        title="Download sample PDF"
                        className="icon-button"
                        href={`/api/samples/${scenario}`}
                      >
                        <Download size={18} />
                      </a>
                    )}
                  </div>
                  <div className="assurance">
                    <ShieldCheck size={16} />
                    <span>
                      AI extracts. Rules decide. Humans stay in control.
                    </span>
                  </div>
                </section>
                <section className="card result">
                  {run ? (
                    <>
                      <div className="card-heading">
                        <div>
                          <h2>
                            {run.status === "PROCESSING"
                              ? "Following the evidence…"
                              : "Decision workspace"}
                          </h2>
                          <p className="filename">{run.name}</p>
                        </div>
                        <Badge status={run.status} />
                      </div>
                      <div className="tabs">
                        {[
                          "Decision",
                          "Extracted data",
                          "Source PDF",
                          "Audit trail",
                        ].map((t) => (
                          <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={tab === t ? "selected" : ""}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      {run.status === "PROCESSING" ? (
                        <div className="pipeline">
                          <div className="processing-orb">
                            <Loader2 size={32} className="spin" />
                          </div>
                          <h3>Processing your document</h3>
                          <p>Stages below reflect actual backend execution.</p>
                          {run.events.map((e, i) => (
                            <div className="pipeline-row" key={i}>
                              <CheckCircle2 size={17} />
                              <div>
                                <strong>{e.stage}</strong>
                                <small>{e.message}</small>
                              </div>
                              <time>{new Date(e.at).toLocaleTimeString()}</time>
                            </div>
                          ))}
                        </div>
                      ) : run.status === "ERROR" ? (
                        <div className="error-state">
                          <XCircle size={35} />
                          <h3>Processing could not finish</h3>
                          <p>{run.error}</p>
                          <small>
                            No approval was recorded and no PO balance was
                            consumed.
                          </small>
                          <button
                            className="secondary"
                            onClick={() => input.current?.click()}
                          >
                            Upload again
                          </button>
                        </div>
                      ) : tab === "Decision" ? (
                        <>
                          <div
                            className={`verdict ${run.status.toLowerCase()}`}
                          >
                            <div className="verdict-icon">
                              {run.status === "APPROVED" ? (
                                <CheckCircle2 />
                              ) : run.status === "REVIEW" ? (
                                <AlertTriangle />
                              ) : (
                                <ShieldCheck />
                              )}
                            </div>
                            <div>
                              <h3>{labels[run.status]}</h3>
                              <p>{run.summary}</p>
                            </div>
                          </div>
                          <div className="invoice-strip">
                            <div>
                              <small>VENDOR</small>
                              <strong>
                                {run.invoice?.vendor_name || "Not identified"}
                              </strong>
                            </div>
                            <div>
                              <small>INVOICE TOTAL</small>
                              <strong>
                                {run.invoice?.total
                                  ? `${run.invoice.currency || ""} ${Number(run.invoice.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                  : "Not found"}
                              </strong>
                            </div>
                          </div>
                          <div className="check-heading">
                            <strong>Decision checks</strong>
                            <span>
                              {
                                run.checks?.filter((c) => c.state === "pass")
                                  .length
                              }{" "}
                              / {run.checks?.length} passed
                            </span>
                          </div>
                          <div className="checks">
                            {run.checks?.map((c) => (
                              <details
                                key={c.code}
                                className={`check ${c.state}`}
                                open={c.state !== "pass"}
                              >
                                <summary>
                                  {c.state === "pass" ? (
                                    <CheckCircle2 size={17} />
                                  ) : c.state === "fail" ? (
                                    <XCircle size={17} />
                                  ) : (
                                    <AlertTriangle size={17} />
                                  )}
                                  <span>{c.label}</span>
                                  <small>
                                    {c.state === "pass"
                                      ? "Passed"
                                      : c.state === "fail"
                                        ? "Blocked"
                                        : "Review"}
                                  </small>
                                  <ChevronRight size={14} />
                                </summary>
                                <p>{c.detail}</p>
                              </details>
                            ))}
                          </div>
                          {run.balance && (
                            <div className="balance">
                              <div>
                                <strong>PO balance check</strong>
                                <span>{run.invoice?.po_number}</span>
                              </div>
                              <div className="balance-track">
                                <span
                                  style={{
                                    width: `${Math.min(100, (run.balance.previouslyBilled / run.balance.authorized) * 100)}%`,
                                  }}
                                />
                                <i
                                  style={{
                                    width: `${Math.min(100 - (run.balance.previouslyBilled / run.balance.authorized) * 100, Math.max(0, (run.balance.requested / run.balance.authorized) * 100))}%`,
                                  }}
                                />
                              </div>
                              <div className="balance-labels">
                                <span>
                                  Already billed{" "}
                                  <b>
                                    {amount(
                                      run.balance.previouslyBilled,
                                      run.invoice?.currency || "INR",
                                    )}
                                  </b>
                                </span>
                                <span>
                                  PO authorized{" "}
                                  <b>
                                    {amount(
                                      run.balance.authorized,
                                      run.invoice?.currency || "INR",
                                    )}
                                  </b>
                                </span>
                              </div>
                              <small>
                                Snapshot at decision time. Green = previously
                                billed; light green = requested. Currency
                                mismatches are held for review.
                              </small>
                            </div>
                          )}
                        </>
                      ) : tab === "Extracted data" ? (
                        <div className="extracted">
                          <div className="subtle-label">
                            {run.extractionMode === "openai"
                              ? "OpenAI structured extraction"
                              : "Local label-based extraction"}{" "}
                            ·{" "}
                            {run.reading?.pages.map((p) => p.method).join(", ")}
                          </div>
                          {Object.entries(run.invoice || {}).map(
                            ([key, value]) => (
                              <div className="field-row" key={key}>
                                <span>{key.replaceAll("_", " ")}</span>
                                <strong>{value || <em>Not found</em>}</strong>
                              </div>
                            ),
                          )}
                          <details className="raw">
                            <summary>View extracted source text</summary>
                            <pre>{run.reading?.text}</pre>
                          </details>
                        </div>
                      ) : tab === "Source PDF" ? (
                        <iframe
                          title="Original invoice PDF"
                          src={`/api/runs/${run.id}/file`}
                          className="pdf-view"
                        />
                      ) : (
                        <div className="audit">
                          {run.events.map((e, i) => (
                            <div className="audit-event" key={i}>
                              <span className="audit-dot" />
                              <div>
                                <strong>{e.stage}</strong>
                                <p>{e.message}</p>
                                <small>{new Date(e.at).toLocaleString()}</small>
                              </div>
                            </div>
                          ))}
                          {run.notes?.map((n, i) => (
                            <div className="review-note" key={i}>
                              <strong>Reviewer note</strong>
                              <p>{n.text}</p>
                              <small>{new Date(n.at).toLocaleString()}</small>
                            </div>
                          ))}
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              try {
                                merge(
                                  await api(`/api/runs/${run.id}/notes`, {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({ text: note }),
                                  }),
                                );
                                setNote("");
                              } catch (e: any) {
                                setError(e.message);
                              }
                            }}
                          >
                            <label htmlFor="note" className="field-label">
                              Add a reviewer note
                            </label>
                            <textarea
                              id="note"
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              maxLength={2000}
                              required
                              placeholder="Document what needs clarification. Notes do not override checks."
                            />
                            <button className="secondary" type="submit">
                              Save note
                            </button>
                          </form>
                        </div>
                      )}
                      <div className="result-footer">
                        <span>
                          <Activity size={13} />
                          Run {run.id.slice(0, 8)}
                        </span>
                        <a href={`/api/runs/${run.id}/export`}>
                          <Download size={14} />
                          Export decision
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="empty-result">
                      <div className="empty-art">
                        <div className="paper">
                          <FileText size={34} />
                          <span />
                          <span />
                          <span />
                        </div>
                        <div className="float-check">
                          <Check size={22} />
                        </div>
                        <div className="dotted-orbit" />
                      </div>
                      <span className="eyebrow">
                        YOUR NEXT DECISION STARTS HERE
                      </span>
                      <h2>Less chasing. More clarity.</h2>
                      <p>
                        Upload an invoice or try a sample to see
                        <br />
                        its journey from document to decision.
                      </p>
                      <div className="empty-steps">
                        <span>Read</span>
                        <ChevronRight size={14} />
                        <span>Match</span>
                        <ChevronRight size={14} />
                        <span>Validate</span>
                        <ChevronRight size={14} />
                        <span>Decide</span>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {(page === "Overview" || page === "Run history") && (
            <section className="card history">
              <div className="card-heading">
                <div>
                  <h2>
                    {page === "Overview"
                      ? "Recent activity"
                      : "All invoice runs"}
                  </h2>
                  <p>A complete record of what happened and why.</p>
                </div>
                {page === "Overview" && (
                  <button
                    className="text-button"
                    onClick={() => setPage("Run history")}
                  >
                    View all runs <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
              <div className="table-tools">
                <div className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search invoice runs"
                    placeholder="Search vendor or invoice…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="ALL">All statuses</option>
                  {Object.entries(labels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice / document</th>
                      <th>Vendor</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Processed</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .slice(0, page === "Overview" ? 5 : undefined)
                      .map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="file-button"
                              onClick={() => {
                                setSelected(r.id);
                                setPage("Overview");
                                setTab("Decision");
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              <span className="file-icon">
                                <FileText size={17} />
                              </span>
                              <span>
                                {r.invoice?.invoice_number || r.name}
                                <small>{r.name}</small>
                              </span>
                            </button>
                          </td>
                          <td>{r.invoice?.vendor_name || "—"}</td>
                          <td className="nowrap">
                            {r.invoice?.total
                              ? `${r.invoice.currency || ""} ${Number(r.invoice.total).toLocaleString("en-IN")}`
                              : "—"}
                          </td>
                          <td>
                            <Badge status={r.status} />
                          </td>
                          <td className="nowrap muted">
                            {new Date(r.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td>
                            <button
                              aria-label={`Open ${r.name}`}
                              className="icon-button"
                              onClick={() => {
                                setSelected(r.id);
                                setPage("Overview");
                                setTab("Decision");
                                window.scrollTo(0, 0);
                              }}
                            >
                              <ArrowUpRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <div className="empty-table">
                    <FolderOpen size={24} />
                    <strong>
                      {runs.length
                        ? "No matching runs"
                        : "Your workspace is ready"}
                    </strong>
                    <span>
                      {runs.length
                        ? "Try another search or status."
                        : "Processed invoices will appear here."}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}
          {page === "Purchase orders" && (
            <>
              <div className="info-callout">
                <Database size={22} />
                <div>
                  <strong>One source of truth for spending.</strong>
                  <p>
                    Balances include seeded prior billing and all invoices that
                    passed checks. Review and blocked runs never consume
                    balance.
                  </p>
                </div>
              </div>
              <section className="card">
                <div className="card-heading">
                  <h2>Purchase orders</h2>
                  <span className="step-label">8 SYNTHETIC RECORDS</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>PO reference</th>
                        <th>Vendor / purpose</th>
                        <th>Authorized</th>
                        <th>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proc?.pos.map((p: any) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.id}</strong>
                          </td>
                          <td>
                            {
                              proc.vendors.find(
                                (v: any) => v.id === p.vendor_id,
                              )?.name
                            }
                            <small>{p.description}</small>
                          </td>
                          <td>
                            {amount(
                              Math.round(Number(p.amount) * 100),
                              p.currency,
                            )}
                          </td>
                          <td>{amount(p.remainingMinor, p.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card vendors">
                <div className="card-heading">
                  <h2>Vendor registry</h2>
                </div>
                {proc?.vendors.map((v: any) => (
                  <div className="vendor-row" key={v.id}>
                    <span className="avatar">
                      {v.name
                        .split(" ")
                        .map((s: string) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <strong>{v.name}</strong>
                      <small>
                        {v.id}
                        {v.aliases.length
                          ? ` · Alias: ${v.aliases.join(", ")}`
                          : ""}
                      </small>
                    </div>
                    <Badge status={v.approved ? "APPROVED" : "REJECTED"} />
                  </div>
                ))}
              </section>
            </>
          )}
          {page === "Demo guide" && (
            <>
              <div className="guide-hero">
                <span className="eyebrow">BUILT TO BE EXPLAINED</span>
                <h2>
                  A document reader.
                  <br />A deliberate decision engine.
                </h2>
                <p>
                  Real PDFs flow through extraction, validation, matching and
                  rules. Outcomes are computed from document content and current
                  PO balances — never from a filename.
                </p>
                <div className="guide-pill">
                  <ShieldCheck size={17} />
                  No payment is initiated by this application.
                </div>
              </div>
              <div className="guide-grid">
                {[
                  [
                    "01",
                    "Start with a clean invoice",
                    "Run 01-clean. Inspect extracted fields and expand a passed check. Explain the separation between AI interpretation and deterministic rules.",
                  ],
                  [
                    "02",
                    "Reveal a disguised duplicate",
                    "Run 02 after 01. The PDF is different, and the vendor uses an alias. Canonical vendor identity and a normalized invoice number still catch it.",
                  ],
                  [
                    "03",
                    "Expose cumulative overbilling",
                    "Run 03, then 04. A new invoice can be below the original PO amount and still exceed its remaining balance.",
                  ],
                  [
                    "04",
                    "Show appropriate uncertainty",
                    "Run 05 and 06. Ambiguous PO references and inconsistent arithmetic require human review instead of a confident guess.",
                  ],
                ].map(([n, title, body]) => (
                  <section className="card guide-card" key={n}>
                    <span>{n}</span>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </section>
                ))}
              </div>
              <section className="card guide-card">
                <h3>Know the boundaries</h3>
                <p>
                  Local extraction supports the supplied English invoice labels.
                  OpenAI mode handles varied text layouts, with source-evidence
                  checks. Scanned pages use Tesseract; low-quality OCR goes to
                  review. This prototype checks invoice totals, not individual
                  PO line quantities, tax-law correctness, bank details, or
                  receipt of goods. Notes preserve review context; an approval
                  override is intentionally not implemented.
                </p>
                <p>
                  All sample expectations assume a fresh database and the
                  documented run order. Re-running an approved sample correctly
                  produces a duplicate result. To rehearse again, stop the
                  server and use the reset command in README.md.
                </p>
              </section>
            </>
          )}
          <footer>
            Invoice Lens <span>·</span> Explainable invoice processing{" "}
            <span>·</span> Synthetic demo data
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
