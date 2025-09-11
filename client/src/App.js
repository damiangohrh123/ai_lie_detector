import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import WebcamPage from './pages/WebcamPage';
import FileUploadPage from './pages/FileUploadPage';
import './App.css';

function Navigation() {
  const location = useLocation();

  return (
    <nav className="mode-selector" >
      <Link
        to="/"
        style={{
          padding: '6px 12px',
          borderRadius: '6px',
          textDecoration: 'none',
          fontWeight: '500',
          fontSize: '12px',
          transition: 'all 0.2s',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...(location.pathname === '/' ? {
            background: '#3b82f6',
            color: '#ffffff'
          } : {
            background: 'transparent',
            color: '#d1d5db',
            border: '1px solid #4b5563'
          })
        }}
      >
        Webcam
      </Link>

      <Link
        to="/upload"
        style={{
          padding: '6px 12px',
          borderRadius: '6px',
          textDecoration: 'none',
          fontWeight: '500',
          fontSize: '12px',
          transition: 'all 0.2s',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          ...(location.pathname === '/upload' ? {
            background: '#3b82f6',
            color: '#ffffff'
          } : {
            background: 'transparent',
            color: '#d1d5db',
            border: '1px solid #4b5563'
          })
        }}
      >
        Upload
      </Link>
        <div className="mode-separator">
          {/* Export button shows progress and is disabled while exporting */}
          <ExportButton />
        </div>
    </nav>
  );
}

function ExportButton() {
  const [isExporting, setIsExporting] = useState(false);

  const handleClick = async () => {
    if (!window.__exportSession || typeof window.__exportSession !== 'function') {
      alert('Export not available on this page');
      return;
    }
    try {
      setIsExporting(true);
      const result = window.__exportSession();
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (e) {
      console.error('Export failed', e);
      alert('Export failed: ' + (e && e.message ? e.message : String(e)));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="nav-export-btn"
      disabled={isExporting}
      aria-busy={isExporting}
      style={{ opacity: isExporting ? 0.7 : 1 }}
    >
      {isExporting ? 'Exporting...' : 'Export Summary'}
    </button>
  );
}

// Main App.js structure with React Router
export default function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
        <Navigation />
        <Routes>
          <Route path="/" element={<WebcamPage />} />
          <Route path="/upload" element={<FileUploadPage />} />
        </Routes>
      </div>
    </Router>
  );
}
