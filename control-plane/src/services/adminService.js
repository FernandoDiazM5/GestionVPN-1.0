'use strict';

const crypto = require('crypto');
const { generateActivationCode } = require('../domain/activationCodes');
const { deriveFqdn, normalizeSubdomainLabel, proposeSubdomainLabel } = require('../domain/subdomains');
const { lowestFreeSubnet } = require('../domain/networkPool');

function conflict(code) { const error = new Error(code); error.code = code; return error; }

function createAdminService({ pool, activationPepper, now = () => new Date() }) {
  async function listCustomers() {
    const [rows] = await pool.query('SELECT id, legal_name, display_name, tax_id, status, created_at, updated_at FROM customers ORDER BY created_at DESC');
    return rows;
  }

  async function createCustomer(input) {
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO customers (id, legal_name, display_name, tax_id) VALUES (?, ?, ?, ?)',
      [id, input.legalName, input.displayName, input.taxId || null],
    );
    return { id, ...input, status: 'ACTIVE' };
  }

  async function listPlans() {
    const [rows] = await pool.query('SELECT id, code, name, description, is_active FROM subscription_plans ORDER BY name');
    return rows;
  }

  async function createPlan(input) {
    const connection = await pool.getConnection();
    const id = crypto.randomUUID();
    try {
      await connection.beginTransaction();
      await connection.query('INSERT INTO subscription_plans (id, code, name, description) VALUES (?, ?, ?, ?)', [id, input.code, input.name, input.description || null]);
      for (const item of input.entitlements || []) {
        await connection.query('INSERT INTO plan_entitlements (plan_id, feature_key, enabled, numeric_limit) VALUES (?, ?, ?, ?)', [id, item.key, item.enabled, item.limit ?? null]);
      }
      await connection.commit();
      return { id, ...input };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function createInstance(input) {
    const connection = await pool.getConnection();
    const instanceId = crypto.randomUUID();
    try {
      await connection.beginTransaction();
      const [customers] = await connection.query('SELECT display_name FROM customers WHERE id=? AND status=\'ACTIVE\' FOR UPDATE', [input.customerId]);
      if (!customers[0]) throw conflict('CUSTOMER_NOT_FOUND');
      const label = input.subdomainLabel ? normalizeSubdomainLabel(input.subdomainLabel) : proposeSubdomainLabel(customers[0].display_name);
      const [settings] = await connection.query("SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ('root_domain','network_pool') FOR UPDATE");
      const config = Object.fromEntries(settings.map(row => [row.setting_key, row.setting_value]));
      if (!config.root_domain || !config.network_pool) throw conflict('PLATFORM_SETTINGS_INCOMPLETE');
      const [allocations] = await connection.query("SELECT management_cidr FROM network_allocations WHERE status IN ('RESERVED','ASSIGNED')");
      const managementCidr = lowestFreeSubnet(config.network_pool, allocations.map(row => row.management_cidr));
      await connection.query('INSERT INTO product_instances (id, customer_id, subdomain_label, public_ip) VALUES (?, ?, ?, ?)', [instanceId, input.customerId, label, input.publicIp || null]);
      await connection.query('INSERT INTO network_allocations (id, instance_id, management_cidr) VALUES (?, ?, ?)', [crypto.randomUUID(), instanceId, managementCidr]);
      await connection.commit();
      return { id: instanceId, customerId: input.customerId, subdomainLabel: label, fqdn: deriveFqdn(config.root_domain, label), managementCidr, status: 'PENDING_ACTIVATION' };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function listInstances() {
    const [settings] = await pool.query("SELECT setting_value FROM platform_settings WHERE setting_key='root_domain'");
    const rootDomain = settings[0]?.setting_value;
    const [rows] = await pool.query(
      `SELECT pi.id, pi.customer_id, pi.subdomain_label, pi.public_ip, pi.status,
              pi.software_version, pi.last_seen_at, na.management_cidr
         FROM product_instances pi
         LEFT JOIN network_allocations na ON na.instance_id=pi.id
        ORDER BY pi.created_at DESC`,
    );
    return rows.map(row => ({ ...row, fqdn: deriveFqdn(rootDomain, row.subdomain_label) }));
  }

  async function issueActivation(instanceId, actorId, ttlHours = 24) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [instances] = await connection.query('SELECT id, status FROM product_instances WHERE id=? FOR UPDATE', [instanceId]);
      if (!instances[0]) throw conflict('INSTANCE_NOT_FOUND');
      if (instances[0].status !== 'PENDING_ACTIVATION') throw conflict('INSTANCE_ALREADY_ACTIVATED');
      await connection.query("UPDATE activation_codes SET status='REVOKED' WHERE instance_id=? AND status='ISSUED'", [instanceId]);
      const generated = generateActivationCode(activationPepper);
      const id = crypto.randomUUID();
      const expiresAt = new Date(now().getTime() + ttlHours * 60 * 60 * 1000);
      await connection.query('INSERT INTO activation_codes (id, instance_id, code_digest, expires_at, created_by) VALUES (?, ?, ?, ?, ?)', [id, instanceId, generated.digest, expiresAt, actorId]);
      await connection.commit();
      return { id, instanceId, code: generated.code, expiresAt };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function revokeActivation(id) {
    const [result] = await pool.query("UPDATE activation_codes SET status='REVOKED' WHERE id=? AND status='ISSUED'", [id]);
    if (result.affectedRows !== 1) throw conflict('ACTIVATION_NOT_REVOCABLE');
    return { id, status: 'REVOKED' };
  }

  async function listActivations(instanceId) {
    const [rows] = await pool.query(
      `SELECT id, instance_id, status, expires_at, consumed_at, created_at
         FROM activation_codes WHERE instance_id=? ORDER BY created_at DESC`,
      [instanceId],
    );
    return rows;
  }

  return { listCustomers, createCustomer, listPlans, createPlan, createInstance, listInstances, issueActivation, revokeActivation, listActivations };
}

module.exports = { createAdminService };
