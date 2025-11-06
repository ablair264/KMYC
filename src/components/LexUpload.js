import React, { useCallback, useMemo, useRef, useState } from 'react';

// Minimal CSV streaming parser that handles quotes and large files
function streamCsvFile(file, onRow, onProgress, options = {}) {
  const chunkSize = options.chunkSize || 2 * 1024 * 1024; // 2MB
  const reader = new FileReader();
  let offset = 0;
  let buffer = '';
  let inQuotes = false;
  let field = '';
  let row = [];

  const processText = (text) => {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') { // escaped quote
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(field);
        field = '';
      } else if ((c === '\n' || c === '\r') && !inQuotes) {
        if (c === '\r' && text[i + 1] === '\n') i++; // handle CRLF
        row.push(field);
        field = '';
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) onRow(row);
        row = [];
      } else {
        field += c;
      }
    }
  };

  return new Promise((resolve, reject) => {
    const readNext = () => {
      const slice = file.slice(offset, offset + chunkSize);
      reader.onload = () => {
        const text = buffer + reader.result;
        buffer = '';
        processText(text);
        offset += chunkSize;
        if (onProgress) onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
        if (offset < file.size) {
          setTimeout(readNext, 0); // yield
        } else {
          // flush last field/row
          if (field.length > 0 || row.length > 0) {
            row.push(field);
            onRow(row);
            row = [];
            field = '';
          }
          resolve();
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsText(slice);
    };
    readNext();
  });
}

// Helpers
const parseNumber = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[£$,\s%]/g, ''));
  return isNaN(n) ? 0 : n;
};

const COLUMN_MAPPINGS = {
  manufacturer: ['MANUFACTURER', 'MAKE', 'BRAND'],
  model: ['VEHICLE DESCRIPTION', 'DERIVATIVE', 'MODEL', 'DESCRIPTION', 'VEHICLE'],
  term: ['TERM', 'MONTHS', 'CONTRACT LENGTH'],
  mileage: ['ANNUAL_MILEAGE', 'ANNUAL MILEAGE', 'MILEAGE', 'MILEAGE ALLOWANCE'],
  p11d: ['P11D', 'LIST PRICE', 'RRP', 'MRP'],
  otr: ['OTR', 'OTR PRICE', 'ON THE ROAD'],
  co2: ['CO2', 'CO2 EMISSIONS', 'EMISSIONS'],
  mpg: ['MPG COMBINED', 'MPG', 'FUEL ECONOMY'],
  fuel_type: ['FUEL TYPE', 'FUELTYPE'],
  miles_per_kwh: ['MILES/KWH', 'MI/KWH', 'MILES PER KWH'],
  kwh_per_100km: ['KWH/100KM', 'KWH/100 KM', 'CONSUMPTION KWH/100KM', 'KWH_PER_100KM'],
  electric_range: ['EAER', 'ELECTRIC RANGE', 'EV RANGE', 'ZERO EMISSION RANGE (EAER)'],
  monthly_cm: ['NET RENTAL CM', 'CM', 'CUSTOMER MONTHLY'],
  monthly_wm: ['NET RENTAL WM', 'WM', 'WHOLESALE MONTHLY'],
  upfront: ['UPFRONT', 'INITIAL PAYMENT', 'DEPOSIT'],
  insurance_group: ['INSURANCE GROUP', 'INSURANCE', 'INS GRP']
};

