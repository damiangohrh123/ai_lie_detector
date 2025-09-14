import React, { useState } from 'react';

export default function FileUploader({ setVoiceResults, setTranscriptHistory, setFaceEmotions, onUploadComplete }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // 'idle', 'uploading', 'analyzing', 'complete', 'error'
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const validTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo'];
      if (!validTypes.includes(file.type)) {
        alert('Please select a valid video file (MP4, AVI, MOV)');
        return;
      }

      // Validate file size (max 100MB)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        alert('File size must be less than 100MB');
        return;
      }

      setSelectedFile(file);
      setUploadStatus('idle');
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) {
      const fakeEvt = { target: { files: [file] } };
      handleFileSelect(fakeEvt);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', selectedFile);

      // Simulate upload progress (replace with actual upload logic)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus('analyzing');

      // Simulate analysis completion
      setTimeout(() => {
        setUploadStatus('complete');
        setIsUploading(false);

        // Call the completion callback with the uploaded file
        if (onUploadComplete) {
          onUploadComplete(selectedFile);
        }
      }, 3000);

    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStatus('error');
      setIsUploading(false);
    }
  };

  const getStatusMessage = () => {
    switch (uploadStatus) {
      case 'idle':
        return 'Select a video file to upload';
      case 'uploading':
        return 'Uploading video file...';
      case 'analyzing':
        return 'Analyzing video content...';
      case 'complete':
        return 'Analysis complete!';
      case 'error':
        return 'Upload failed. Please try again.';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (uploadStatus) {
      case 'complete':
        return 'var(--truth-green, #22c55e)';
      case 'error':
        return 'var(--deceptive-red, #ef4444)';
      case 'analyzing':
        return 'var(--medium-orange, #f59e0b)';
      default:
        return 'var(--muted, #6b7280)';
    }
  };

  return (
  <div className={`file-upload-container ${isDragOver ? 'dragover' : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>

  <div style={{ fontSize: 48 }}>📁</div>

      <div className="file-upload-text-content">
        <h3 style={{ margin: 0, color: 'var(--heading-text-color, #374151)', fontSize: 18, fontWeight: 600 }}>
          Upload Video File
        </h3>
        <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: 14, textAlign: 'center' }}>
          Select a video file (MP4, AVI, MOV) to analyze for deception detection
        </p>

        {/* File Input */}
        <input
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id="video-upload"
          disabled={isUploading}
        />
        <label
          htmlFor="video-upload"
          style={{
            background: isUploading ? 'var(--progress-bg, #e5e7eb)' : 'var(--primary, #3b82f6)',
            color: 'var(--primary-contrast, white)',
            padding: '12px 24px',
            borderRadius: 8,
            cursor: isUploading ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: 14,
            transition: 'background-color 0.2s'
          }}
        >
          {selectedFile ? 'Change File' : 'Choose Video File'}
        </label>
      </div>


      {/* Selected File Info */}
      {selectedFile && (
        <div style={{
          background: 'var(--info-bg, #e0f2fe)',
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid var(--info-border, #0288d1)',
          marginTop: 12
        }}>
          <div style={{ fontWeight: 500, color: 'var(--info-text, #0277bd)', fontSize: 14 }}>
            Selected: {selectedFile.name}
          </div>
          <div style={{ color: 'var(--info-text, #0277bd)', fontSize: 12 }}>
            Size: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
          </div>
        </div>
      )}

      {/* Upload Button */}
      {selectedFile && !isUploading && uploadStatus !== 'complete' && (
        <button
          onClick={handleUpload}
          style={{
            background: 'var(--btn-success-bg, #22c55e)',
            color: 'var(--btn-success-contrast, white)',
            border: 'none',
            padding: '12px 24px',
            borderRadius: 8,
            fontWeight: 500,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          Upload & Analyze
        </button>
      )}

      {/* Progress Bar */}
      {isUploading && (
        <div style={{ width: '100%', marginTop: 16 }}>
          <div style={{
            width: '100%',
            height: 8,
            background: 'var(--progress-bg, #e5e7eb)',
            borderRadius: 4,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${uploadProgress}%`,
              height: '100%',
              background: uploadStatus === 'analyzing' ? 'var(--medium-orange, #f59e0b)' : 'var(--progress-fill, var(--primary))',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{
            marginTop: 8,
            textAlign: 'center',
            fontSize: 14,
            color: getStatusColor(),
            fontWeight: 500
          }}>
            {getStatusMessage()}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {uploadStatus === 'complete' && (
        <div style={{
          background: 'var(--success-bg, #dcfce7)',
          color: 'var(--success-text, #15803d)',
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid var(--truth-green, #22c55e)',
          marginTop: 12
        }}>
          ✅ Analysis complete! Results are now displayed below.
        </div>
      )}

      {uploadStatus === 'error' && (
        <div style={{
          background: 'var(--error-bg, #fee2e2)',
          color: 'var(--error-text, #b91c1c)',
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid var(--deceptive-red, #ef4444)',
          marginTop: 12
        }}>
          ❌ Upload failed. Please try again.
        </div>
      )}
    </div>
  );
}