import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App } from './app/App';
import { AuthRoot } from './auth/useAuth';
import { AuthTokenBridge } from './auth/AuthTokenBridge';
import Home from './landing/Home';
import './landing.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthRoot>
        <AuthTokenBridge />
        <Routes>
          <Route path="/" element={<Home />} />
          {/* Landing CTAs historically pointed at /app — send them into the studio. */}
          <Route path="/app" element={<Navigate to="/model" replace />} />
          <Route path="/app/*" element={<Navigate to="/model" replace />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </AuthRoot>
    </BrowserRouter>
  </React.StrictMode>,
);
