import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import LexUpload from './components/LexUpload';
import ResultsDisplay from './components/ResultsDisplay';
import './App.css';

function App() {
  const [providerTab, setProviderTab] = useState('ALD');
  const [analysisResults, setAnalysisResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalysisComplete = (results) => {
    setAnalysisResults(results);
    setLoading(false);
    setError(null);
  };

  const handleAnalysisStart = () => {
    setLoading(true);
    setError(null);
    setAnalysisResults(null);
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
    setLoading(false);
    setAnalysisResults(null);
  };

  const resetApp = () => {
    setAnalysisResults(null);
    setLoading(false);
    setError(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🚗 Vehicle Lease Analyzer</h1>
        <p>Select a provider and upload a file to analyze and score deals</p>
      </header>

      <main className="App-main">
        {!analysisResults && !loading && (
          <>
            <div className="view-tabs" style={{ marginBottom: '1rem' }}>
              <button 
                className={providerTab === 'ALD' ? 'tab active' : 'tab'}
                onClick={() => { setProviderTab('ALD'); resetApp(); }}
              >
                ALD
              </button>
              <button 
                className={providerTab === 'Lex' ? 'tab active' : 'tab'}
                onClick={() => { setProviderTab('Lex'); resetApp(); }}
              >
                Lex
              </button>
            </div>

            {providerTab === 'ALD' && (
              <FileUpload
                onAnalysisStart={handleAnalysisStart}
                onAnalysisComplete={(res) => handleAnalysisComplete({ provider: 'ALD', ...res })}
                onError={handleError}
                endpoint='/.netlify/functions/analyze-lease'
                title='Upload ALD Lease Spreadsheet'
                helperText='Drag & drop an Excel file (.xlsx/.xls), or click to browse'
                icon='📊'
                showInsuranceToggle={true}
              />
            )}

            {providerTab === 'Lex' && (
              <LexUpload
                onAnalysisStart={handleAnalysisStart}
                onAnalysisComplete={handleAnalysisComplete}
                onError={handleError}
              />
            )}
          </>
        )}

        {loading && (
          <div className="loading-container">
            <div className="spinner"></div>
            <h2>Analyzing your lease data...</h2>
            <p>This may take a few moments for large files</p>
          </div>
        )}

        {error && (
          <div className="error-container">
            <h2>❌ Analysis Failed</h2>
            <p>{error}</p>
            <button onClick={resetApp} className="retry-button">
              Try Again
            </button>
          </div>
        )}

        {analysisResults && (
          <ResultsDisplay
            results={analysisResults}
            onReset={resetApp}
          />
        )}
      </main>

      <footer className="App-footer">
        <p>Powered by advanced lease scoring algorithms</p>
      </footer>
    </div>
  );
}

export default App;