const findColumnIndex = (headers, names) => {
  const map = {};
  headers.forEach((h, i) => { if (h) map[String(h).toUpperCase().trim()] = i; });
  for (const n of names) {
    const key = n.toUpperCase().trim();
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  return -1;
};

function buildColumnIndices(headers) {
  const idx = {};
  Object.entries(COLUMN_MAPPINGS).forEach(([k, names]) => {
    const i = findColumnIndex(headers, names);
    if (i !== -1) idx[k] = i;
  });
  return idx;
}

// Scoring with added operating cost + EV range considerations
function insuranceScoreFromGroup(g) {
  const n = parseNumber(g);
  if (!n || n < 1 || n > 50) return null;
  return Math.round((100 - ((n - 1) / 49) * 100) * 10) / 10;
}

function scoreVehicle(v, assumptions, opts = {}) {
  const insuranceWeight = Math.max(0, Math.min(0.2, parseNumber(opts.insuranceWeight || 0)));
  const monthly = parseNumber(v.monthly_payment);
  const p11d = parseNumber(v.p11d);
  const mpg = parseNumber(v.mpg);
  const co2 = parseNumber(v.co2);
  const term = parseNumber(v.term) || 36;
  const mileage = parseNumber(v.mileage) || 10000;

  const totalLeaseCost = monthly * term;
  const totalCostVsValue = p11d > 0 ? (totalLeaseCost / p11d) * 100 : 0;
  let costEfficiencyScore;
  if (p11d === 0 || monthly === 0) costEfficiencyScore = 0;
  else if (totalCostVsValue <= 30) costEfficiencyScore = 100;
  else if (totalCostVsValue <= 40) costEfficiencyScore = 90;
  else if (totalCostVsValue <= 50) costEfficiencyScore = 75;
  else if (totalCostVsValue <= 60) costEfficiencyScore = 60;
  else if (totalCostVsValue <= 70) costEfficiencyScore = 40;
  else if (totalCostVsValue <= 80) costEfficiencyScore = 20;
  else costEfficiencyScore = 0;

  const mileageScore = Math.min(100, (mileage / 15000) * 100);
  const fuelScore = mpg > 0 ? Math.min(100, mpg * 1.5) : 50;
  const emissionsScore = co2 > 0 ? Math.max(0, 100 - co2 / 2) : 50;

  // Operating cost per mile
  const fuelType = (v.fuel_type || '').toString().toLowerCase();
  let milesPerKwh = parseNumber(v.miles_per_kwh);
  if (!milesPerKwh) {
    const kwh100 = parseNumber(v.kwh_per_100km);
    if (kwh100) milesPerKwh = 62.1371 / kwh100; // 100km -> 62.1371 miles
  }
  let costPerMile = 0;
  if (fuelType.includes('electric') || co2 === 0 || milesPerKwh) {
    const price = assumptions.electricityPricePerKwh;
    costPerMile = milesPerKwh > 0 ? price / milesPerKwh : 0.12; // fallback 12p/mi
  } else {
    const litrePerMile = mpg > 0 ? 4.54609 / mpg : 0.12; // fallback ~12L/100km
    const fuelPrice = fuelType.includes('diesel') ? assumptions.dieselPricePerLitre : assumptions.petrolPricePerLitre;
    costPerMile = litrePerMile * fuelPrice;
  }
  // Map cost per mile to score (<=£0.08 -> 100, £0.12 -> 80, £0.20 -> 40, >=£0.35 -> 0)
  const cpm = costPerMile;
  let operatingCostScore;
  if (cpm <= 0.08) operatingCostScore = 100;
  else if (cpm <= 0.12) operatingCostScore = 80;
  else if (cpm <= 0.2) operatingCostScore = 40;
  else if (cpm <= 0.35) operatingCostScore = 15;
  else operatingCostScore = 0;

  // EV range score if available
  const evRange = parseNumber(v.electric_range);
  let evRangeScore = null;
  if (evRange) {
    if (evRange >= 250) evRangeScore = 100;
    else if (evRange >= 200) evRangeScore = 90;
    else if (evRange >= 150) evRangeScore = 70;
    else if (evRange >= 100) evRangeScore = 50;
    else evRangeScore = 20;
  }

  const weights = {
    costEfficiency: 0.5,
    mileage: 0.15,
    fuel: 0.05,
    emissions: 0.1,
    operating: 0.2,
    evRange: evRange ? 0.05 : 0
  };

  const baseScore = (
    costEfficiencyScore * weights.costEfficiency +
    mileageScore * weights.mileage +
    fuelScore * weights.fuel +
    emissionsScore * weights.emissions +
    operatingCostScore * weights.operating +
    (evRange ? evRangeScore * weights.evRange : 0)
  );
  const igScore = insuranceScoreFromGroup(v.insurance_group) ?? 50; // neutral if missing
  const score = Math.round(((baseScore * (1 - insuranceWeight)) + (igScore * insuranceWeight)) * 10) / 10;
  return {
    score,
    scoreBreakdown: {
      inputs: {
        monthly,
        term,
        mileage,
        p11d,
        otr: parseNumber(v.otr),
        mpg,
        co2,
        fuelType: v.fuel_type || '',
        milesPerKwh,
        electricRange: evRange || null
      },
      derived: {
        totalLeaseCost: Math.round(totalLeaseCost * 100) / 100,
        totalCostVsP11DPercent: Math.round(totalCostVsValue * 10) / 10,
        costPerMile: Math.round(costPerMile * 10000) / 100 // pence/£
      },
      components: {
        costEfficiencyScore,
        mileageScore,
        fuelScore,
        emissionsScore,
        operatingCostScore,
        evRangeScore,
        insuranceScore: insuranceScoreFromGroup(v.insurance_group)
      },
      weights
    }
  };
}

function LexUpload({ onAnalysisStart, onAnalysisComplete, onError }) {
  const [progress, setProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [useInsuranceWeight, setUseInsuranceWeight] = useState(false);
  const cancelledRef = useRef(false);

  const assumptions = useMemo(() => ({
    electricityPricePerKwh: 0.30, // £/kWh
    petrolPricePerLitre: 1.60,    // £/L
    dieselPricePerLitre: 1.70     // £/L
  }), []);

  const analyzeCsv = useCallback(async (file) => {
    try {
      onAnalysisStart();
      setParsing(true);
      cancelledRef.current = false;

      let header = null;
      let indices = {};
      // streaming aggregates
      let totalVehicles = 0;
      let scoreSum = 0;
      let topScore = 0;
      let distribution = { exceptional: 0, excellent: 0, good: 0, fair: 0, poor: 0 };
      const minHeap = []; // store [score, vehicle] and keep at most 100
      const lightHeap = []; // keep top 1000 lightweight

      const pushHeap = (heap, limit, itemScore, item) => {
        heap.push({ s: itemScore, item });
        heap.sort((a, b) => a.s - b.s);
        if (heap.length > limit) heap.shift();
      };

      const onRow = (arr) => {
        if (cancelledRef.current) return;
        // Skip empty lines
        if (!arr || arr.length === 0 || (arr.length === 1 && arr[0] === '')) return;
        if (!header) {
          header = arr.map(x => (x || '').toString().trim());
          indices = buildColumnIndices(header);
          return;
        }
        // Row processed
        // Map fields
        const get = (key) => indices[key] !== undefined ? arr[indices[key]] : '';
        const monthly = get('monthly_cm') || get('monthly_wm');
        const p11d = get('p11d');
        const manufacturer = get('manufacturer');
        const model = get('model');
        if (!manufacturer && !model) return;

        const vehicle = {
          manufacturer,
          model,
          monthly_payment: monthly,
          p11d,
          otr_price: get('otr'),
          mpg: get('mpg'),
          co2: get('co2'),
          fuel_type: get('fuel_type'),
          miles_per_kwh: get('miles_per_kwh'),
          kwh_per_100km: get('kwh_per_100km'),
          electric_range: get('electric_range'),
          term: get('term'),
          mileage: get('mileage'),
          insurance_group: get('insurance_group'),
          format: 'lex-csv'
        };

        const { score, scoreBreakdown } = scoreVehicle(vehicle, assumptions, { insuranceWeight: useInsuranceWeight ? 0.05 : 0 });
        vehicle.score = score;
        vehicle.scoreInfo = (
          score >= 90 ? { category: 'Exceptional' } :
          score >= 70 ? { category: 'Excellent' } :
          score >= 50 ? { category: 'Good' } :
          score >= 30 ? { category: 'Fair' } : { category: 'Poor' }
        );

        totalVehicles++;
        scoreSum += score;
        if (score > topScore) topScore = score;
        if (score >= 90) distribution.exceptional++; else if (score >= 70) distribution.excellent++; else if (score >= 50) distribution.good++; else if (score >= 30) distribution.fair++; else distribution.poor++;

        pushHeap(minHeap, 100, score, { ...vehicle, scoreBreakdown });
        pushHeap(lightHeap, 1000, score, {
          m: (manufacturer || '').substring(0, 15),
          d: (model || '').substring(0, 40),
          p: Math.round(parseNumber(monthly)),
          v: Math.round(parseNumber(p11d)),
          t: parseNumber(vehicle.term),
          mi: parseNumber(vehicle.mileage),
          s: score,
          c: vehicle.scoreInfo.category.substring(0, 4)
        });
        // Kept vehicle
      };

      await streamCsvFile(file, onRow, (p) => setProgress(p));

      // Sort with insurance tie-breaker if within 1 point
      const topDeals = minHeap.sort((a, b) => {
        const diff = b.s - a.s;
        if (Math.abs(diff) >= 1) return diff;
        const igB = (b.item.scoreBreakdown.components.insuranceScore ?? 0);
        const igA = (a.item.scoreBreakdown.components.insuranceScore ?? 0);
        if (igB !== igA) return igB - igA;
        const mpA = parseNumber(a.item.monthly_payment);
        const mpB = parseNumber(b.item.monthly_payment);
        return mpA - mpB;
      }).map(x => x.item);
      const lightweightVehicles = lightHeap.sort((a, b) => b.s - a.s).map(x => x.item);
      const averageScore = totalVehicles ? Math.round((scoreSum / totalVehicles) * 10) / 10 : 0;

      const results = {
        provider: 'Lex',
        success: true,
        fileName: file.name,
        stats: {
          totalVehicles,
          averageScore,
          topScore,
          scoreDistribution: distribution
        },
        topDeals,
        allVehicles: lightweightVehicles,
        columnMappings: indices,
        detectedFormat: { format: 'lex-csv' },
        scoringInfo: {
          baseline: 'P11D',
          includesVAT: false,
          includesInitialPayment: false,
          formula: 'Score = 0.5*CostEfficiency + 0.2*Operating + 0.15*Mileage + 0.1*Emissions + 0.05*Fuel + (0.05*EVRange if available)',
          weights: { costEfficiency: 0.5, operating: 0.2, mileage: 0.15, emissions: 0.1, fuel: 0.05, evRange: 0.05 },
          assumptions,
          insuranceGroupWeighted: !!useInsuranceWeight,
          insuranceWeight: useInsuranceWeight ? 0.05 : 0
        },
        processedAt: new Date().toISOString()
      };

      onAnalysisComplete(results);
    } catch (e) {
      console.error(e);
      onError(e.message || 'Failed to analyze CSV');
    } finally {
      setParsing(false);
      setProgress(0);
    }
  }, [onAnalysisStart, onAnalysisComplete, onError, assumptions, useInsuranceWeight]);

  const onFileChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onError('Please choose a .csv file');
      return;
    }
    // Large files supported; warn if > 100MB
    if (file.size > 100 * 1024 * 1024) {
      // ok, we can still process locally
    }
    analyzeCsv(file);
  }, [analyzeCsv, onError]);

  return (
    <div className="file-upload-container">
      <div className="dropzone">
        <div className="upload-content">
          <div className="upload-icon">🧾</div>
          <h2>Upload Lex Generic Ratebook (CSV)</h2>
          <p>Local, streaming analysis — no upload. Handles very large CSVs.</p>

          <div className="file-requirements">
            <h3>File Requirements:</h3>
            <ul>
              <li>CSV format (.csv)</li>
              <li>Include columns like Manufacturer, Derivative/Model, P11D, OTR, Fuel Type, CO2, MPG, Miles/kWh or kWh/100km, NET RENTAL CM/WM</li>
              <li>Very large files supported (200MB+). Parsing is done locally.</li>
            </ul>
          </div>

          <label className="upload-button" style={{ cursor: 'pointer' }}>
            Choose CSV File
            <input type="file" accept=".csv,text/csv" onChange={onFileChange} style={{ display: 'none' }} />
          </label>
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ color: '#2d3748', fontWeight: 500 }}>
              <input type="checkbox" checked={useInsuranceWeight} onChange={(e)=>setUseInsuranceWeight(e.target.checked)} style={{ marginRight: '0.5rem' }} />
              Include Insurance Group in score (5% weight)
            </label>
          </div>
        </div>
      </div>

      {parsing && (
        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <p>Processing... {progress}%</p>
        </div>
      )}

      <div className="example-formats">
        <h3>✅ Extra Analysis (Lex)</h3>
        <div className="format-grid">
          <div className="format-item">
            <strong>Operating Cost</strong>
            <span>Estimated £/mile using MPG or Miles/kWh</span>
          </div>
          <div className="format-item">
            <strong>EV Range</strong>
            <span>Scores range if provided (EAER)</span>
          </div>
          <div className="format-item">
            <strong>Assumptions</strong>
            <span>Electric £/kWh and fuel £/L (editable later)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LexUpload;
