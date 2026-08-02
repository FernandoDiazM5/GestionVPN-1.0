const net = require('node:net');

function normalizeIp(value) {
  const ip = String(value || '').replace(/^::ffff:/, '').trim();
  return net.isIP(ip) ? ip : null;
}

function systemTrustedIps(env = process.env) {
  const configured = [
    env.VPS_PUBLIC_IP,
    env.WG_PUBLIC_IP,
    ...String(env.WEB_SECURITY_SYSTEM_TRUSTED_IPS || '').split(','),
  ];
  return [...new Set(configured.map(normalizeIp).filter(Boolean))];
}

function systemTrustedCidrs(env = process.env) {
  return systemTrustedIps(env).map((ip) => `${ip}/${net.isIP(ip) === 6 ? 128 : 32}`);
}

function isSystemTrustedIp(value, env = process.env) {
  const ip = normalizeIp(value);
  if (!ip) return false;
  if (ip === '::1' || ip.startsWith('127.')) return true;
  return systemTrustedIps(env).includes(ip);
}

module.exports = { isSystemTrustedIp, normalizeIp, systemTrustedCidrs, systemTrustedIps };
