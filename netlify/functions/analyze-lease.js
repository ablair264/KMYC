const XLSX = require('xlsx');

// Scoring configuration
const SCORING_WEIGHTS = {
  monthly_vs_msrp: 0.4,
  monthly_vs_otr: 0.3,
  fuel_efficiency: 0.2,
  emissions: 0.1
};

// Enhanced column mapping for flexible header detection
const COLUMN_MAPPINGS = {
  manufacturer: ['MANUFACTURER', 'MAKE', 'BRAND'],
  model: ['VEHICLE DESCRIPTION', 'MODEL', 'DESCRIPTION', 'VEHICLE', 'DERIVATIVE'],
  monthly_payment: [
    // Prefer customer monthly rental over others when both exist
    'NET RENTAL CM', 'NET RENTAL (CM)', 'NET RENTAL - CM', 'NET RENTAL CM EX VAT', 'NET RENTAL (CM) EX VAT',
    'CUSTOMER MONTHLY', 'CUSTOMER RENTAL', 'CUSTOMER MONTHLY RENTAL', 'NET CUSTOMER RENTAL', 'DRIVER MONTHLY', 'DRIVER RENTAL',
    'CUSTOMER RENTAL EX VAT', 'CUSTOMER RENTAL EXC VAT', 'CUSTOMER RENTAL EXCL VAT',
    'CUSTOMER MONTHLY EX VAT', 'CUSTOMER MONTHLY EXC VAT', 'CUSTOMER MONTHLY EXCL VAT',
    'CM EX VAT', 'CM EXC VAT', 'CM EXCL VAT',
    'MONTHLY RENTAL', 'MONTHLY RENTAL EX VAT', 'MONTHLY PAYMENT', 'PAYMENT',
    'RENTAL EX VAT', 'RENTAL EXC VAT', 'RENTAL EXCL VAT', '3 + RENTAL EX VAT', '3+RENTAL',
    'LEASE PAYMENT', 'MONTHLY COST'
  ],
  p11d: ['P11D', 'MSRP', 'LIST PRICE', 'RRP', 'PRICE', 'LIST'],
  otr_price: ['OTR PRICE', 'OTR', 'ON THE ROAD', 'TOTAL PRICE'],
  mpg: ['MPG', 'FUEL ECONOMY', 'MILES PER GALLON', 'MPG COMBINED'],
  co2: ['CO2', 'EMISSIONS', 'CO2 EMISSIONS', 'CARBON'],
  insurance_group: ['INSURANCE GROUP', 'INSURANCE', 'INS GRP'],
  cap_id: ['CAP ID', 'CAP', 'CAPID', 'CAP CODE'],
  term: ['TERM', 'MONTHS', 'CONTRACT LENGTH'],
  mileage: ['MILEAGE', 'ANNUAL MILEAGE', 'ANNUAL_MILEAGE', 'MILES', 'MILEAGE ALLOWANCE'],
  upfront: ['UP FRONT', 'UPFRONT', 'INITIAL PAYMENT', 'DEPOSIT']
};

// Fallback column indices for files without headers (based on actual sample data structure)
const FALLBACK_COLUMN_INDICES = {
  // Based on the provided broker ratebook structure (0-indexed)
  term: 0,                // TERM
  mileage: 1,             // ANNUAL_MILEAGE
  manufacturer: 2,        // MANUFACTURER
  model: 3,               // VEHICLE DESCRIPTION
  p11d: 5,                // P11D
  co2: 10,                // CO2
  insurance_group: 20,    // INSURANCE GROUP
  monthly_payment: 12,    // NET RENTAL CM (customer monthly)
  otr_price: 18,          // OTR
  mpg: 26,                // MPG COMBINED
  cap_id: 25              // CAP ID
};

