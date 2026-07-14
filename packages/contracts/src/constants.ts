import type { Role } from './common';

/** Etiquetas compartidas sin dependencias runtime de Zod. */
export const ROLE_LABEL = {
  OWNER: 'Propietario',
  MEMBER: 'Miembro',
} satisfies Record<Role, string>;
