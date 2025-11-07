import { useState } from 'react';
import FileUploadTabs from '../components/FileUploadTabs';
import ResultsDisplay from '../components/ResultsDisplay';

export function UploadPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upload Rate Sheets</h1>
        <p className="text-muted-foreground">
          Upload and analyze vehicle lease rate sheets from any provider.
        </p>
      </div>

      {!analysisResults && !loading && (
        <FileUploadTabs
          onAnalysisStart={handleAnalysisStart}
          onAnalysisComplete={handleAnalysisComplete}
          onError={handleError}
        />
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <h2 className="text-lg font-medium">Analyzing your lease data...</h2>
          <p className="text-muted-foreground">This may take a few moments for large files</p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <h2 className="text-lg font-medium text-destructive">❌ Analysis Failed</h2>
          <p className="text-muted-foreground">{error}</p>
          <button onClick={resetApp} className="px-4 py-2 bg-primary text-primary-foreground rounded-md">
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
    </div>
  )
}