function findColumn(headers, possibleNames) {
  const normalized = headers.map(h => (h && typeof h === 'string') ? h.toUpperCase().trim() : '');
  const headerMap = {};
  normalized.forEach((h, i) => { if (h) headerMap[h] = i; });

  // Exact match first
  for (const name of possibleNames) {
    const key = name.toUpperCase().trim();
    if (Object.prototype.hasOwnProperty.call(headerMap, key)) return headerMap[key];
  }
  // Fallback: fuzzy contains match (handles variants like "LIST PRICE (P11D)" or "RENTAL EX VAT 9+35")
  for (const name of possibleNames) {
    const key = name.toUpperCase().trim();
    const idx = normalized.findIndex(h => h.includes(key));
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectFileFormat(headers, sampleRows) {
  // Score different format patterns
  const formatScores = {
    standard: 0,
    ratebook: 0,
    detailed: 0
  };

  const headerStr = headers.join(' ').toUpperCase();
  
  // Ratebook format indicators
  if (headerStr.includes('CAP ID')) formatScores.ratebook += 3;
  if (headerStr.includes('RENTAL EX VAT')) formatScores.ratebook += 3;
  if (headerStr.includes('DERIVATIVE')) formatScores.ratebook += 2;
  if (headerStr.includes('TERM') && headerStr.includes('MILEAGE')) formatScores.ratebook += 2;
  
  // Standard format indicators
  if (headerStr.includes('P11D')) formatScores.standard += 3;
  if (headerStr.includes('MONTHLY PAYMENT')) formatScores.standard += 2;
  if (headerStr.includes('MANUFACTURER')) formatScores.standard += 1;
  
  // Detailed format indicators
  if (headerStr.includes('NET RENTAL CM')) formatScores.detailed += 3;
  if (headerStr.includes('VEHICLE DESCRIPTION')) formatScores.detailed += 2;
  
  // Return the highest scoring format
  const bestFormat = Object.keys(formatScores).reduce((a, b) => 
    formatScores[a] > formatScores[b] ? a : b
  );
  
  return { format: bestFormat, scores: formatScores };
}

function parseNumeric(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  
  // Handle empty or null values
  if (!value || value.trim() === '') return 0;
  
  // Remove currency symbols, commas, spaces, and other non-numeric characters except decimal points
  const cleaned = value.toString().replace(/[£$€,\s%]/g, '');
  
  // Parse as float and handle edge cases
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function calculateScore(vehicle) {
  const monthly = parseNumeric(vehicle.monthly_payment);
  const p11d = parseNumeric(vehicle.p11d);
  const otr = parseNumeric(vehicle.otr_price);
  const mpg = parseNumeric(vehicle.mpg);
  const co2 = parseNumeric(vehicle.co2);
  let term = parseNumeric(vehicle.term);
  let mileage = parseNumeric(vehicle.mileage);

  // Fallback: if term/mileage missing, use defaults for scoring
  if (term === 0) term = 36; // Default 36 month term
  if (mileage === 0) mileage = 10000; // Default 10k miles

  if (monthly === 0 || p11d === 0) return 0;

  // Calculate total lease cost
  const totalLeaseCost = monthly * term;
  
  // Calculate total cost as percentage of vehicle value (lower is better)
  const totalCostVsValue = (totalLeaseCost / p11d) * 100;
  
  // Score based on total lease cost efficiency (lower percentage = better deal)
  // Excellent deals: <40% of vehicle value, Poor deals: >80% of vehicle value
  let costEfficiencyScore;
  if (totalCostVsValue <= 30) costEfficiencyScore = 100;
  else if (totalCostVsValue <= 40) costEfficiencyScore = 90;
  else if (totalCostVsValue <= 50) costEfficiencyScore = 75;
  else if (totalCostVsValue <= 60) costEfficiencyScore = 60;
  else if (totalCostVsValue <= 70) costEfficiencyScore = 40;
  else if (totalCostVsValue <= 80) costEfficiencyScore = 20;
  else costEfficiencyScore = 0;
  
  // Mileage allowance score (higher allowance = better value)
  const mileageScore = mileage > 0 ? Math.min(100, (mileage / 15000) * 100) : 50;
  
  // Fuel efficiency score (higher MPG is better)
  const fuelScore = mpg > 0 ? Math.min(100, mpg * 1.5) : 50;
  
  // Emissions score (lower CO2 is better)
  const emissionsScore = co2 > 0 ? Math.max(0, 100 - co2 / 2) : 50;

  // Updated scoring weights - cost efficiency is most important
  const totalScore = (
    costEfficiencyScore * 0.6 +  // 60% weight on cost efficiency
    mileageScore * 0.2 +         // 20% weight on mileage allowance
    fuelScore * 0.1 +            // 10% weight on fuel efficiency
    emissionsScore * 0.1         // 10% weight on emissions
  );

  return Math.round(totalScore * 10) / 10;
}

// Provide a full score breakdown for transparency in reports
function computeScoreBreakdown(vehicle) {
  const monthly = parseNumeric(vehicle.monthly_payment);
  const p11d = parseNumeric(vehicle.p11d);
  const mpg = parseNumeric(vehicle.mpg);
  const co2 = parseNumeric(vehicle.co2);
  const otr = parseNumeric(vehicle.otr_price);
  const insuranceGroup = parseNumeric(vehicle.insurance_group);
  let term = parseNumeric(vehicle.term);
  let mileage = parseNumeric(vehicle.mileage);

  const usedDefaultTerm = term === 0;
  const usedDefaultMileage = mileage === 0;
  if (usedDefaultTerm) term = 36;
  if (usedDefaultMileage) mileage = 10000;

  // Base calculations
  const totalLeaseCost = monthly * term;
  const totalCostVsValue = p11d > 0 ? (totalLeaseCost / p11d) * 100 : 0;

  // Component scores (mirrors calculateScore)
  let costEfficiencyScore;
  if (p11d === 0 || monthly === 0) costEfficiencyScore = 0;
  else if (totalCostVsValue <= 30) costEfficiencyScore = 100;
  else if (totalCostVsValue <= 40) costEfficiencyScore = 90;
  else if (totalCostVsValue <= 50) costEfficiencyScore = 75;
  else if (totalCostVsValue <= 60) costEfficiencyScore = 60;
  else if (totalCostVsValue <= 70) costEfficiencyScore = 40;
  else if (totalCostVsValue <= 80) costEfficiencyScore = 20;
  else costEfficiencyScore = 0;

  const mileageScore = mileage > 0 ? Math.min(100, (mileage / 15000) * 100) : 50;
  const fuelScore = mpg > 0 ? Math.min(100, mpg * 1.5) : 50;
  const emissionsScore = co2 > 0 ? Math.max(0, 100 - co2 / 2) : 50;
  const insuranceScore = (insuranceGroup > 0 && insuranceGroup <= 50)
    ? Math.round((100 - ((insuranceGroup - 1) / 49) * 100) * 10) / 10
    : null;

  const weights = { costEfficiency: 0.6, mileage: 0.2, fuel: 0.1, emissions: 0.1 };
  const score = Math.round((
    costEfficiencyScore * weights.costEfficiency +
    mileageScore * weights.mileage +
    fuelScore * weights.fuel +
    emissionsScore * weights.emissions
  ) * 10) / 10;

  return {
    score,
    breakdown: {
      inputs: {
        monthly: monthly || 0,
        term,
        mileage,
        p11d: p11d || 0,
        otr: otr || 0,
        mpg: mpg || 0,
        co2: co2 || 0,
        insuranceGroup: insuranceGroup || null,
        defaultsApplied: {
          term: usedDefaultTerm,
          mileage: usedDefaultMileage
        }
      },
      derived: {
        totalLeaseCost: Math.round(totalLeaseCost * 100) / 100,
        totalCostVsP11DPercent: Math.round(totalCostVsValue * 10) / 10
      },
      components: {
        costEfficiencyScore,
        mileageScore,
        fuelScore,
        emissionsScore,
        // Informational only; not included in final combined score
        insuranceScore
      },
      weights
    }
  };
}

function getScoreCategory(score) {
  if (score >= 90) return { category: 'Exceptional', color: '#10B981', emoji: '🌟' };
  if (score >= 70) return { category: 'Excellent', color: '#22C55E', emoji: '🟢' };
  if (score >= 50) return { category: 'Good', color: '#EAB308', emoji: '🟡' };
  if (score >= 30) return { category: 'Fair', color: '#F97316', emoji: '🟠' };
  return { category: 'Poor', color: '#EF4444', emoji: '🔴' };
}

exports.handler = async (event, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the uploaded file from base64
    const { fileData, fileName, options } = JSON.parse(event.body);
    const insuranceWeight = Math.max(0, Math.min(0.2, parseFloat(options?.insuranceWeight || 0)));
    
    if (!fileData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file data provided' })
      };
    }

    // Convert base64 to buffer
    let base64Data = fileData;
    
    // Remove data URL prefix if present
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Read Excel file with error handling
    let workbook, jsonData;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON - keep raw values to preserve numbers
      jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        raw: true,  // Keep raw values instead of formatted strings
        defval: ''
      });
    } catch (xlsxError) {
      console.error('Excel parsing error:', xlsxError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to parse Excel file. Please ensure it\'s a valid .xlsx or .xls file.' 
        })
      };
    }

    if (jsonData.length < 2) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'File must contain at least headers and one data row' })
      };
    }

    // Find header row and map columns
    let headerRowIndex = 0;
    let columnIndices = {};
    let detectedFormat = null;
    
    // First try to find headers - skip empty/junk rows
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row || row.length < 5) continue; // Skip empty or very short rows
      
      const tempIndices = {};
      let headerScore = 0;
      
      for (const [key, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
        const colIndex = findColumn(row, possibleNames);
        if (colIndex !== -1) {
          tempIndices[key] = colIndex;
          headerScore++;
        }
      }
      
      // Need at least 5 columns including term and mileage for good detection
      if (headerScore >= 5 && tempIndices.term !== undefined && tempIndices.mileage !== undefined) {
        headerRowIndex = i;
        columnIndices = tempIndices;
        
        // Detect file format based on headers
        detectedFormat = detectFileFormat(row, jsonData.slice(i + 1, i + 3));
        console.log('Detected format:', detectedFormat, 'Score:', headerScore);
        break;
      }
    }

    // If no headers found OR essential fields missing, use fallback column indices
    if (Object.keys(columnIndices).length < 2 || columnIndices.term === undefined || columnIndices.mileage === undefined) {
      console.log('No headers found or missing essential fields, using fallback column indices');
      console.log('Found columns:', columnIndices);
      columnIndices = FALLBACK_COLUMN_INDICES;
      
      // Find first data row by looking for numeric values in expected positions
      headerRowIndex = 2; // Default to start processing from row 3
      for (let i = 3; i < Math.min(10, jsonData.length); i++) {
        const row = jsonData[i];
        console.log(`Checking row ${i} for data:`, row?.slice(0, 5));
        if (row && row.length > 10 && row[0] && !isNaN(parseFloat(row[0])) && row[2]) {
          headerRowIndex = i - 1; // Set to row before first data row
          console.log(`Found first data row at ${i}, setting headerRowIndex to ${headerRowIndex}`);
          break;
        }
      }
      
      detectedFormat = { format: 'fallback', scores: {} };
    } else {
      console.log('Headers detected:', columnIndices);
    }

    // Heuristic: if monthly_payment not detected, guess a rental column from the header row
    if (columnIndices.monthly_payment === undefined) {
      const headerRow = jsonData[headerRowIndex] || [];
      const norm = (headerRow || []).map(h => (h && typeof h === 'string') ? h.toUpperCase().trim() : '');
      const candidates = norm.map((h, i) => ({ h, i }))
        .filter(({ h }) => h.includes('RENTAL') || h.includes('MONTHLY'));
      const preferred = candidates.find(({ h }) => (
        (h.includes('CUSTOMER') || h.includes('DRIVER') || h.includes('CM') || h.includes('MONTHLY')) &&
        !(h.includes('WHOLESALE') || h.includes('WM') || h.includes('SUPPLIER'))
      ));
      if (preferred) columnIndices.monthly_payment = preferred.i;
      else if (candidates[0]) columnIndices.monthly_payment = candidates[0].i;
    }

    // Helper to compute insurance score from group (1 best -> 100, 50 worst -> 0)
    const computeInsuranceScoreFromGroup = (grp) => {
      const g = parseNumeric(grp);
      if (!g || g < 1 || g > 50) return null;
      return Math.round((100 - ((g - 1) / 49) * 100) * 10) / 10;
    };

    // Process data rows
    const vehicles = [];
    console.log(`Processing ${jsonData.length} rows, starting from row ${headerRowIndex + 1}`);
    
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) {
        console.log(`Skipping empty row ${i}`);
        continue;
      }

      const vehicle = {
        manufacturer: row[columnIndices.manufacturer] || '',
        model: row[columnIndices.model] || '',
        monthly_payment: row[columnIndices.monthly_payment] || 0,
        p11d: row[columnIndices.p11d] || 0,
        otr_price: row[columnIndices.otr_price] || 0,
        mpg: row[columnIndices.mpg] || 0,
        co2: row[columnIndices.co2] || 0,
        insurance_group: row[columnIndices.insurance_group] || '',
        // Additional fields for ratebook format
        cap_id: row[columnIndices.cap_id] || '',
        term: row[columnIndices.term] || '',
        mileage: row[columnIndices.mileage] || '',
        upfront: row[columnIndices.upfront] || '',
        format: detectedFormat?.format || 'unknown'
      };

      // Fallback: use OTR as P11D proxy if P11D missing/zero
      if (parseNumeric(vehicle.p11d) === 0 && parseNumeric(vehicle.otr_price) > 0) {
        vehicle.p11d = vehicle.otr_price;
      }

      // Debug logging for first few rows
      if (i <= headerRowIndex + 5) {
        console.log(`Row ${i} processing:`, {
          rowLength: row.length,
          manufacturer: `"${vehicle.manufacturer}"`,
          model: `"${vehicle.model}"`,
          monthly_payment: `"${vehicle.monthly_payment}"`,
          p11d: `"${vehicle.p11d}"`,
          term: `"${vehicle.term}"`,
          mileage: `"${vehicle.mileage}"`,
          rawData: row.slice(0, 15),
          columnMappings: {
            manufacturer: `row[${columnIndices.manufacturer}] = "${row[columnIndices.manufacturer]}"`,
            monthly_payment: `row[${columnIndices.monthly_payment}] = "${row[columnIndices.monthly_payment]}"`,
            p11d: `row[${columnIndices.p11d}] = "${row[columnIndices.p11d]}"`
          }
        });
      }

      // Very lenient validation for debugging - just check if we have any data
      if (!vehicle.manufacturer && !vehicle.model && !vehicle.monthly_payment) {
        console.log(`Skipping row ${i}: completely empty`);
        continue;
      }
      
      // Log what we're keeping
      if (i <= headerRowIndex + 5) {
        console.log(`Keeping row ${i}: Found manufacturer="${vehicle.manufacturer}", model="${vehicle.model}", payment="${vehicle.monthly_payment}"`);
      }

      // Compute tie-break helper
      vehicle.igScore = computeInsuranceScoreFromGroup(vehicle.insurance_group);

      // Base score
      let baseScore = calculateScore(vehicle);
      
      // Optional insurance weighting (reduces other weights proportionally)
      if (insuranceWeight > 0) {
        const igComponent = vehicle.igScore ?? 50; // neutral if unknown
        baseScore = Math.round(((baseScore * (1 - insuranceWeight)) + (igComponent * insuranceWeight)) * 10) / 10;
      }

      vehicle.score = baseScore;
      vehicle.scoreInfo = getScoreCategory(baseScore);
      
      vehicles.push(vehicle);
    }

    if (vehicles.length === 0) {
      console.log('No vehicles found. Debug info:', {
        totalRows: jsonData.length,
        headerRowIndex,
        columnIndices,
        sampleFirstRows: jsonData.slice(0, 5).map((row, i) => ({ row: i, data: row?.slice(0, 10) }))
      });
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'No valid vehicle data found in the file',
          debug: {
            totalRows: jsonData.length,
            headerRowIndex,
            detectedColumns: Object.keys(columnIndices).length,
            columnIndices
          }
        })
      };
    }

    // Sort by score; tie-break using insurance score if within 1 point
    vehicles.sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) >= 1) return diff;
      const ib = (b.igScore ?? 0) - (a.igScore ?? 0);
      if (ib !== 0) return ib;
      // final tie-breaker: lower monthly first
      return parseNumeric(a.monthly_payment) - parseNumeric(b.monthly_payment);
    });

    // Generate statistics
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

    // Get top 100 deals and attach score breakdown for transparency
    const topDeals = vehicles.slice(0, 100).map(v => {
      const { score, breakdown } = computeScoreBreakdown(v);
      return { ...v, score, scoreInfo: getScoreCategory(score), scoreBreakdown: breakdown };
    });
    
    // Create ultra-lightweight version - only essential fields for top 1000 vehicles
    const lightweightVehicles = vehicles.slice(0, 1000).map(v => ({
      m: v.manufacturer.substring(0, 15), // Manufacturer (truncated)
      d: v.model.substring(0, 40),        // Model (truncated) 
      p: Math.round(parseNumeric(v.monthly_payment)), // Monthly payment (rounded)
      v: Math.round(parseNumeric(v.p11d)),           // P11D value (rounded)
      t: parseNumeric(v.term),            // Term
      mi: parseNumeric(v.mileage),        // Mileage
      s: v.score,                         // Score
      c: v.scoreInfo.category.substring(0, 4) // Category (truncated)
    }));

    // Optional: expose scoring method for UI display
    const scoringInfo = {
      baseline: 'P11D',
      includesVAT: false,
      includesInitialPayment: false,
      formula: 'Score = 0.6*CostEfficiency + 0.2*Mileage + 0.1*Fuel + 0.1*Emissions',
      weights: { costEfficiency: 0.6, mileage: 0.2, fuel: 0.1, emissions: 0.1 },
      notes: insuranceWeight > 0 ? `Insurance group weighted at ${(insuranceWeight*100).toFixed(0)}%` : 'Insurance group used only as tie-breaker',
      insuranceGroupWeighted: insuranceWeight > 0,
      insuranceWeight
    };

    const results = {
      success: true,
      fileName,
      stats,
      topDeals,
      allVehicles: lightweightVehicles,
      columnMappings: columnIndices,
      detectedFormat: detectedFormat,
      scoringInfo,
      processedAt: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(results)
    };

  } catch (error) {
    console.error('Analysis error:', error);
    console.error('Error stack:', error.stack);
    
    let errorMessage = 'Failed to analyze file';
    if (error.message) {
      errorMessage += ': ' + error.message;
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
