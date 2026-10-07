import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTheme } from './theme';
import './tokens.css';
import './styles.css';

initTheme();
createRoot(document.getElementById('root') as HTMLElement).render(<StrictMode><App /></StrictMode>);
