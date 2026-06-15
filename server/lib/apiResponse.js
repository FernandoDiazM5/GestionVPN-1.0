// ============================================================
//  Respuestas y errores estandarizados de la API (Fase 1)
//  Formato uniforme { success, data } / { success, message, code }
//  para que el frontend siempre reciba la misma forma.
// ============================================================

/**
 * Error de negocio controlado. Se traduce a una respuesta HTTP limpia
 * en el middleware central (no filtra stack traces al cliente).
 */
class AppError extends Error {
  /**
   * @param {string} message  Mensaje legible para el usuario.
   * @param {number} status   HTTP status (default 400).
   * @param {string} [code]   Código máquina (ej. 'OTP_INVALID').
   * @param {object} [data]   Campos extra a propagar al cliente (ej. needsConfig).
   */
  constructor(message, status = 400, code = 'BAD_REQUEST', data = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.isOperational = true;
  }
}

/** Respuesta de éxito uniforme. */
function sendOk(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

/** Respuesta de error uniforme. */
function sendError(res, status, message, code = 'ERROR', data = null) {
  const body = { success: false, message, code };
  if (data && typeof data === 'object') Object.assign(body, data);
  return res.status(status).json(body);
}

/**
 * Envuelve un handler async para capturar rejections y delegarlas
 * al middleware de error central (evita try/catch repetido).
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Middleware de error central. Debe montarse al final (app.use(errorMiddleware)).
 * Traduce AppError a su status; cualquier otro error → 500 genérico.
 */
function errorMiddleware(err, _req, res, _next) {
  if (err instanceof AppError) {
    return sendError(res, err.status, err.message, err.code, err.data);
  }
  // Errores de validación zod
  if (err && err.name === 'ZodError') {
    const msg = err.issues?.[0]?.message || 'Datos inválidos';
    return sendError(res, 422, msg, 'VALIDATION_ERROR');
  }
  // Duplicados MySQL
  if (err && err.code === 'ER_DUP_ENTRY') {
    return sendError(res, 409, 'El registro ya existe', 'DUPLICATE');
  }
  // logger se importa de forma diferida para evitar ciclos con módulos que
  // dependen de apiResponse al cargar (raros pero posibles).
  const log = require('./logger').child({ scope: 'api' });
  // Si pinoHttp ya marcó req.log con el reqId, lo usamos. Si no, logger raíz.
  const reqLog = (res?.req?.log) || log;
  reqLog.error({ err, url: res?.req?.originalUrl, method: res?.req?.method }, 'Error no controlado en middleware');
  return sendError(res, 500, 'Error interno del servidor', 'INTERNAL');
}

module.exports = { AppError, sendOk, sendError, asyncHandler, errorMiddleware };
