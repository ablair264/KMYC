import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  saveProviderMapping, 
  getProviderMappings, 
  upsertVehicle, 
  insertPricingData,
  findMatchingVehicle 
} from '../supabase';

// Standard field definitions with descriptions
const STANDARD_FIELDS = {
  cap_code: { label: 'CAP Code', description: 'Unique vehicle identifier', required: false },
  manufacturer: { label: 'Manufacturer', description: 'Vehicle make (e.g., BMW, Audi)', required: true },
  model: { label: 'Model/Variant', description: 'Full vehicle description', required: true },
  monthly_rental: { label: 'Monthly Rental', description: 'Monthly lease payment', required: true },
  p11d: { label: 'P11D Price', description: 'List price including VAT', required: true },
  otr_price: { label: 'OTR Price', description: 'On-the-road price', required: false },
  term: { label: 'Term (Months)', description: 'Contract length in months', required: false },
  mileage: { label: 'Annual Mileage', description: 'Mileage allowance per year', required: false },
  mpg: { label: 'Fuel Economy', description: 'Miles per gallon', required: false },
  co2: { label: 'CO2 Emissions', description: 'CO2 emissions in g/km', required: false },
  fuel_type: { label: 'Fuel Type', description: 'Petrol, Diesel, Electric, Hybrid', required: false },
  electric_range: { label: 'Electric Range', description: 'EV/PHEV range in miles', required: false },
  insurance_group: { label: 'Insurance Group', description: 'Insurance group (1-50)', required: false },
  upfront: { label: 'Upfront Payment', description: 'Initial rental payment', required: false }
};

