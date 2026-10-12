import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { appConfig } from './config/app';
import { App } from './ui/App';
import './ui/styles.css';

document.title = appConfig.name;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
