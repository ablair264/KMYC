import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';

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

// Expanded column synonyms for Lex CSVs
const COLUMN_MAPPINGS = {
  manufacturer: ['MANUFACTURER', 'MAKE', 'BRAND'],
  model: ['VARIANT', 'VEHICLE DESCRIPTION', 'DERIVATIVE', 'MODEL', 'DESCRIPTION', 'VEHICLE', 'GRADE'],
  term: ['TERM', 'MONTHS', 'CONTRACT LENGTH', 'TERM (MONTHS)', 'TERM (MTHS)'],
  mileage: ['ANNUAL_MILEAGE', 'ANNUAL MILEAGE', 'MILEAGE', 'MILEAGE ALLOWANCE', 'MILES PER ANNUM', 'P.A. MILEAGE'],
  p11d: ['P11D', 'P11D PRICE', 'P11D VALUE', 'LIST PRICE (P11D)', 'LIST PRICE', 'RRP', 'MRP'],
  otr: ['OTR', 'OTR PRICE', 'ON THE ROAD', 'ON THE ROAD PRICE', 'OTR (INC METALLIC)', 'OTR (INCLUDING METALLIC)', 'OTR PRICE (INC PAINT)', 'RETAIL OTR'],
  co2: ['CO2_G_PER_KM', 'CO2 G PER KM', 'CO2', 'CO2 EMISSIONS', 'EMISSIONS', 'CO2 G/KM', 'CO2 (G/KM)'],
  mpg: ['FUEL_ECO_COMBINED', 'FUEL ECO COMBINED', 'MPG COMBINED', 'MPG', 'FUEL ECONOMY', 'COMBINED MPG', 'WLTP MPG', 'MPG (WLTP)'],
  fuel_type: ['FUEL_TYPE', 'FUEL TYPE', 'FUELTYPE', 'FUEL'],
  miles_per_kwh: ['MILES/KWH', 'MI/KWH', 'MILES PER KWH', 'MILES PER KWH (MI/KWH)'],
  kwh_per_100km: ['KWH/100KM', 'KWH/100 KM', 'CONSUMPTION KWH/100KM', 'KWH_PER_100KM', 'KWH / 100KM'],
  electric_range: ['WLTP_PURE_EV_RANGE__MILES_', 'WLTP PURE EV RANGE MILES', 'WLTP_EAER__MILES', 'WLTP EAER MILES', 'EAER', 'ELECTRIC RANGE', 'EV RANGE', 'ZERO EMISSION RANGE (EAER)', 'EAER (MI)', 'EAER MILES'],
  // Prefer customer/driver monthly; avoid overly-generic 'CM' token to prevent false matches (e.g., 100KM)
  monthly_cm: [
    'RENTAL', 'LEASE_RENTAL', 'LEASE RENTAL',
    'NET RENTAL CM', 'NET RENTAL (CM)', 'NET RENTAL - CM',
    'CUSTOMER MONTHLY', 'CUSTOMER RENTAL', 'CUSTOMER MONTHLY RENTAL', 'NET CUSTOMER RENTAL', 'DRIVER MONTHLY', 'DRIVER RENTAL',
    'CUSTOMER RENTAL EX VAT', 'CUSTOMER RENTAL EXC VAT', 'CUSTOMER RENTAL EXCL VAT',
    'CUSTOMER MONTHLY EX VAT', 'CUSTOMER MONTHLY EXC VAT', 'CUSTOMER MONTHLY EXCL VAT',
    'CM EX VAT', 'CM EXC VAT', 'CM EXCL VAT', 'NET RENTAL CM EX VAT', 'NET RENTAL (CM) EX VAT',
    'MONTHLY RENTAL', 'MONTHLY RENTAL EX VAT', 'MONTHLY PAYMENT', 'PAYMENT', 'RENTAL EX VAT', 'RENTAL EXC VAT', 'RENTAL EXCL VAT',
    '3 + RENTAL EX VAT', '3+RENTAL'
  ],
  monthly_wm: [
    'NET RENTAL WM', 'WM', 'WHOLESALE MONTHLY', 'WHOLESALE RENTAL', 'SUPPLIER RENTAL', 'SUPPLIER MONTHLY',
    'B2B RENTAL', 'WM RENTAL', 'BUSINESS RENTAL'
  ],
  upfront: ['UPFRONT', 'UP FRONT', 'INITIAL PAYMENT', 'DEPOSIT', 'INITIAL RENTAL'],
  insurance_group: ['INSURANCE GROUP', 'INSURANCE', 'INS GRP']
};

