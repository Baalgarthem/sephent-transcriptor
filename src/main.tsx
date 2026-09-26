import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { DIProvider } from './core/di/DIContext';
import { appContainer } from './core/di/container';
import { registrarInterfacesPorDefecto } from './gui/registry/defaultGUIs';
import './styles/global.css';

// Registrar interfaces gráficas canónicas en el Composition Root (DI)
registrarInterfacesPorDefecto(appContainer);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <DIProvider container={appContainer}>
        <App />
      </DIProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
