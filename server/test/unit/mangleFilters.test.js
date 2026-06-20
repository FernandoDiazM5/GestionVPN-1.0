// M4 — filtros puros sobre una tabla mangle YA leída (una sola lectura en activate).
import { describe, it, expect } from 'vitest';
const {
  filterUserMangleIds, filterLegacyGlobalMangleIds, mangleComment,
} = require('../../lib/tunnelProvisioner');

describe('filtros puros de mangle (M4)', () => {
  const userId = 'abc-def-123';
  const rows = [
    { '.id': '*1', comment: mangleComment(userId) },     // mangle del usuario
    { '.id': '*2', comment: 'ACCESO-ADMIN' },            // legacy global
    { '.id': '*3', comment: 'ACCESO-USER-otrousuario' }, // de otro usuario
    { '.id': '*4', comment: 'ACCESO-DINAMICO' },         // legacy global
    { comment: mangleComment(userId) },                  // sin .id → ignorado
  ];

  it('filterUserMangleIds toma solo la mangle del usuario con .id', () => {
    expect(filterUserMangleIds(rows, userId)).toEqual(['*1']);
  });

  it('filterLegacyGlobalMangleIds toma las globales legacy', () => {
    expect(filterLegacyGlobalMangleIds(rows)).toEqual(['*2', '*4']);
  });

  it('tolera lista vacía/nula', () => {
    expect(filterUserMangleIds(null, userId)).toEqual([]);
    expect(filterLegacyGlobalMangleIds(undefined)).toEqual([]);
  });
});
