import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

const FileUpload = ({ 
  onAnalysisStart, 
  onAnalysisComplete, 
  onError,
  endpoint = '/.netlify/functions/analyze-lease',
  accept = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls']
  },
  maxSize = 10 * 1024 * 1024,
  title = 'Upload Your Vehicle Lease Spreadsheet',
  helperText = 'Drag & drop a file here, or click to browse',
  requirements = [
    'Excel format (.xlsx or .xls)',
    'Must include columns for manufacturer, model, and monthly payment',
    'Maximum file size: 10MB'
  ],
  buttonLabel = 'Choose File',
  icon = '📊',
  showInsuranceToggle = false
}) => {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [useInsuranceWeight, setUseInsuranceWeight] = useState(false);

  const analyzeFile = useCallback(async (file) => {
    try {
      onAnalysisStart();
      setUploadProgress(10);

      // Convert file to base64
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1]; // Remove data:... prefix
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setUploadProgress(30);

      // Send to Netlify function
      const payload = { fileData, fileName: file.name };
      if (showInsuranceToggle) {
        payload.options = { insuranceWeight: useInsuranceWeight ? 0.05 : 0 };
      }
      const response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 2 minute timeout
        maxContentLength: 50 * 1024 * 1024, // 50MB max content
        maxBodyLength: 50 * 1024 * 1024, // 50MB max body
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(30 + (progress * 0.7)); // 30% + 70% of upload progress
        }
      });

      setUploadProgress(100);
      onAnalysisComplete(response.data);

    } catch (error) {
      console.error('Analysis failed:', error);
      
      let errorMessage = 'Failed to analyze file. Please try again.';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      onError(errorMessage);
    } finally {
      setUploadProgress(0);
    }
  }, [onAnalysisStart, onAnalysisComplete, onError, endpoint, showInsuranceToggle, useInsuranceWeight]);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      onError('Please upload a supported file type');
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      analyzeFile(file);
    }
  }, [analyzeFile, onError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    maxSize
  });

  return (
    <div className="file-upload-container">
      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        
        <div className="upload-content">
          <div className="upload-icon">{icon}</div>
          
          {isDragActive ? (
            <p>Drop your file here...</p>
          ) : (
            <>
              <h2>{title}</h2>
              <p>{helperText}</p>
              <div className="file-requirements">
                <h3>File Requirements:</h3>
                <ul>
                  {requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
              <button className="upload-button">
                {buttonLabel}
              </button>
              {showInsuranceToggle && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ color: '#2d3748', fontWeight: 500 }}>
                    <input type="checkbox" checked={useInsuranceWeight} onChange={(e)=>setUseInsuranceWeight(e.target.checked)} style={{ marginRight: '0.5rem' }} />
                    Include Insurance Group in score (5% weight)
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {uploadProgress > 0 && (
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p>Processing... {uploadProgress}%</p>
        </div>
      )}

      <div className="example-formats">
        <h3>✅ Supported Column Names</h3>
        <div className="format-grid">
          <div className="format-item">
            <strong>Manufacturer:</strong>
            <span>MANUFACTURER, MAKE, BRAND</span>
          </div>
          <div className="format-item">
            <strong>Model:</strong>
            <span>VEHICLE DESCRIPTION, MODEL, DESCRIPTION</span>
          </div>
          <div className="format-item">
            <strong>Monthly Payment:</strong>
            <span>MONTHLY PAYMENT, MONTHLY, NET RENTAL CM</span>
          </div>
          <div className="format-item">
            <strong>Price:</strong>
            <span>P11D, MSRP, LIST PRICE, RRP</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
