import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

function LexUpload({ onAnalysisStart, onAnalysisComplete, onError, endpoint = '/.netlify/functions/analyze-lease' }) {
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [useInsuranceWeight, setUseInsuranceWeight] = useState(false);

  const analyzeCsvViaFunction = useCallback(async (file) => {
    // Route CSV through Netlify function (server analysis)
    try {
      onAnalysisStart();
      setParsing(true);

      const toBase64 = (f) => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });

      const dataUrl = await toBase64(file);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: dataUrl,
          fileName: file.name,
          options: { insuranceWeight: useInsuranceWeight ? 0.05 : 0 }
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server analysis failed');
      }
      const results = await res.json();
      onAnalysisComplete({ provider: 'Lex', ...results });
    } catch (e) {
      console.error(e);
      onError(e.message || 'Failed to analyze file');
    } finally {
      setParsing(false);
      setProgress(0);
    }
  }, [endpoint, onAnalysisStart, onAnalysisComplete, onError, useInsuranceWeight]);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles && rejectedFiles.length > 0) {
      onError('Please choose a .csv file');
      return;
    }
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      analyzeCsvViaFunction(file);
    }
  }, [analyzeCsvViaFunction, onError]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    maxFiles: 1,
    noClick: true
  });

  return (
    <div className="file-upload-container">
      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        <div className="upload-content">
          <div className="upload-icon">🧾</div>
          <h2>Upload Lex Generic Ratebook (CSV)</h2>
          <p>Analyzed via Netlify function (server)</p>

          <div className="file-requirements">
            <h3>File Requirements:</h3>
            <ul>
              <li>CSV format (.csv)</li>
              <li>Include columns for Manufacturer, Model/Derivative, P11D or OTR, Monthly Rental</li>
            </ul>
          </div>

          <button className="upload-button" onClick={open}>Choose CSV File</button>
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ color: '#2d3748', fontWeight: 500 }}>
              <input type="checkbox" checked={useInsuranceWeight} onChange={(e)=>setUseInsuranceWeight(e.target.checked)} style={{ marginRight: '0.5rem' }} />
              Include Insurance Group in score (5% weight)
            </label>
          </div>
        </div>
      </div>

      {parsing && (
        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <p>Processing...</p>
        </div>
      )}
    </div>
  );
}

export default LexUpload;
