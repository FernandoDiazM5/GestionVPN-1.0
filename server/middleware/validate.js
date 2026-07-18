const { AppError } = require('../lib/apiResponse');
const logger = require('../lib/logger').child({ scope: 'request-validation' });

const SOURCES = ['body', 'params', 'query'];

function issueFields(source, issues = []) {
  const fields = new Set();
  for (const issue of issues) {
    if (Array.isArray(issue.path) && issue.path.length > 0) {
      fields.add(`${source}.${issue.path.join('.')}`);
      continue;
    }
    if (Array.isArray(issue.keys) && issue.keys.length > 0) {
      issue.keys.forEach((key) => fields.add(`${source}.${key}`));
      continue;
    }
    fields.add(source);
  }
  return [...fields].sort();
}

/**
 * Valida y normaliza las fuentes de entrada de Express con esquemas Zod.
 * Los esquemas sensibles deben ser strict para rechazar claves desconocidas.
 */
function validate(schemas = {}) {
  for (const source of SOURCES) {
    const schema = schemas[source];
    if (schema && typeof schema.safeParse !== 'function') {
      throw new TypeError(`validate.${source} debe ser un esquema Zod`);
    }
  }

  return (req, _res, next) => {
    const parsed = {};
    const fields = [];

    for (const source of SOURCES) {
      const schema = schemas[source];
      if (!schema) continue;
      const result = schema.safeParse(req[source]);
      if (result.success) {
        parsed[source] = result.data;
      } else {
        fields.push(...issueFields(source, result.error.issues));
      }
    }

    if (fields.length > 0) {
      const failedFields = [...new Set(fields)].sort();
      const requestLog = req.log || logger;
      requestLog.warn({
        requestId: req.id,
        method: req.method,
        route: req.route?.path || req.path,
        fields: failedFields,
      }, 'Solicitud rechazada por validación');
      return next(new AppError(
        'Datos de entrada inválidos',
        400,
        'VALIDATION_ERROR',
        { fields: failedFields },
      ));
    }

    Object.assign(req, parsed);
    return next();
  };
}

module.exports = { validate, issueFields };
