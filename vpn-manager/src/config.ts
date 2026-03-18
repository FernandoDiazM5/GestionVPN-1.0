// Utiliza la variable de entorno de Vite si existe, de lo contrario usa el valor por defecto local
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';