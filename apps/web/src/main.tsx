import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/dm-sans';
import './styles/tokens.css';
import './styles/app.css';
import { queryClient } from './lib/api';
import { ToastProvider } from './components/ui';
import { App } from './App';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
