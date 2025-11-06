const XLSX = require('xlsx');

// Scoring configuration
const SCORING_WEIGHTS = {
  monthly_vs_msrp: 0.4,
  monthly_vs_otr: 0.3,
  fuel_efficiency: 0.2,
  emissions: 0.1
};

// Column mapping for flexible header detection
const COLUMN_MAPPINGS = {
  manufacturer: ['MANUFACTURER', 'MAKE', 'BRAND'],
  model: ['VEHICLE DESCRIPTION', 'MODEL', 'DESCRIPTION', 'VEHICLE'],
  monthly_payment: ['MONTHLY PAYMENT', 'MONTHLY', 'PAYMENT', 'NET RENTAL CM', 'RENTAL'],
  p11d: ['P11D', 'MSRP', 'LIST PRICE', 'RRP', 'PRICE', 'LIST'],
  otr_price: ['OTR PRICE', 'OTR', 'ON THE ROAD', 'TOTAL PRICE'],
  mpg: ['MPG', 'FUEL ECONOMY', 'MILES PER GALLON'],
  co2: ['CO2', 'EMISSIONS', 'CO2 EMISSIONS', 'CARBON']
};

// Fallback column indices for files without headers (based on sample data structure)
const FALLBACK_COLUMN_INDICES = {
  manufacturer: 2,  // Column 3 (0-indexed)
  model: 3,         // Column 4
  monthly_payment: 6, // Column 7 
  p11d: 5,          // Column 6
  mpg: 21,          // Column 22 (38.20, 39.20, etc.)
  co2: 19           // Column 20 (167, 163, etc.)
};

function findColumn(headers, possibleNames) {
  const headerMap = {};
  headers.forEach((header, index) => {
    if (header && typeof header === 'string') {
      headerMap[header.toUpperCase().trim()] = index;
    }
  });
  
  for (const name of possibleNames) {
    if (headerMap[name.toUpperCase()]) {
      return headerMap[name.toUpperCase()];
    }
  }
  return -1;
}

function parseNumeric(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  
  // Remove currency symbols, commas, and spaces
  const cleaned = value.replace(/[£$€,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function calculateScore(vehicle) {
  const monthly = parseNumeric(vehicle.monthly_payment);
  const p11d = parseNumeric(vehicle.p11d);
  const otr = parseNumeric(vehicle.otr_price);
  const mpg = parseNumeric(vehicle.mpg);
  const co2 = parseNumeric(vehicle.co2);

  if (monthly === 0 || p11d === 0) return 0;

  // Monthly payment as percentage of P11D (lower is better)
  const monthlyVsMsrp = Math.max(0, 100 - (monthly / p11d * 100));
  
  // Monthly payment as percentage of OTR (lower is better)
  const monthlyVsOtr = otr > 0 ? Math.max(0, 100 - (monthly / otr * 100)) : monthlyVsMsrp;
  
  // Fuel efficiency score (higher MPG is better)
  const fuelScore = Math.min(100, mpg * 2);
  
  // Emissions score (lower CO2 is better)
  const emissionsScore = co2 > 0 ? Math.max(0, 100 - co2 / 3) : 50;

  const totalScore = (
    monthlyVsMsrp * SCORING_WEIGHTS.monthly_vs_msrp +
    monthlyVsOtr * SCORING_WEIGHTS.monthly_vs_otr +
    fuelScore * SCORING_WEIGHTS.fuel_efficiency +
    emissionsScore * SCORING_WEIGHTS.emissions
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
    
    // Read Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      raw: false,
      defval: ''
    });

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
        break;
      }
    }

    // If no headers found, use fallback column indices and start from row 0
    if (Object.keys(columnIndices).length < 3) {
      console.log('No headers found, using fallback column indices');
      columnIndices = FALLBACK_COLUMN_INDICES;
      headerRowIndex = -1; // Start processing from row 0
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
        co2: row[columnIndices.co2] || 0
      };

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

    const results = {
      success: true,
      fileName,
      stats,
      topDeals,
      allVehicles: vehicles,
      columnMappings: columnIndices,
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