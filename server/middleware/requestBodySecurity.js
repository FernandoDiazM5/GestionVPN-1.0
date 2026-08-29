const express = require('express');
const { AppError } = require('../lib/apiResponse');

const JSON_MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const DEFAULT_JSON_LIMIT = process.env.JSON_BODY_LIMIT || '100kb';

function requestHasBody(req) {
  const length = Number(req.headers['content-length'] || 0);
  return length > 0 || Boolean(req.headers['transfer-encoding']);
}

function requireJsonForMutation(req, _res, next) {
  if (!JSON_MUTATION_METHODS.has(req.method) || !requestHasBody(req)) return next();
  if (req.is('application/json')) return next();
  if (req.is('multipart/form-data') && /^\/api\/admin\/integration-guides\/MIKROWISP\/?$/.test(req.path)) return next();
  return next(new AppError(
    'Content-Type debe ser application/json',
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  ));
}

const strictJsonParser = express.json({
  limit: DEFAULT_JSON_LIMIT,
  strict: true,
  type: 'application/json',
});

module.exports = {
  DEFAULT_JSON_LIMIT,
  requestHasBody,
  requireJsonForMutation,
  strictJsonParser,
};
