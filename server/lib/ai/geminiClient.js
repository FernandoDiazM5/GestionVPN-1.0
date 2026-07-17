const { GoogleGenAI } = require('@google/genai');
const { AirOsAiAnalysisSchema } = require('@gestionvpn/contracts');
const { buildPrompt } = require('./airOsPrompt');
const { validateAnalysisPolicy } = require('./airOsPolicy');

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'severity', 'confidence', 'findings', 'limitations', 'advisoryOnly', 'actionsExecuted'],
  properties: {
    summary: { type: 'string' },
    severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'evidence', 'interpretation', 'possibleCauses', 'manualChecks'],
        properties: {
          title: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } },
          interpretation: { type: 'string' }, possibleCauses: { type: 'array', items: { type: 'string' } },
          manualChecks: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    limitations: { type: 'array', items: { type: 'string' } },
    // `const` no pertenece al subconjunto JSON Schema aceptado por Gemini;
    // el literal true se valida obligatoriamente con Zod después de responder.
    advisoryOnly: { type: 'boolean' },
    actionsExecuted: { type: 'array', maxItems: 0 },
  },
};

let client;
function configured() {
  return process.env.GEMINI_AI_ENABLED === 'true'
    && !!process.env.GEMINI_API_KEY
    && !!process.env.AI_PSEUDONYM_KEY;
}

function model() {
  return process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
}

function getClient() {
  if (!configured()) throw Object.assign(new Error('Gemini no configurado'), { code: 'AI_NOT_CONFIGURED' });
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

async function generateAnalysis({ kind, dto }) {
  const maxOutputTokens = kind === 'NETWORK'
    ? Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_NETWORK || 1200)
    : Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_DEVICE || 700);
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 30000);
  const response = await getClient().models.generateContent({
    model: model(),
    contents: buildPrompt(kind, dto),
    config: {
      abortSignal: AbortSignal.timeout(timeoutMs),
      temperature: 0.2,
      maxOutputTokens,
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
    },
  });
  let parsed;
  try { parsed = JSON.parse(response.text || ''); }
  catch (_) { throw Object.assign(new Error('Respuesta JSON inválida'), { code: 'AI_INVALID_RESPONSE' }); }
  const analysis = validateAnalysisPolicy(AirOsAiAnalysisSchema.parse(parsed), dto);
  const usage = response.usageMetadata || {};
  return {
    analysis,
    usage: {
      inputTokens: Number(usage.promptTokenCount || 0),
      outputTokens: Number(usage.candidatesTokenCount || 0),
      totalTokens: Number(usage.totalTokenCount || 0),
    },
    model: model(),
  };
}

function resetClientForTests() { client = undefined; }

module.exports = { RESPONSE_JSON_SCHEMA, configured, model, generateAnalysis, resetClientForTests };
