import { z } from 'zod';

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export const Ipv4Schema = z.ipv4({ message: 'IPv4 inválida' });

export const PortSchema = z.coerce
  .number()
  .int('Puerto inválido')
  .min(1, 'Puerto inválido')
  .max(65535, 'Puerto inválido');

export const EntityIdSchema = z.string()
  .trim()
  .min(1, 'Identificador requerido')
  .max(128, 'Identificador demasiado largo')
  .regex(/^[A-Za-z0-9_.:@-]+$/, 'Identificador inválido');

export const MacAddressSchema = z.string()
  .trim()
  .regex(/^(?:[0-9A-Fa-f]{2}[:-]?){5}[0-9A-Fa-f]{2}$/, 'MAC inválida')
  .transform((value) => value.replace(/-/g, ':').toUpperCase());

export function boundedText(max: number, { allowEmpty = true } = {}) {
  let schema = z.string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .refine((value) => !CONTROL_CHARACTERS.test(value), 'Contiene caracteres de control');
  if (!allowEmpty) schema = schema.min(1, 'Campo requerido');
  return schema;
}

export const SshUsernameSchema = boundedText(64, { allowEmpty: false });
export const SecretTextSchema = z.string()
  .max(512, 'Secreto demasiado largo')
  .refine((value) => !value.includes('\0'), 'Secreto inválido');

export const EmptyStrictObjectSchema = z.preprocess(
  (value) => value == null ? {} : value,
  z.object({}).strict(),
);