const findColumnIndex = (headers, names) => {
  const normalized = headers.map(h => (h ? String(h).toUpperCase().trim() : ''));
  const map = {};
  normalized.forEach((h, i) => { if (h) map[h] = i; });
  // 1) Exact match
  for (const n of names) {
    const key = n.toUpperCase().trim();
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  }
  // 2) Fuzzy contains match (helps with variants like "RENTAL EX VAT 9+35")
  for (const n of names) {
    const key = n.toUpperCase().trim();
    const idx = normalized.findIndex(h => h.includes(key));
    if (idx !== -1) return idx;
  }
  return -1;
};

function buildColumnIndices(headers) {
  const idx = {};
  Object.entries(COLUMN_MAPPINGS).forEach(([k, names]) => {
    const i = findColumnIndex(headers, names);
    if (i !== -1) idx[k] = i;
  });
  // Heuristic: if neither monthly_cm nor monthly_wm found, try to pick a generic rental column
  if (idx.monthly_cm === undefined && idx.monthly_wm === undefined) {
    const normalized = headers.map(h => (h ? String(h).toUpperCase().trim() : ''));
    const rentalCandidates = normalized.map((h, i) => ({ h, i }))
      .filter(({ h }) => h.includes('RENTAL') || h.includes('MONTHLY'));
    // Prefer those that look like customer/driver, avoid 'WHOLESALE'/'WM'
    const preferred = rentalCandidates.find(({ h }) => (
      (h.includes('CUSTOMER') || h.includes('DRIVER') || h.includes('CM') || h.includes('MONTHLY')) &&
      !(h.includes('WHOLESALE') || h.includes('WM') || h.includes('SUPPLIER'))
    ));
    if (preferred) idx.monthly_cm = preferred.i;
    else if (rentalCandidates[0]) idx.monthly_cm = rentalCandidates[0].i;
  }
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
  
  // Handle hybrid MPG figures which are unrealistic due to WLTP test methodology
  let adjustedMpg = mpg;
  const fuelType = (v.fuel_type || '').toString().toLowerCase();
  const isHybrid = fuelType.includes('hybrid') || fuelType.includes('plugin') || fuelType.includes('phev');
  
  if (isHybrid && mpg > 100) {
    // For hybrids with unrealistic MPG (>100), use a more realistic estimate
    // Based on electric range and typical hybrid efficiency
    const evRange = parseNumber(v.electric_range) || 0;
    if (evRange > 0 && evRange < 60) {
      // Short-range PHEV: estimate real-world MPG as 50-70 depending on range
      adjustedMpg = Math.min(70, 45 + (evRange / 60) * 25);
    } else if (evRange >= 60) {
      // Long-range PHEV: can achieve better efficiency
      adjustedMpg = Math.min(80, 60 + (Math.min(evRange, 100) / 100) * 20);
    } else {
      // Regular hybrid without PHEV range data - assume ~60 MPG real-world
      adjustedMpg = Math.min(65, mpg * 0.3); // Dramatically reduce unrealistic figures
    }
  }
  
  const fuelScore = adjustedMpg > 0 ? Math.min(100, adjustedMpg * 1.5) : 50;
  const emissionsScore = co2 > 0 ? Math.max(0, 100 - co2 / 2) : 50;

  // Operating cost per mile
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
    // Use adjusted MPG for hybrids to get realistic operating costs
    const effectiveMpg = isHybrid ? adjustedMpg : mpg;
    const litrePerMile = effectiveMpg > 0 ? 4.54609 / effectiveMpg : 0.12; // fallback ~12L/100km
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
        otr: parseNumber(v.otr_price),
        mpg,
        adjustedMpg: isHybrid && mpg > 100 ? adjustedMpg : null, // Show adjusted MPG for problematic hybrids
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

function LexUpload({ onAnalysisStart, onAnalysisComplete, onError, endpoint = '/.netlify/functions/analyze-lease' }) {
  const [progress, setProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [useInsuranceWeight, setUseInsuranceWeight] = useState(false);
  const cancelledRef = useRef(false);

  const assumptions = useMemo(() => ({
    electricityPricePerKwh: 0.30, // £/kWh
    petrolPricePerLitre: 1.60,    // £/L
    dieselPricePerLitre: 1.70     // £/L
  }), []);

  // Local streaming CSV analysis (no upload) for large files
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
          // Try to detect the true header row (skip preambles)
          const candidate = arr.map(x => (x || '').toString().trim());
          const candidateIdx = buildColumnIndices(candidate);
          const essentialKeys = ['manufacturer', 'model', 'monthly_cm', 'monthly_wm', 'p11d', 'term', 'mileage'];
          const matches = essentialKeys.reduce((acc, k) => acc + (candidateIdx[k] !== undefined ? 1 : 0), 0);
          if (matches >= 3 || (candidateIdx.manufacturer !== undefined && candidateIdx.model !== undefined)) {
            header = candidate;
            indices = candidateIdx;
          }
          return;
        }
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
          // Fallback: if P11D missing (common on some LCV data), use OTR as proxy
          p11d: p11d || (get('otr') || ''),
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
          v: Math.round(parseNumber(p11d || get('otr'))),
          t: parseNumber(vehicle.term),
          mi: parseNumber(vehicle.mileage),
          s: score,
          c: vehicle.scoreInfo.category.substring(0, 4)
        });
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

  // Server analysis via Netlify function (better for Excel and small CSVs)
  const analyzeCsvViaFunction = useCallback(async (file) => {
    try {
      onAnalysisStart();
      setParsing(true);

      const toBase64 = (f) => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(f);
      });

      const dataUrl = await toBase64(file);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: dataUrl,
          fileName: file.name,
          options: { insuranceWeight: useInsuranceWeight ? 0.05 : 0 }
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server analysis failed');
      }
      const results = await res.json();
      onAnalysisComplete({ provider: 'Lex', ...results });
    } catch (e) {
      console.error(e);
      onError(e.message || 'Failed to analyze file');
    } finally {
      setParsing(false);
      setProgress(0);
    }
  }, [endpoint, onAnalysisStart, onAnalysisComplete, onError, useInsuranceWeight]);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles && rejectedFiles.length > 0) {
      onError('Please choose a .csv file');
      return;
    }
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      // Large files are processed locally to avoid browser crashes from base64 conversion
      const MAX_SERVER_SIZE_MB = 8; // safe threshold
      if (file.size > MAX_SERVER_SIZE_MB * 1024 * 1024) analyzeCsv(file);
      else analyzeCsvViaFunction(file);
    }
  }, [analyzeCsv, analyzeCsvViaFunction, onError]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] },
    multiple: false,
    maxFiles: 1,
    noClick: true
  });

  return (
    <div className="file-upload-container">
      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        <div className="upload-content">
          <div className="upload-icon">🧾</div>
          <h2>Upload Lex Generic Ratebook (CSV)</h2>
          <p>Small files use Netlify; large files parse locally.</p>

          <div className="file-requirements">
            <h3>File Requirements:</h3>
            <ul>
              <li>CSV format (.csv)</li>
              <li>Include columns like Manufacturer, Derivative/Model, P11D or OTR, Monthly Rental</li>
              <li>Files larger than 8MB are analyzed locally for stability</li>
            </ul>
          </div>

          <button className="upload-button" onClick={open}>Choose CSV File</button>
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
          <p>Processing{progress ? `... ${progress}%` : '...'}</p>
        </div>
      )}
    </div>
  );
}

export default LexUpload;
