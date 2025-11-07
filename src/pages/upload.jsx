import { useState } from 'react';
import FileUpload from '../components/FileUpload';
import LexUpload from '../components/LexUpload';
import FlexibleUpload from '../components/FlexibleUpload';
import ResultsDisplay from '../components/ResultsDisplay';

export function UploadPage() {
  const [providerTab, setProviderTab] = useState('Flexible');
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

  const handleFlexibleMappingComplete = async (mappingData) => {
    try {
      setLoading(true);
      // Process the CSV with the user's mappings - this would integrate with the existing processing logic
      const processedResults = await processFlexibleFile(mappingData);
      handleAnalysisComplete({
        provider: mappingData.providerName,
        ...processedResults
      });
    } catch (error) {
      handleError(error.message);
    }
  };

  // Simplified processing function for the upload page
  const processFlexibleFile = (mappingData) => {
    return new Promise((resolve) => {
      // This would normally process the file
      // For now, return a simple success response
      resolve({
        success: true,
        fileName: mappingData.file?.name || 'uploaded-file.csv',
        stats: {
          totalVehicles: 0,
          averageScore: 0,
          topScore: 0,
          scoreDistribution: {
            exceptional: 0,
            excellent: 0, 
            good: 0,
            fair: 0,
            poor: 0
          }
        },
        topDeals: [],
        allVehicles: []
      });
    });
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
        <div className="space-y-4">
          <div className="view-tabs flex gap-1 p-1 bg-muted rounded-lg w-fit">
            <button 
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                providerTab === 'Flexible' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => { setProviderTab('Flexible'); resetApp(); }}
            >
              🔧 Any Provider
            </button>
            <button 
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                providerTab === 'ALD' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => { setProviderTab('ALD'); resetApp(); }}
            >
              📊 ALD
            </button>
            <button 
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                providerTab === 'Lex' 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => { setProviderTab('Lex'); resetApp(); }}
            >
              🧾 Lex
            </button>
          </div>

          {providerTab === 'Flexible' && (
            <FlexibleUpload
              onMappingComplete={handleFlexibleMappingComplete}
              onError={handleError}
            />
          )}

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
        </div>
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