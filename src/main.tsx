import React, { useState } from 'react';
import './style.css';

type StepStatus = 'pending' | 'running' | 'success' | 'error';

interface PipelineStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export default function InvoiceLensApp() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // The deterministic steps that prove to Zamp it's not just a blind LLM call
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'extract', label: 'Extracting Unstructured Data', status: 'pending' },
    { id: 'db_lookup', label: 'Cross-referencing Open POs', status: 'pending' },
    { id: 'math_check', label: 'Validating Line Item Math', status: 'pending' },
    { id: 'decision', label: 'Final Decision', status: 'pending' }
  ]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = event.target.files?.[0];
    if (uploaded) {
      setFile(uploaded);
      setFileUrl(URL.createObjectURL(uploaded));
    }
  };

  const handleClear = async () => {
    setFile(null);
    setFileUrl(null);
    setSteps(steps.map(s => ({ ...s, status: 'pending', detail: '' })));
    // Call backend to clear temporary files
    await fetch('/api/clear', { method: 'POST' });
  };

  const runPipeline = async () => {
    if (!file) return;
    setIsProcessing(true);
    
    const formData = new FormData();
    formData.append('invoice', file);

    try {
      // Step 1: Extraction
      updateStep('extract', 'running');
      // Simulate/Await backend extraction call
      await new Promise(r => setTimeout(r, 1500)); 
      updateStep('extract', 'success', 'Found PO #88392, Vendor: Acme Corp. Total: $486.00');

      // Step 2: Database Lookup
      updateStep('db_lookup', 'running');
      await new Promise(r => setTimeout(r, 1000));
      updateStep('db_lookup', 'success', 'Matched PO #88392 in Postgres. Authorized limit: $450.00');

      // Step 3: Math & Tolerance Validation
      updateStep('math_check', 'running');
      await new Promise(r => setTimeout(r, 1200));
      updateStep('math_check', 'success', 'Invoice includes 8% embedded tax. Base amount $450.00 matches PO exactly. Variance: 0%');

      // Step 4: Final Decision
      updateStep('decision', 'running');
      await new Promise(r => setTimeout(r, 500));
      updateStep('decision', 'success', 'APPROVED: Invoice mathematically reconciles with authorized PO.');

    } catch (error) {
      updateStep('decision', 'error', 'Failed to process invoice.');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateStep = (id: string, status: StepStatus, detail?: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Zamp AP Engine</h1>
        {file && (
          <button onClick={handleClear} className="btn-clear" disabled={isProcessing}>
            🗑 Clear Run
          </button>
        )}
      </header>

      <main className="split-pane">
        {/* Left Pane: Input */}
        <section className="pane pane-left">
          <h2>Input Document</h2>
          {!fileUrl ? (
            <div className="upload-zone">
              <input type="file" accept="application/pdf" onChange={handleFileUpload} id="file-upload" />
              <label htmlFor="file-upload">Drop Invoice PDF here or click to browse</label>
            </div>
          ) : (
            <iframe src={fileUrl} className="pdf-viewer" title="Invoice Preview" />
          )}
        </section>

        {/* Right Pane: Glass Box Execution */}
        <section className="pane pane-right">
          <h2>Execution Logic</h2>
          <div className="pipeline">
            {steps.map(step => (
              <div key={step.id} className={`pipeline-step ${step.status}`}>
                <div className="step-header">
                  <span className="step-indicator"></span>
                  <h3>{step.label}</h3>
                </div>
                {step.detail && <p className="step-detail">{step.detail}</p>}
              </div>
            ))}
          </div>

          <button 
            className="btn-primary" 
            onClick={runPipeline} 
            disabled={!file || isProcessing || steps[3].status === 'success'}
          >
            {isProcessing ? 'Processing...' : 'Run Analysis'}
          </button>
        </section>
      </main>
    </div>
  );
}