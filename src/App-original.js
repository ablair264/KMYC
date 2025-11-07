import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import LexUpload from './components/LexUpload';
import FlexibleUpload from './components/FlexibleUpload';
import BestDeals from './components/BestDeals';
import ResultsDisplay from './components/ResultsDisplay';
import './App.css';

function App() {
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
      // For now, we'll process the file client-side
      // Later we'll integrate with Supabase for storage
      
      // Process the CSV with the user's mappings
      const processedResults = await processFlexibleFile(mappingData);
      handleAnalysisComplete({
        provider: mappingData.providerName,
        ...processedResults
      });
    } catch (error) {
      handleError(error.message);
    }
  };

  // Temporary function to process flexible files - will be enhanced with Supabase
  const processFlexibleFile = (mappingData) => {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target.result;
          const lines = text.split('\n').filter(line => line.trim());
          const vehicles = [];
          
          // Skip header row and process data
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
            if (row.length < 3) continue; // Skip short rows
            
            const vehicle = {};
            
            // Map fields based on user configuration
            Object.entries(mappingData.mappings).forEach(([field, headerIndex]) => {
              if (headerIndex !== undefined && row[headerIndex]) {
                vehicle[field] = row[headerIndex];
              }
            });
            
            // Skip if missing required fields
            if (!vehicle.manufacturer || !vehicle.model || !vehicle.monthly_rental) {
              continue;
            }
            
            // Calculate score (simplified version for now)
            const monthly = parseFloat(vehicle.monthly_rental) || 0;
            const p11d = parseFloat(vehicle.p11d) || 0;
            const term = parseFloat(vehicle.term) || 36;
            
            if (monthly > 0 && p11d > 0) {
              const totalCost = monthly * term;
              const costRatio = (totalCost / p11d) * 100;
              let score = 100;
              if (costRatio > 80) score = 10;
              else if (costRatio > 70) score = 30;
              else if (costRatio > 60) score = 50;
              else if (costRatio > 50) score = 70;
              else if (costRatio > 40) score = 85;
              
              vehicle.score = Math.round(score);
              vehicle.scoreInfo = { 
                category: score >= 70 ? 'Excellent' : score >= 50 ? 'Good' : score >= 30 ? 'Fair' : 'Poor' 
              };
              
              vehicles.push(vehicle);
            }
          }
          
          // Sort by score
          vehicles.sort((a, b) => b.score - a.score);
          
          // Calculate stats
          const scores = vehicles.map(v => v.score);
          const stats = {
            totalVehicles: vehicles.length,
            averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
            topScore: Math.max(...scores),
            scoreDistribution: {
              exceptional: vehicles.filter(v => v.score >= 90).length,
              excellent: vehicles.filter(v => v.score >= 70 && v.score < 90).length,
              good: vehicles.filter(v => v.score >= 50 && v.score < 70).length,
              fair: vehicles.filter(v => v.score >= 30 && v.score < 50).length,
              poor: vehicles.filter(v => v.score < 30).length
            }
          };
          
          resolve({
            success: true,
            fileName: mappingData.file.name,
            stats,
            topDeals: vehicles.slice(0, 100),
            allVehicles: vehicles.slice(0, 1000).map(v => ({
              m: v.manufacturer?.substring(0, 15) || '',
              d: v.model?.substring(0, 40) || '',
              p: Math.round(parseFloat(v.monthly_rental) || 0),
              v: Math.round(parseFloat(v.p11d) || 0),
              t: parseFloat(v.term) || 0,
              mi: parseFloat(v.mileage) || 0,
              s: v.score,
              c: v.scoreInfo.category.substring(0, 4)
            })),
            detectedFormat: { format: 'flexible-csv' },
            scoringInfo: {
              baseline: 'P11D',
              formula: 'Simplified cost efficiency scoring',
              provider: mappingData.providerName
            }
          });
        };
        reader.onerror = reject;
        reader.readAsText(mappingData.file);
      } catch (error) {
        reject(error);
      }
    });
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
                className={providerTab === 'Flexible' ? 'tab active' : 'tab'}
                onClick={() => { setProviderTab('Flexible'); resetApp(); }}
              >
                🔧 Any Provider
              </button>
              <button 
                className={providerTab === 'ALD' ? 'tab active' : 'tab'}
                onClick={() => { setProviderTab('ALD'); resetApp(); }}
              >
                📊 ALD
              </button>
              <button 
                className={providerTab === 'Lex' ? 'tab active' : 'tab'}
                onClick={() => { setProviderTab('Lex'); resetApp(); }}
              >
                🧾 Lex
              </button>
              <button 
                className={providerTab === 'BestDeals' ? 'tab active' : 'tab'}
                onClick={() => { setProviderTab('BestDeals'); resetApp(); }}
              >
                🏆 Best Deals
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

            {providerTab === 'BestDeals' && (
              <BestDeals onError={handleError} />
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
