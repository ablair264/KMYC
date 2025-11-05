import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

const FileUpload = ({ onAnalysisStart, onAnalysisComplete, onError }) => {
  const [uploadProgress, setUploadProgress] = useState(0);

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
      const response = await axios.post('/.netlify/functions/analyze-lease', {
        fileData,
        fileName: file.name
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
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
  }, [onAnalysisStart, onAnalysisComplete, onError]);

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      onError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      analyzeFile(file);
    }
  }, [analyzeFile, onError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024 // 10MB limit
  });

  return (
    <div className="file-upload-container">
      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        
        <div className="upload-content">
          <div className="upload-icon">📊</div>
          
          {isDragActive ? (
            <p>Drop your Excel file here...</p>
          ) : (
            <>
              <h2>Upload Your Vehicle Lease Spreadsheet</h2>
              <p>Drag & drop an Excel file here, or click to browse</p>
              <div className="file-requirements">
                <h3>File Requirements:</h3>
                <ul>
                  <li>Excel format (.xlsx or .xls)</li>
                  <li>Must include columns for manufacturer, model, and monthly payment</li>
                  <li>Maximum file size: 10MB</li>
                </ul>
              </div>
              <button className="upload-button">
                Choose File
              </button>
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