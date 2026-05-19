// En desarrollo: vacío → http://localhost:3001
// En Docker con nginx proxy: VITE_API_URL="" → URLs relativas, nginx redirige /api → backend
// En Docker acceso externo: VITE_API_URL="http://IP_SERVIDOR:3001"
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '') !== ''
  ? import.meta.env.VITE_API_URL
  : (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
    ? ''              // En producción (Docker nginx proxy): URLs relativas
    : 'http://localhost:3001';  // En desarrollo local