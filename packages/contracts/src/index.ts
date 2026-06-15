// @gestionvpn/contracts — punto único de entrada
//
// Schemas Zod + tipos TS compartidos entre backend Express y frontend React.
// Cambiar un campo aquí rompe a ambos lados en tsc, evitando drift silencioso.

export * from './common';
export * from './auth';
export * from './account';
export * from './team';
export * from './admin';
export * from './workspace';
export * from './notifications';
export * from './diagnostics';
export * from './audit';
export * from './dashboard';
// Fase F5.B — schemas del dominio operativo
export * from './wireguard';
export * from './tunnel';
export * from './nodes';
export * from './device';
export * from './settings';
