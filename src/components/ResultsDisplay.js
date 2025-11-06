import React, { useState } from 'react';

const ResultsDisplay = ({ results, onReset }) => {
  const [currentView, setCurrentView] = useState('overview');
  const [showFullData, setShowFullData] = useState(false);

  const downloadCSV = (data, filename) => {
    if (!data || data.length === 0) return;

    // Convert compressed data back to readable format for CSV
    const expandedData = data.map(item => {
      if (item.m) { // Compressed format
        return {
          Manufacturer: item.m,
          Model: item.d,
          'Monthly Payment': item.p,
          'P11D Value': item.v,
          'Term (months)': item.t,
          'Mileage': item.mi,
          'Score': item.s,
          'Category': item.c
        };
      }
      return item; // Already in full format (topDeals)
    });

    const headers = Object.keys(expandedData[0]);
    const csvContent = [
      headers.join(','),
      ...expandedData.map(row => 
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'object' && value !== null) {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '£0' : `£${num.toLocaleString()}`;
  };

  const formatNumber = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '0' : num.toLocaleString();
  };

  const getScoreColor = (score) => {
    if (score >= 90) return '#10B981';
    if (score >= 70) return '#22C55E';
    if (score >= 50) return '#EAB308';
    if (score >= 30) return '#F97316';
    return '#EF4444';
  };

  const { stats, topDeals, allVehicles, fileName, detectedFormat, scoringInfo } = results;
  const [expandedRow, setExpandedRow] = useState(null);

  return (
    <div className="results-container">
      <div className="results-header">
        <h1>🎉 Analysis Complete!</h1>
        <p>Analyzed <strong>{formatNumber(stats.totalVehicles)}</strong> vehicles from <strong>{fileName}</strong></p>
        {detectedFormat && (
          <div className="format-info">
            <span className="format-badge">
              📋 Format: {detectedFormat.format.charAt(0).toUpperCase() + detectedFormat.format.slice(1)}
            </span>
          </div>
        )}
        {scoringInfo && (
          <div className="format-info" style={{ marginTop: '8px' }}>
            <span className="format-badge">
              🧮 Scoring: {scoringInfo.formula}
            </span>
          </div>
        )}
        <button onClick={onReset} className="new-analysis-button">
          Analyze New File
        </button>
      </div>

      <div className="view-tabs">
        <button 
          className={currentView === 'overview' ? 'tab active' : 'tab'}
          onClick={() => setCurrentView('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={currentView === 'top-deals' ? 'tab active' : 'tab'}
          onClick={() => setCurrentView('top-deals')}
        >
          🏆 Top Deals
        </button>
        <button 
          className={currentView === 'full-data' ? 'tab active' : 'tab'}
          onClick={() => setCurrentView('full-data')}
        >
          📋 All Data
        </button>
      </div>

      {currentView === 'overview' && (
        <div className="overview-section">
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Vehicles</h3>
              <div className="stat-value">{formatNumber(stats.totalVehicles)}</div>
            </div>
            <div className="stat-card">
              <h3>Average Score</h3>
              <div className="stat-value" style={{ color: getScoreColor(stats.averageScore) }}>
                {stats.averageScore}/100
              </div>
            </div>
            <div className="stat-card">
              <h3>Best Deal Score</h3>
              <div className="stat-value" style={{ color: getScoreColor(stats.topScore) }}>
                {stats.topScore}/100
              </div>
            </div>
          </div>

          <div className="score-distribution">
            <h3>📈 Score Distribution</h3>
            <div className="distribution-bars">
              {Object.entries({
                'Exceptional (90-100)': { count: stats.scoreDistribution.exceptional, color: '#10B981' },
                'Excellent (70-89)': { count: stats.scoreDistribution.excellent, color: '#22C55E' },
                'Good (50-69)': { count: stats.scoreDistribution.good, color: '#EAB308' },
                'Fair (30-49)': { count: stats.scoreDistribution.fair, color: '#F97316' },
                'Poor (0-29)': { count: stats.scoreDistribution.poor, color: '#EF4444' }
              }).map(([label, { count, color }]) => (
                <div key={label} className="distribution-item">
                  <div className="distribution-label">
                    {label}: {count} vehicles ({((count / stats.totalVehicles) * 100).toFixed(1)}%)
                  </div>
                  <div className="distribution-bar">
                    <div 
                      className="distribution-fill" 
                      style={{ 
                        width: `${(count / stats.totalVehicles) * 100}%`,
                        backgroundColor: color 
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="top-3-preview">
            <h3>🥇 Top 3 Best Deals</h3>
            <div className="top-deals-preview">
              {topDeals.slice(0, 3).map((vehicle, index) => (
                <div key={index} className="deal-card preview">
                  <div className="deal-rank">#{index + 1}</div>
                  <div className="deal-info">
                    <h4>{vehicle.manufacturer} {vehicle.model}</h4>
                    <div className="deal-details">
                      <span className="monthly-payment">{formatCurrency(vehicle.monthly_payment)}/month</span>
                      <span 
                        className="score-badge" 
                        style={{ backgroundColor: getScoreColor(vehicle.score) }}
                      >
                        {vehicle.score}/100
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="download-section">
            <h3>📥 Download Results</h3>
            <div className="download-buttons">
              <button 
                onClick={() => downloadCSV(topDeals, 'top-100-lease-deals.csv')}
                className="download-button primary"
              >
                Download Top 100 Deals CSV
              </button>
              <button 
                onClick={() => downloadCSV(allVehicles, 'all-lease-deals-scored.csv')}
                className="download-button secondary"
              >
                Download Complete Dataset CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'top-deals' && (
        <div className="top-deals-section">
          <div className="section-header">
            <h2>🏆 Top 100 Best Lease Deals</h2>
            <button 
              onClick={() => downloadCSV(topDeals, 'top-100-lease-deals.csv')}
              className="download-button"
            >
              📥 Download CSV
            </button>
          </div>
          
          <div className="deals-table-container">
            <table className="deals-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Vehicle</th>
                  <th>Monthly Payment</th>
                  <th>P11D Price</th>
                  <th>MPG</th>
                  <th>CO2</th>
                  <th>Score</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {topDeals.map((vehicle, index) => (
                  <React.Fragment key={index}>
                    <tr>
                      <td className="rank-cell">#{index + 1}</td>
                      <td className="vehicle-cell">
                        <strong>{vehicle.manufacturer}</strong><br />
                        <span className="model-name">{vehicle.model}</span>
                      </td>
                      <td className="payment-cell">{formatCurrency(vehicle.monthly_payment)}</td>
                      <td>{formatCurrency(vehicle.p11d)}</td>
                      <td>{formatNumber(vehicle.mpg)}</td>
                      <td>{formatNumber(vehicle.co2)}</td>
                      <td>
                        <span 
                          className="score-badge" 
                          style={{ backgroundColor: getScoreColor(vehicle.score) }}
                        >
                          {vehicle.score}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="toggle-button"
                          onClick={() => setExpandedRow(expandedRow === index ? null : index)}
                          title="View score breakdown"
                        >
                          {expandedRow === index ? 'Details ▾' : 'Details ▸'}
                        </button>
                      </td>
                    </tr>
                    {expandedRow === index && vehicle.scoreBreakdown && (
                      <tr>
                        <td colSpan={8}>
                          <div className="breakdown-panel">
                            <div className="breakdown-grid">
                              <div>
                                <h4>Inputs</h4>
                                <div className="kv-row"><span>Monthly</span><span>{formatCurrency(vehicle.scoreBreakdown.inputs?.monthly || vehicle.monthly_payment)}</span></div>
                                <div className="kv-row"><span>Term</span><span>{formatNumber(vehicle.scoreBreakdown.inputs?.term || vehicle.term)} months {vehicle.scoreBreakdown.inputs?.defaultsApplied?.term ? '(defaulted)' : ''}</span></div>
                                <div className="kv-row"><span>Mileage</span><span>{formatNumber(vehicle.scoreBreakdown.inputs?.mileage || vehicle.mileage)} {vehicle.scoreBreakdown.inputs?.defaultsApplied?.mileage ? '(defaulted)' : ''}</span></div>
                                <div className="kv-row"><span>P11D</span><span>{formatCurrency(vehicle.scoreBreakdown.inputs?.p11d || vehicle.p11d)}</span></div>
                                <div className="kv-row"><span>OTR</span><span>{formatCurrency(vehicle.scoreBreakdown.inputs?.otr || vehicle.otr_price)}</span></div>
                                <div className="kv-row"><span>MPG</span><span>{formatNumber(vehicle.scoreBreakdown.inputs?.mpg || vehicle.mpg)}</span></div>
                                <div className="kv-row"><span>CO2</span><span>{formatNumber(vehicle.scoreBreakdown.inputs?.co2 || vehicle.co2)}</span></div>
                                {(vehicle.scoreBreakdown.inputs?.insuranceGroup || vehicle.insurance_group) && (
                                  <div className="kv-row"><span>Insurance Group</span><span>{formatNumber(vehicle.scoreBreakdown.inputs?.insuranceGroup || vehicle.insurance_group)}</span></div>
                                )}
                              </div>
                              <div>
                                <h4>Derived</h4>
                                {vehicle.scoreBreakdown.derived?.totalLeaseCost && (
                                  <div className="kv-row"><span>Total Lease Cost</span><span>{formatCurrency(vehicle.scoreBreakdown.derived.totalLeaseCost)}</span></div>
                                )}
                                {vehicle.scoreBreakdown.derived?.totalCostVsP11DPercent && (
                                  <div className="kv-row"><span>Cost vs P11D</span><span>{vehicle.scoreBreakdown.derived.totalCostVsP11DPercent}%</span></div>
                                )}
                                {vehicle.scoreBreakdown.derived?.costPerMile !== undefined && (
                                  <div className="kv-row"><span>Operating Cost/mi</span><span>£{(vehicle.scoreBreakdown.derived.costPerMile/100).toFixed(2)}</span></div>
                                )}
                              </div>
                              <div>
                                <h4>Component Scores</h4>
                                {[
                                  { label: 'Cost Efficiency', value: vehicle.scoreBreakdown.components?.costEfficiencyScore },
                                  { label: 'Operating Cost', value: vehicle.scoreBreakdown.components?.operatingCostScore },
                                  { label: 'EV Range', value: vehicle.scoreBreakdown.components?.evRangeScore },
                                  { label: 'Mileage', value: vehicle.scoreBreakdown.components?.mileageScore },
                                  { label: 'Fuel', value: vehicle.scoreBreakdown.components?.fuelScore },
                                  { label: 'Emissions', value: vehicle.scoreBreakdown.components?.emissionsScore }
                                ].filter(x => x.value !== null && x.value !== undefined).map(({label, value}) => (
                                  <div className="component-meter" key={label}>
                                    <div className="meter-label"><span>{label}</span><span>{value}</span></div>
                                    <div className="meter-bar">
                                      <div className="meter-fill" style={{ width: `${value}%`, backgroundColor: getScoreColor(value) }}></div>
                                    </div>
                                  </div>
                                ))}
                                {vehicle.scoreBreakdown.components?.insuranceScore !== null && vehicle.scoreBreakdown.components?.insuranceScore !== undefined && (
                                  <div className="component-meter">
                                    <div className="meter-label"><span>Insurance (info)</span><span>{vehicle.scoreBreakdown.components.insuranceScore}</span></div>
                                    <div className="meter-bar">
                                      <div className="meter-fill" style={{ width: `${vehicle.scoreBreakdown.components.insuranceScore}%`, backgroundColor: '#64748b' }}></div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div>
                                <h4>Weights</h4>
                                {vehicle.scoreBreakdown.weights && (
                                  <>
                                    <div>Cost: {Math.round((vehicle.scoreBreakdown.weights.costEfficiency || 0)*100)}%</div>
                                    <div>Mileage: {Math.round((vehicle.scoreBreakdown.weights.mileage || 0)*100)}%</div>
                                    <div>Fuel: {Math.round((vehicle.scoreBreakdown.weights.fuel || 0)*100)}%</div>
                                    <div>Emissions: {Math.round((vehicle.scoreBreakdown.weights.emissions || 0)*100)}%</div>
                                    {vehicle.scoreBreakdown.weights.operating && (
                                      <div>Operating: {Math.round(vehicle.scoreBreakdown.weights.operating*100)}%</div>
                                    )}
                                    {vehicle.scoreBreakdown.weights.evRange && (
                                      <div>EV Range: {Math.round(vehicle.scoreBreakdown.weights.evRange*100)}%</div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {currentView === 'full-data' && (
        <div className="full-data-section">
          <div className="section-header">
            <h2>📋 Complete Dataset ({formatNumber(allVehicles.length)} vehicles)</h2>
            <div className="data-controls">
              <button 
                onClick={() => downloadCSV(allVehicles, 'all-lease-deals-scored.csv')}
                className="download-button"
              >
                📥 Download All Data CSV
              </button>
              <button 
                onClick={() => setShowFullData(!showFullData)}
                className="toggle-button"
              >
                {showFullData ? 'Show Less' : 'Show All'}
              </button>
            </div>
          </div>

          <div className="deals-table-container full-height">
            <table className="deals-table">
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Vehicle</th>
                  <th>Monthly Payment</th>
                  <th>P11D Price</th>
                  <th>Term</th>
                  <th>Mileage</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {(showFullData ? allVehicles : allVehicles.slice(0, 50)).map((vehicle, index) => {
                  // Handle compressed format
                  const v = vehicle.m ? {
                    manufacturer: vehicle.m,
                    model: vehicle.d,
                    monthly_payment: vehicle.p,
                    p11d: vehicle.v,
                    score: vehicle.s,
                    term: vehicle.t,
                    mileage: vehicle.mi,
                    scoreInfo: { category: vehicle.c }
                  } : vehicle;
                  
                  return (
                  <tr key={index}>
                    <td>
                      <span 
                        className="score-badge" 
                        style={{ backgroundColor: getScoreColor(v.score) }}
                      >
                        {v.score}
                      </span>
                    </td>
                    <td className="vehicle-cell">
                      <strong>{v.manufacturer}</strong><br />
                      <span className="model-name">{v.model}</span>
                    </td>
                    <td className="payment-cell">{formatCurrency(v.monthly_payment)}</td>
                    <td>{formatCurrency(v.p11d)}</td>
                    <td>{v.term || 'N/A'} months</td>
                    <td>{formatNumber(v.mileage)}</td>
                    <td>
                      <span className="category-badge">
                        {v.scoreInfo.category}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {!showFullData && allVehicles.length > 50 && (
            <div className="show-more-container">
              <p>Showing 50 of {formatNumber(allVehicles.length)} vehicles</p>
              <button 
                onClick={() => setShowFullData(true)}
                className="show-more-button"
              >
                Show All {formatNumber(allVehicles.length)} Vehicles
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultsDisplay;
