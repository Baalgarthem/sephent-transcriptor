import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DIProvider } from './core/di/DIContext';
import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <DIProvider>
      <App />
    </DIProvider>
  </React.StrictMode>
);
