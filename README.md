# 🚗 Vehicle Lease Analyzer - Web App

A modern React web application that analyzes vehicle lease deals and scores them based on value, efficiency, and emissions. Upload an Excel file and get instant insights with downloadable reports.

## ✨ Features

- **📊 Drag & Drop Upload** - Simply drag your Excel file or click to browse
- **🔍 Smart Analysis** - Automatically detects column headers and analyzes deals
- **📈 Advanced Scoring** - Comprehensive scoring based on multiple factors:
  - Monthly payment vs MSRP (40%)
  - Monthly payment vs OTR price (30%)
  - Fuel efficiency MPG (20%)
  - CO2 emissions (10%)
- **📋 Interactive Results** - View overview, top deals, and complete dataset
- **💾 CSV Downloads** - Download top 100 deals or complete scored dataset
- **📱 Responsive Design** - Works on desktop, tablet, and mobile
- **⚡ Serverless** - Powered by Netlify Functions for fast, scalable processing

## 🚀 Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   cd lease-analyzer-web
   npm install
   ```

2. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

3. **Install function dependencies:**
   ```bash
   cd netlify/functions
   npm install
   cd ../..
   ```

4. **Start development server:**
   ```bash
   netlify dev
   ```

5. **Open browser:**
   Navigate to `http://localhost:8888`

### Deploy to Netlify

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin your-repo-url
   git push -u origin main
   ```

2. **Deploy on Netlify:**
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Connect your GitHub repo
   - Build settings are auto-detected from `netlify.toml`
   - Click "Deploy site"

3. **Your app is live!** 🎉

## 📁 Project Structure

```
lease-analyzer-web/
├── public/                 # Static files
│   ├── index.html         # Main HTML template
│   └── manifest.json      # PWA manifest
├── src/                   # React source code
│   ├── components/        # React components
│   │   ├── FileUpload.js  # File upload component
│   │   └── ResultsDisplay.js # Results display component
│   ├── App.js             # Main app component
│   ├── App.css            # Styling
│   ├── index.js           # React entry point
│   └── index.css          # Global styles
├── netlify/               # Netlify configuration
│   └── functions/         # Serverless functions
│       ├── analyze-lease.js # Main analysis function
│       └── package.json   # Function dependencies
├── netlify.toml           # Netlify configuration
├── package.json           # Project dependencies
└── README.md              # This file
```

## 📊 Supported File Formats

### Required Columns
Your Excel file should include these columns (flexible naming):

| Required Data | Accepted Column Names |
|---------------|----------------------|
| **Manufacturer** | MANUFACTURER, MAKE, BRAND |
| **Model** | VEHICLE DESCRIPTION, MODEL, DESCRIPTION, VEHICLE |
| **Monthly Payment** | MONTHLY PAYMENT, MONTHLY, PAYMENT, NET RENTAL CM, RENTAL |

### Optional Columns (for better scoring)
| Optional Data | Accepted Column Names |
|---------------|----------------------|
| **Price** | P11D, MSRP, LIST PRICE, RRP, PRICE, LIST |
| **OTR Price** | OTR PRICE, OTR, ON THE ROAD, TOTAL PRICE |
| **Fuel Economy** | MPG, FUEL ECONOMY, MILES PER GALLON |
| **Emissions** | CO2, EMISSIONS, CO2 EMISSIONS, CARBON |

### File Requirements
- ✅ Excel format (.xlsx or .xls)
- ✅ Maximum 10MB file size
- ✅ Headers in first 5 rows (auto-detected)
- ✅ At least manufacturer, model, and monthly payment columns

## 🎯 How Scoring Works

The app calculates a comprehensive score (0-100) for each vehicle:

### Scoring Formula
- **40%** - Monthly payment as % of MSRP (lower is better)
- **30%** - Monthly payment as % of OTR price (lower is better)  
- **20%** - Fuel efficiency MPG (higher is better)
- **10%** - CO2 emissions (lower is better)

### Score Categories
- 🌟 **90-100**: Exceptional (rare deals!)
- 🟢 **70-89**: Excellent
- 🟡 **50-69**: Good
- 🟠 **30-49**: Fair
- 🔴 **0-29**: Poor

## 📈 What You Get

### 1. Overview Dashboard
- Total vehicles analyzed
- Average score and best deal
- Score distribution chart
- Top 3 deals preview

### 2. Top 100 Deals
- Best-value vehicles ranked by score
- Sortable table with all key metrics
- Quick comparison of top performers

### 3. Complete Dataset
- Every vehicle with calculated score
- Full data table with filtering
- Color-coded scores for easy identification

### 4. Downloadable Reports
- **Top 100 CSV** - Best deals for quick reference
- **Complete CSV** - Full dataset with scores for further analysis

## 🛠️ Customization

### Adjust Scoring Weights
Edit `netlify/functions/analyze-lease.js` line 6-11:

```javascript
const SCORING_WEIGHTS = {
  monthly_vs_msrp: 0.4,    // 40% weight
  monthly_vs_otr: 0.3,     // 30% weight  
  fuel_efficiency: 0.2,    // 20% weight
  emissions: 0.1           // 10% weight
};
```

### Add Column Mappings
Add new column name variations in `COLUMN_MAPPINGS` object.

### Styling
Modify `src/App.css` to customize the appearance.

## 🔧 Technical Details

- **Frontend**: React 18 with modern hooks
- **Backend**: Netlify Functions (Node.js)
- **Excel Processing**: SheetJS (xlsx library)
- **File Upload**: react-dropzone
- **Styling**: Custom CSS with responsive design
- **Deployment**: Netlify with automatic builds

## 🚨 Troubleshooting

### Common Issues

**"Could not find required columns"**
- Ensure your Excel file has manufacturer, model, and monthly payment columns
- Check that column names match supported variations
- Verify data is in the first few rows

**"Failed to analyze file"**
- Check file is .xlsx or .xls format
- Ensure file size is under 10MB
- Try re-saving the Excel file

**Function timeout**
- Large files (>5000 rows) may take time
- Consider splitting very large datasets

### Getting Help

1. Check the browser console for error messages
2. Verify your Excel file format matches requirements
3. Try with a smaller sample file first

## 📄 License

This project is open source and available under the MIT License.

## 🙋‍♂️ Support

For issues or questions:
1. Check this README first
2. Look at the example file formats
3. Try with a simpler test file
4. Check browser console for error messages

---

Made with ❤️ for better lease deal analysis