'use strict';

const RESERVED_LABELS = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'billing', 'cdn', 'control',
  'docs', 'help', 'mail', 'monitor', 'ns1', 'ns2', 'status', 'support',
  'vpn', 'www',
]);

function normalizeRootDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  if (domain.length < 4 || domain.length > 253 || !domain.includes('.')) {
    throw new Error('ROOT_DOMAIN_INVALID');
  }
  const labels = domain.split('.');
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('ROOT_DOMAIN_INVALID');
  }
  return domain;
}

function normalizeSubdomainLabel(value) {
  const label = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');

  if (label.length < 3 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
    throw new Error('SUBDOMAIN_LABEL_INVALID');
  }
  if (RESERVED_LABELS.has(label)) throw new Error('SUBDOMAIN_LABEL_RESERVED');
  return label;
}

function deriveFqdn(rootDomain, subdomainLabel) {
  return `${normalizeSubdomainLabel(subdomainLabel)}.${normalizeRootDomain(rootDomain)}`;
}

function proposeSubdomainLabel(customerName) {
  return normalizeSubdomainLabel(customerName);
}

module.exports = {
  RESERVED_LABELS,
  normalizeRootDomain,
  normalizeSubdomainLabel,
  deriveFqdn,
  proposeSubdomainLabel,
};
