import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthRoot } from './auth/useAuth';
import { AuthTokenBridge } from './auth/AuthTokenBridge';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthRoot>
        <AuthTokenBridge />
        <App />
      </AuthRoot>
    </BrowserRouter>
  </React.StrictMode>,
);
