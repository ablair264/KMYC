import React, { useState, useEffect, useCallback } from 'react';
import { getBestPricing } from '../supabase';

const BestDeals = ({ onError }) => {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    manufacturer: '',
    fuelType: '',
    maxMonthly: '',
    minScore: ''
  });
  const [totalDeals, setTotalDeals] = useState(0);
  const [manufacturers, setManufacturers] = useState([]);
  const [fuelTypes, setFuelTypes] = useState([]);

  // Load initial data
  useEffect(() => {
    loadBestDeals();
  }, [loadBestDeals]);

  const loadBestDeals = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getBestPricing(filters);
      
      if (data && data.length > 0) {
        setDeals(data);
        setTotalDeals(data.length);
        
        // Extract unique manufacturers and fuel types for filters
        const uniqueManufacturers = [...new Set(data.map(d => d.manufacturer))].sort();
        const uniqueFuelTypes = [...new Set(data.map(d => d.fuel_type).filter(Boolean))].sort();
        
        setManufacturers(uniqueManufacturers);
        setFuelTypes(uniqueFuelTypes);
      } else {
        setDeals([]);
        setTotalDeals(0);
      }
    } catch (error) {
      console.error('Error loading best deals:', error);
      onError('Could not load best deals. Please check your database connection.');
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [filters, onError]);

  // Reload when filters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadBestDeals();
    }, 300); // Debounce filter changes
    
    return () => clearTimeout(timeoutId);
  }, [loadBestDeals]);

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      manufacturer: '',
      fuelType: '',
      maxMonthly: '',
      minScore: ''
    });
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

  const downloadCSV = () => {
    if (deals.length === 0) return;

    const headers = [
      'Manufacturer', 'Model', 'CAP Code', 'Best Monthly Rental', 
      'Best Provider', 'P11D Price', 'Term (Months)', 'Annual Mileage',
      'Fuel Type', 'CO2 Emissions', 'MPG', 'Score', 'Score Category'
    ];

    const csvContent = [
      headers.join(','),
      ...deals.map(deal => [
        deal.manufacturer,
        deal.model,
        deal.cap_code || '',
        deal.best_monthly_rental,
        deal.best_provider,
        deal.p11d || '',
        deal.term_months || '',
        deal.annual_mileage || '',
        deal.fuel_type || '',
        deal.co2_emissions || '',
        deal.mpg || '',
        deal.score || '',
        deal.score_category || ''
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'best-lease-deals.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="best-deals-loading">
        <div className="loading-spinner">🔄</div>
        <p>Loading best deals from database...</p>
      </div>
    );
  }

  return (
    <div className="best-deals-container">
      <div className="best-deals-header">
        <h2>🏆 Best Lease Deals Database</h2>
        <p>Aggregated best prices across all providers</p>
      </div>

      <div className="filters-section">
        <div className="filters-grid">
          <div className="filter-group">
            <label>Manufacturer:</label>
            <select 
              value={filters.manufacturer} 
              onChange={(e) => handleFilterChange('manufacturer', e.target.value)}
            >
              <option value="">All Manufacturers</option>
              {manufacturers.map(mfr => (
                <option key={mfr} value={mfr}>{mfr}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Fuel Type:</label>
            <select 
              value={filters.fuelType} 
              onChange={(e) => handleFilterChange('fuelType', e.target.value)}
            >
              <option value="">All Fuel Types</option>
              {fuelTypes.map(fuel => (
                <option key={fuel} value={fuel}>{fuel}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Max Monthly (£):</label>
            <input 
              type="number" 
              placeholder="e.g. 500"
              value={filters.maxMonthly}
              onChange={(e) => handleFilterChange('maxMonthly', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Min Score:</label>
            <input 
              type="number" 
              placeholder="e.g. 70"
              value={filters.minScore}
              onChange={(e) => handleFilterChange('minScore', e.target.value)}
              min="0"
              max="100"
            />
          </div>
        </div>

        <div className="filter-actions">
          <button onClick={clearFilters} className="clear-filters-btn">
            Clear Filters
          </button>
          <button onClick={downloadCSV} className="download-csv-btn">
            📥 Download CSV ({totalDeals} deals)
          </button>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="no-deals">
          <h3>No deals found</h3>
          <p>Try adjusting your filters or upload some rate sheets first.</p>
        </div>
      ) : (
        <div className="deals-results">
          <div className="results-summary">
            <p><strong>{totalDeals}</strong> best deals found</p>
          </div>

          <div className="deals-table-container">
            <table className="deals-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Best Monthly</th>
                  <th>Provider</th>
                  <th>P11D</th>
                  <th>Term/Mileage</th>
                  <th>Fuel/CO2</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal, index) => (
                  <tr key={deal.vehicle_id || index}>
                    <td className="vehicle-cell">
                      <div className="vehicle-info">
                        <strong>{deal.manufacturer}</strong>
                        <div className="model-name">{deal.model}</div>
                        {deal.cap_code && (
                          <div className="cap-code">CAP: {deal.cap_code}</div>
                        )}
                      </div>
                    </td>
                    <td className="monthly-cell">
                      <strong>{formatCurrency(deal.best_monthly_rental)}</strong>
                      {deal.upfront_payment > 0 && (
                        <div className="upfront">
                          + {formatCurrency(deal.upfront_payment)} upfront
                        </div>
                      )}
                    </td>
                    <td className="provider-cell">
                      <strong>{deal.best_provider}</strong>
                      <div className="deal-date">
                        {new Date(deal.best_price_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td>{formatCurrency(deal.p11d)}</td>
                    <td>
                      <div>{deal.term_months || 'N/A'} months</div>
                      <div>{formatNumber(deal.annual_mileage)} miles/year</div>
                    </td>
                    <td>
                      <div>{deal.fuel_type || 'N/A'}</div>
                      {deal.co2_emissions && (
                        <div>{deal.co2_emissions}g CO2</div>
                      )}
                      {deal.mpg && (
                        <div>{deal.mpg} MPG</div>
                      )}
                    </td>
                    <td>
                      {deal.score && (
                        <span 
                          className="score-badge" 
                          style={{ backgroundColor: getScoreColor(deal.score) }}
                        >
                          {Math.round(deal.score)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default BestDeals;