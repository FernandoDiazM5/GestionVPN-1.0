function collectFacts(value, facts = { keys: new Set(), values: new Set() }) {
  if (Array.isArray(value)) {
    for (const item of value) collectFacts(item, facts);
    return facts;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      facts.keys.add(key.toLowerCase());
      collectFacts(item, facts);
    }
    return facts;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim().toLowerCase();
    if (normalized.length >= 2) facts.values.add(normalized);
  }
  return facts;
}

function allStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach(item => allStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => allStrings(item, output));
  return output;
}

const FORBIDDEN_OUTPUT = [
  /https?:\/\//i,
  /```/,
  /\bssh\s+[\w.-]+@/i,
  /\b(?:telnet|curl|wget|sudo)\s+\S+/i,
  /\b(?:rm|reboot|poweroff|shutdown)\s+(?:-|\/|$)/i,
  /(?:\/interface|\/ip\s+firewall|mca-cli-set|cfgmtd|save-config)/i,
  /\bejecuta\s+(?:este|el|un)\s+comando\b/i,
];

function validateAnalysisPolicy(analysis, dto) {
  const unsafe = allStrings(analysis).find(text => FORBIDDEN_OUTPUT.some(pattern => pattern.test(text)));
  if (unsafe) {
    throw Object.assign(new Error('La respuesta contiene instrucciones o enlaces no permitidos'), {
      code: 'AI_POLICY_REJECTED',
    });
  }

  const facts = collectFacts(dto);
  for (const finding of analysis.findings) {
    for (const evidence of finding.evidence) {
      const normalized = evidence.toLowerCase();
      const grounded = [...facts.keys].some(key => normalized.includes(key))
        || [...facts.values].some(value => normalized.includes(value));
      if (!grounded) {
        throw Object.assign(new Error('La respuesta contiene evidencia no sustentada por el snapshot'), {
          code: 'AI_POLICY_REJECTED',
        });
      }
    }
  }
  return analysis;
}

module.exports = { FORBIDDEN_OUTPUT, collectFacts, validateAnalysisPolicy };
