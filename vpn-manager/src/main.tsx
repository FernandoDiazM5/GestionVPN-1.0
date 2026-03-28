import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// --- Inyección Global de JWT ---
const originalFetch = window.fetch;
let globalToken = '';
export const setGlobalToken = (token: string) => { globalToken = token; };

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (globalToken && typeof input === 'string' && input.includes('/api/')) {
    init = init || {};
    init.headers = {
      ...init.headers,
      'Authorization': `Bearer ${globalToken}`
    };
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
