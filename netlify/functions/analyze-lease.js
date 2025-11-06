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
    'MONTHLY PAYMENT', 'MONTHLY', 'PAYMENT', 'NET RENTAL CM', 'RENTAL',
    '3 + RENTAL EX VAT', 'RENTAL EX VAT', '3+RENTAL', 'MONTHLY RENTAL',
    'LEASE PAYMENT', 'MONTHLY COST'
  ],
  p11d: ['P11D', 'MSRP', 'LIST PRICE', 'RRP', 'PRICE', 'LIST'],
  otr_price: ['OTR PRICE', 'OTR', 'ON THE ROAD', 'TOTAL PRICE'],
  mpg: ['MPG', 'FUEL ECONOMY', 'MILES PER GALLON'],
  co2: ['CO2', 'EMISSIONS', 'CO2 EMISSIONS', 'CARBON'],
  cap_id: ['CAP ID', 'CAP', 'CAPID', 'CAP CODE'],
  term: ['TERM', 'MONTHS', 'CONTRACT LENGTH'],
  mileage: ['MILEAGE', 'ANNUAL MILEAGE', 'MILES', 'MILEAGE ALLOWANCE'],
  upfront: ['UP FRONT', 'UPFRONT', 'INITIAL PAYMENT', 'DEPOSIT']
};

// Fallback column indices for files without headers (based on actual sample data structure)
const FALLBACK_COLUMN_INDICES = {
  manufacturer: 2,   // Column 3 (0-indexed) - "Cupra"
  model: 3,          // Column 4 - "Cupra Formentor 1.5 e-HBD 272PS VZ1 DSG"
  monthly_payment: 11, // Column 12 - "457.95" (monthly payment)
  p11d: 5,           // Column 6 - "45,005.00" (P11D price)
  otr_price: 17,     // Column 18 - "33,918.76" (OTR price)
  mpg: 25,           // Column 26 - "706.20" (MPG)
  co2: 10,           // Column 11 - "10" (CO2 emissions)
  term: 0,           // Column 1 - "36" (months)
  mileage: 1         // Column 2 - "10000" (annual mileage)
};

function findColumn(headers, possibleNames) {
  const headerMap = {};
  headers.forEach((header, index) => {
    if (header && typeof header === 'string') {
      headerMap[header.toUpperCase().trim()] = index;
    }
  });
  
  for (const name of possibleNames) {
    const normalizedName = name.toUpperCase().trim();
    if (headerMap[normalizedName]) {
      return headerMap[normalizedName];
    }
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
    const { fileData, fileName } = JSON.parse(event.body);
    
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
    
    // First try to find headers
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
      const row = jsonData[i];
      const tempIndices = {};
      
      for (const [key, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
        const colIndex = findColumn(row, possibleNames);
        if (colIndex !== -1) {
          tempIndices[key] = colIndex;
        }
      }
      
      if (Object.keys(tempIndices).length >= 3) {
        headerRowIndex = i;
        columnIndices = tempIndices;
        
        // Detect file format based on headers
        detectedFormat = detectFileFormat(row, jsonData.slice(i + 1, i + 3));
        console.log('Detected format:', detectedFormat);
        break;
      }
    }

    // If no headers found OR essential fields missing, use fallback column indices
    if (Object.keys(columnIndices).length < 2 || !columnIndices.term || !columnIndices.mileage) {
      console.log('No headers found or missing essential fields, using fallback column indices');
      console.log('Found columns:', columnIndices);
      columnIndices = FALLBACK_COLUMN_INDICES;
      headerRowIndex = -1; // Start processing from row 0
      detectedFormat = { format: 'fallback', scores: {} };
    } else {
      console.log('Headers detected:', columnIndices);
    }

    // Process data rows
    const vehicles = [];
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      const vehicle = {
        manufacturer: row[columnIndices.manufacturer] || '',
        model: row[columnIndices.model] || '',
        monthly_payment: row[columnIndices.monthly_payment] || 0,
        p11d: row[columnIndices.p11d] || 0,
        otr_price: row[columnIndices.otr_price] || 0,
        mpg: row[columnIndices.mpg] || 0,
        co2: row[columnIndices.co2] || 0,
        // Additional fields for ratebook format
        cap_id: row[columnIndices.cap_id] || '',
        term: row[columnIndices.term] || '',
        mileage: row[columnIndices.mileage] || '',
        upfront: row[columnIndices.upfront] || '',
        format: detectedFormat?.format || 'unknown'
      };

      // Debug logging for first few rows
      if (i <= headerRowIndex + 3) {
        console.log(`Row ${i} data:`, {
          manufacturer: vehicle.manufacturer,
          monthly_payment: vehicle.monthly_payment,
          p11d: vehicle.p11d,
          term: vehicle.term,
          mileage: vehicle.mileage,
          rawTerm: row[columnIndices.term],
          rawMileage: row[columnIndices.mileage],
          columnIndices: columnIndices
        });
      }

      // Skip rows with missing essential data
      if (!vehicle.manufacturer && !vehicle.model) continue;
      if (parseNumeric(vehicle.monthly_payment) === 0) continue;

      vehicle.score = calculateScore(vehicle);
      vehicle.scoreInfo = getScoreCategory(vehicle.score);
      
      vehicles.push(vehicle);
    }

    if (vehicles.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No valid vehicle data found in the file' })
      };
    }

    // Sort by score (highest first)
    vehicles.sort((a, b) => b.score - a.score);

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

    // Get top 100 deals
    const topDeals = vehicles.slice(0, 100);
    
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

    const results = {
      success: true,
      fileName,
      stats,
      topDeals,
      allVehicles: lightweightVehicles,
      columnMappings: columnIndices,
      detectedFormat: detectedFormat,
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