// Utility functions
const parseFileAsync = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        if (file.name.toLowerCase().endsWith('.csv')) {
          // Simple CSV parsing
          const text = e.target.result;
          const lines = text.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          const sampleRows = lines.slice(1, 4).map(line => 
            line.split(',').map(cell => cell.trim().replace(/"/g, ''))
          );
          resolve({ headers, sampleRows, totalRows: lines.length - 1 });
        } else {
          // For XLSX, we'll need to use a library like xlsx
          // For now, return error asking for CSV
          reject(new Error('XLSX support coming soon. Please use CSV format for now.'));
        }
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const FlexibleUpload = ({ onMappingComplete, onError }) => {
  const [uploadState, setUploadState] = useState('idle'); // idle, parsing, mapping, processing
  const [fileData, setFileData] = useState(null);
  const [fieldMappings, setFieldMappings] = useState({});
  const [providerName, setProviderName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [savedMappings, setSavedMappings] = useState([]);
  const [useDatabaseStorage, setUseDatabaseStorage] = useState(true);

  // Load saved provider mappings on component mount
  useEffect(() => {
    const loadSavedMappings = async () => {
      try {
        const mappings = await getProviderMappings();
        setSavedMappings(mappings || []);
      } catch (error) {
        console.warn('Could not load saved mappings:', error.message);
        // Continue without saved mappings if Supabase isn't configured
        setUseDatabaseStorage(false);
      }
    };
    
    loadSavedMappings();
  }, []);

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    if (rejectedFiles?.length > 0) {
      onError('Please upload a CSV or XLSX file');
      return;
    }

    if (acceptedFiles?.length > 0) {
      const file = acceptedFiles[0];
      setSelectedFile(file);
      setUploadState('parsing');

      try {
        const data = await parseFileAsync(file);
        setFileData(data);
        setUploadState('mapping');
      } catch (error) {
        onError(error.message);
        setUploadState('idle');
      }
    }
  }, [onError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false,
    maxFiles: 1
  });

  const handleFieldMapping = (standardField, headerIndex) => {
    setFieldMappings(prev => ({
      ...prev,
      [standardField]: headerIndex === -1 ? undefined : headerIndex
    }));
  };

  const getHeaderPreview = (headerIndex) => {
    if (!fileData?.sampleRows?.length || headerIndex === undefined) return '';
    return fileData.sampleRows.map(row => row[headerIndex] || '').join(', ');
  };

  const validateMapping = () => {
    const requiredFields = Object.entries(STANDARD_FIELDS)
      .filter(([_, config]) => config.required)
      .map(([field, _]) => field);
    
    const missingRequired = requiredFields.filter(field => !fieldMappings[field]);
    return missingRequired;
  };

  const loadSavedMapping = (savedMapping) => {
    setProviderName(savedMapping.provider_name);
    setFieldMappings(savedMapping.column_mappings || {});
  };

  const processWithSupabase = async (mappingData) => {
    const batchId = crypto.randomUUID();
    const processedVehicles = [];
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n').filter(line => line.trim());
          const vehicles = [];
          let processedCount = 0;

          // Save provider mapping for reuse
          if (useDatabaseStorage) {
            await saveProviderMapping({
              providerName: mappingData.providerName,
              mappings: mappingData.mappings,
              fileFormat: 'csv'
            });
          }

          // Process each row
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
            if (row.length < 3) continue;

            const vehicleData = {};
            Object.entries(mappingData.mappings).forEach(([field, headerIndex]) => {
              if (headerIndex !== undefined && row[headerIndex]) {
                vehicleData[field] = row[headerIndex];
              }
            });

            if (!vehicleData.manufacturer || !vehicleData.model || !vehicleData.monthly_rental) {
              continue;
            }

            try {
              // Find or create vehicle
              let vehicle = null;
              if (useDatabaseStorage) {
                vehicle = await findMatchingVehicle(vehicleData);
                
                if (!vehicle) {
                  // Create new vehicle
                  const newVehicle = {
                    cap_code: vehicleData.cap_code || null,
                    manufacturer: vehicleData.manufacturer,
                    model: vehicleData.model,
                    variant: vehicleData.model,
                    p11d: parseFloat(vehicleData.p11d) || null,
                    otr_price: parseFloat(vehicleData.otr_price) || null,
                    fuel_type: vehicleData.fuel_type || null,
                    co2_emissions: parseInt(vehicleData.co2) || null,
                    mpg: parseFloat(vehicleData.mpg) || null,
                    electric_range: parseInt(vehicleData.electric_range) || null,
                    insurance_group: parseInt(vehicleData.insurance_group) || null
                  };
                  
                  const insertedVehicles = await upsertVehicle(newVehicle);
                  vehicle = insertedVehicles[0];
                }

                // Insert pricing data
                const pricingData = {
                  vehicle_id: vehicle.id,
                  provider_name: mappingData.providerName,
                  monthly_rental: parseFloat(vehicleData.monthly_rental),
                  term_months: parseInt(vehicleData.term) || null,
                  annual_mileage: parseInt(vehicleData.mileage) || null,
                  upfront_payment: parseFloat(vehicleData.upfront) || null,
                  upload_batch_id: batchId,
                  file_name: mappingData.file.name,
                  score: calculateScore(vehicleData),
                  score_category: getScoreCategory(calculateScore(vehicleData))
                };

                await insertPricingData(pricingData);
              }

              // Add to local results
              const processedVehicle = {
                ...vehicleData,
                score: calculateScore(vehicleData),
                scoreInfo: { category: getScoreCategory(calculateScore(vehicleData)) }
              };
              
              vehicles.push(processedVehicle);
              processedCount++;

            } catch (error) {
              console.warn(`Error processing vehicle ${i}:`, error);
              // Continue processing other vehicles
            }
          }

          // Sort and return results
          vehicles.sort((a, b) => b.score - a.score);
          
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
              formula: 'Enhanced cost efficiency scoring',
              provider: mappingData.providerName,
              storedInDatabase: useDatabaseStorage,
              processedCount
            }
          });

        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsText(mappingData.file);
    });
  };

  const calculateScore = (vehicleData) => {
    const monthly = parseFloat(vehicleData.monthly_rental) || 0;
    const p11d = parseFloat(vehicleData.p11d) || 0;
    const term = parseFloat(vehicleData.term) || 36;
    
    if (monthly === 0 || p11d === 0) return 0;
    
    const totalCost = monthly * term;
    const costRatio = (totalCost / p11d) * 100;
    
    if (costRatio <= 30) return 100;
    if (costRatio <= 40) return 90;
    if (costRatio <= 50) return 75;
    if (costRatio <= 60) return 60;
    if (costRatio <= 70) return 40;
    if (costRatio <= 80) return 20;
    return 0;
  };

  const getScoreCategory = (score) => {
    if (score >= 90) return 'Exceptional';
    if (score >= 70) return 'Excellent';
    if (score >= 50) return 'Good';
    if (score >= 30) return 'Fair';
    return 'Poor';
  };

  const handleProceed = async () => {
    const missingRequired = validateMapping();
    if (missingRequired.length > 0) {
      onError(`Please map required fields: ${missingRequired.map(f => STANDARD_FIELDS[f].label).join(', ')}`);
      return;
    }

    if (!providerName.trim()) {
      onError('Please enter a provider name');
      return;
    }

    setUploadState('processing');
    
    try {
      // Use enhanced Supabase processing if available, otherwise fallback
      const results = useDatabaseStorage 
        ? await processWithSupabase({
            file: selectedFile,
            headers: fileData.headers,
            mappings: fieldMappings,
            providerName: providerName.trim(),
            totalRows: fileData.totalRows,
            sampleData: fileData.sampleRows
          })
        : await onMappingComplete({
            file: selectedFile,
            headers: fileData.headers,
            mappings: fieldMappings,
            providerName: providerName.trim(),
            totalRows: fileData.totalRows,
            sampleData: fileData.sampleRows
          });

      if (useDatabaseStorage && results) {
        onMappingComplete(results);
      }
    } catch (error) {
      onError(error.message);
      setUploadState('mapping');
    }
  };

  const resetUpload = () => {
    setUploadState('idle');
    setFileData(null);
    setFieldMappings({});
    setProviderName('');
    setSelectedFile(null);
  };

  if (uploadState === 'idle') {
    return (
      <div className="flexible-upload-container">
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          <div className="upload-content">
            <div className="upload-icon">📊</div>
            <h2>Upload Rate Sheet</h2>
            <p>Upload CSV or XLSX files from any lease provider</p>
            <div className="file-requirements">
              <h3>Supported Formats:</h3>
              <ul>
                <li>CSV (.csv) - Recommended</li>
                <li>Excel (.xlsx, .xls) - Coming soon</li>
              </ul>
            </div>
            <button className="upload-button" onClick={() => document.querySelector('input[type="file"]').click()}>
              Choose File
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (uploadState === 'parsing') {
    return (
      <div className="parsing-container">
        <div className="loading-spinner">📊</div>
        <p>Parsing file headers...</p>
      </div>
    );
  }

  if (uploadState === 'mapping') {
    return (
      <div className="mapping-container">
        <div className="mapping-header">
          <h2>Map Data Fields</h2>
          <p>Match your file headers to standard fields</p>
          <button onClick={resetUpload} className="reset-button">← Upload Different File</button>
        </div>

        <div className="provider-input">
          <label>
            Provider Name:
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="e.g., Lex Autolease, Arval, etc."
              required
            />
          </label>
          
          {savedMappings.length > 0 && (
            <div className="saved-mappings">
              <label>Or load saved mapping:</label>
              <select onChange={(e) => {
                if (e.target.value) {
                  const mapping = savedMappings.find(m => m.id === e.target.value);
                  if (mapping) loadSavedMapping(mapping);
                }
              }}>
                <option value="">-- Select saved provider --</option>
                {savedMappings.map(mapping => (
                  <option key={mapping.id} value={mapping.id}>
                    {mapping.provider_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="database-status">
          {useDatabaseStorage ? (
            <div className="status-indicator connected">
              ✅ Database connected - Data will be stored for best price comparison
            </div>
          ) : (
            <div className="status-indicator disconnected">
              ⚠️ Database not configured - Analysis only (no storage)
            </div>
          )}
        </div>

        <div className="file-info">
          <p><strong>File:</strong> {selectedFile?.name}</p>
          <p><strong>Rows:</strong> {fileData.totalRows.toLocaleString()}</p>
          <p><strong>Headers found:</strong> {fileData.headers.length}</p>
        </div>

        <div className="mapping-grid">
          {Object.entries(STANDARD_FIELDS).map(([fieldKey, fieldConfig]) => (
            <div key={fieldKey} className={`mapping-row ${fieldConfig.required ? 'required' : ''}`}>
              <div className="field-info">
                <label className="field-label">
                  {fieldConfig.label}
                  {fieldConfig.required && <span className="required-indicator">*</span>}
                </label>
                <p className="field-description">{fieldConfig.description}</p>
              </div>
              
              <div className="header-select">
                <select
                  value={fieldMappings[fieldKey] ?? -1}
                  onChange={(e) => handleFieldMapping(fieldKey, parseInt(e.target.value))}
                >
                  <option value={-1}>-- Skip this field --</option>
                  {fileData.headers.map((header, index) => (
                    <option key={index} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
                
                {fieldMappings[fieldKey] !== undefined && (
                  <div className="preview">
                    <strong>Preview:</strong> {getHeaderPreview(fieldMappings[fieldKey]) || 'No data'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mapping-actions">
          <button onClick={handleProceed} className="proceed-button">
            Process {fileData.totalRows.toLocaleString()} Rows
          </button>
          <div className="validation-info">
            {validateMapping().length === 0 ? (
              <span className="valid">✅ All required fields mapped</span>
            ) : (
              <span className="invalid">
                ❌ Missing: {validateMapping().map(f => STANDARD_FIELDS[f].label).join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (uploadState === 'processing') {
    return (
      <div className="processing-container">
        <div className="loading-spinner">⚙️</div>
        <p>Processing {fileData.totalRows.toLocaleString()} vehicles...</p>
        <p>This may take a moment for large files.</p>
      </div>
    );
  }

  return null;
};

export default FlexibleUpload;