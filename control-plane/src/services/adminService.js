'use strict';

const crypto = require('crypto');
const { generateActivationCode } = require('../domain/activationCodes');
const { deriveFqdn, normalizeSubdomainLabel, proposeSubdomainLabel } = require('../domain/subdomains');
const { lowestFreeSubnet } = require('../domain/networkPool');

function conflict(code) { const error = new Error(code); error.code = code; return error; }

function createAdminService({ pool, activationPepper, now = () => new Date() }) {
  async function listCustomers() {
    const [rows] = await pool.query(`SELECT c.id,c.legal_name,c.display_name,c.tax_id,c.status,c.version,c.created_at,c.updated_at,
      cc.id AS contact_id,cc.full_name AS contact_name,cc.email AS contact_email,cc.phone AS contact_phone
      FROM customers c LEFT JOIN customer_contacts cc ON cc.customer_id=c.id AND cc.is_primary=TRUE AND cc.status='ACTIVE'
      ORDER BY c.created_at DESC`);
    return rows;
  }

  async function updateCustomer(id,input) {
    const db=await pool.getConnection();try{await db.beginTransaction();const [result]=await db.query(`UPDATE customers SET legal_name=?,display_name=?,tax_id=?,version=version+1 WHERE id=? AND version=?`,[input.legalName,input.displayName,input.taxId||null,id,input.version]);if(result.affectedRows!==1)throw conflict('CUSTOMER_VERSION_CONFLICT');await db.query(`UPDATE customer_contacts SET full_name=?,email=?,phone=? WHERE customer_id=? AND is_primary=TRUE AND status='ACTIVE'`,[input.contact.fullName,input.contact.email.toLowerCase(),input.contact.phone||null,id]);await db.commit();return{id,...input,version:input.version+1}}catch(e){await db.rollback().catch(()=>{});throw e}finally{db.release()}
  }
  async function setCustomerStatus(id,input){const [result]=await pool.query('UPDATE customers SET status=?,version=version+1 WHERE id=? AND version=?',[input.status,id,input.version]);if(result.affectedRows!==1)throw conflict('CUSTOMER_VERSION_CONFLICT');return{id,status:input.status,version:input.version+1}}

  async function createCustomer(input) {
    const id = crypto.randomUUID();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('INSERT INTO customers (id,legal_name,display_name,tax_id) VALUES (?,?,?,?)',
        [id,input.legalName,input.displayName,input.taxId || null]);
      const contactId = crypto.randomUUID();
      await connection.query(`INSERT INTO customer_contacts
        (id,customer_id,full_name,email,phone,role,is_primary) VALUES (?,?,?,?,?,'OWNER',TRUE)`,
        [contactId,id,input.contact.fullName,input.contact.email.toLowerCase(),input.contact.phone || null]);
      await connection.commit();
      return { id, ...input, contactId, status:'ACTIVE' };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  async function listPlans() {
    const [plans] = await pool.query('SELECT id,code,name,description,is_active,version FROM subscription_plans ORDER BY name');
    const [entitlements] = await pool.query('SELECT plan_id,feature_key,enabled,numeric_limit,config_json FROM plan_entitlements ORDER BY feature_key');
    const [prices] = await pool.query(`SELECT id,plan_id,billing_interval,currency,amount,effective_from,effective_to
      FROM subscription_plan_prices WHERE is_active=TRUE ORDER BY effective_from DESC`);
    return plans.map(plan => ({ ...plan,
      entitlements:entitlements.filter(item=>item.plan_id===plan.id),
      prices:prices.filter(item=>item.plan_id===plan.id) }));
  }
  async function updatePlan(id,input){const [result]=await pool.query('UPDATE subscription_plans SET name=?,description=?,version=version+1 WHERE id=? AND version=?',[input.name,input.description||null,id,input.version]);if(result.affectedRows!==1)throw conflict('PLAN_VERSION_CONFLICT');return{id,...input,version:input.version+1}}
  async function setPlanStatus(id,input){const [result]=await pool.query('UPDATE subscription_plans SET is_active=?,version=version+1 WHERE id=? AND version=?',[input.active,id,input.version]);if(result.affectedRows!==1)throw conflict('PLAN_VERSION_CONFLICT');return{id,isActive:input.active,version:input.version+1}}

  async function createPlan(input) {
    const connection = await pool.getConnection();
    const id = crypto.randomUUID();
    try {
      await connection.beginTransaction();
      await connection.query('INSERT INTO subscription_plans (id, code, name, description) VALUES (?, ?, ?, ?)', [id, input.code, input.name, input.description || null]);
      for (const item of input.entitlements || []) {
        await connection.query('INSERT INTO plan_entitlements (plan_id, feature_key, enabled, numeric_limit) VALUES (?, ?, ?, ?)', [id, item.key, item.enabled, item.limit ?? null]);
      }
      for (const price of input.prices) await connection.query(
        `INSERT INTO subscription_plan_prices (id,plan_id,billing_interval,currency,amount,effective_from)
         VALUES (?,?,?,?,?,?)`,
        [crypto.randomUUID(),id,price.interval,price.currency,price.amount,now()],
      );
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

  async function assignSubscription(instanceId, input, actorId) {
    const id = crypto.randomUUID(), startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) throw conflict('SUBSCRIPTION_DATES_INVALID');
    const connection=await pool.getConnection();
    try{
      await connection.beginTransaction();
      const [existing]=await connection.query("SELECT id FROM subscriptions WHERE instance_id=? AND status IN ('TRIAL','ACTIVE','GRACE_PERIOD','PAST_DUE') FOR UPDATE",[instanceId]);
      if(existing[0])throw conflict('SUBSCRIPTION_ALREADY_EXISTS');
      const [result] = await connection.query('INSERT INTO subscriptions (id,instance_id,plan_id,status,starts_at,ends_at) SELECT ?,pi.id,sp.id,?,?,? FROM product_instances pi JOIN subscription_plans sp ON sp.id=? AND sp.is_active=TRUE WHERE pi.id=?',[id,input.status,startsAt,endsAt,input.planId,instanceId]);
      if (result.affectedRows !== 1) throw conflict('SUBSCRIPTION_TARGET_NOT_FOUND');
      await connection.query("INSERT INTO subscription_events (id,subscription_id,instance_id,event_type,actor_id,new_values_json) VALUES (?,?,?,'CREATED',?,?)",[crypto.randomUUID(),id,instanceId,actorId,JSON.stringify({status:input.status,startsAt,endsAt,planId:input.planId})]);
      await connection.commit();return { id, instanceId, ...input };
    }catch(error){await connection.rollback().catch(()=>{});throw error}finally{connection.release()}
  }

  async function onboardInstance(input, actorId) {
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) throw conflict('SUBSCRIPTION_DATES_INVALID');
    const connection = await pool.getConnection();
    const instanceId = crypto.randomUUID(), subscriptionId = crypto.randomUUID();
    try {
      await connection.beginTransaction();
      const [customers] = await connection.query("SELECT display_name FROM customers WHERE id=? AND status='ACTIVE' FOR UPDATE", [input.customerId]);
      if (!customers[0]) throw conflict('CUSTOMER_NOT_FOUND');
      const [plans] = await connection.query('SELECT id FROM subscription_plans WHERE id=? AND is_active=TRUE FOR UPDATE', [input.planId]);
      if (!plans[0]) throw conflict('PLAN_NOT_FOUND');
      const label = input.subdomainLabel ? normalizeSubdomainLabel(input.subdomainLabel) : proposeSubdomainLabel(customers[0].display_name);
      const [settings] = await connection.query("SELECT setting_key,setting_value FROM platform_settings WHERE setting_key IN ('root_domain','network_pool') FOR UPDATE");
      const config = Object.fromEntries(settings.map(row => [row.setting_key, row.setting_value]));
      if (!config.root_domain || !config.network_pool) throw conflict('PLATFORM_SETTINGS_INCOMPLETE');
      const [allocations] = await connection.query("SELECT management_cidr FROM network_allocations WHERE status IN ('RESERVED','ASSIGNED')");
      const managementCidr = lowestFreeSubnet(config.network_pool, allocations.map(row => row.management_cidr));
      await connection.query('INSERT INTO product_instances (id,customer_id,subdomain_label,public_ip) VALUES (?,?,?,?)', [instanceId,input.customerId,label,input.publicIp || null]);
      await connection.query('INSERT INTO network_allocations (id,instance_id,management_cidr) VALUES (?,?,?)', [crypto.randomUUID(),instanceId,managementCidr]);
      await connection.query('INSERT INTO subscriptions (id,instance_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,?,?,?)', [subscriptionId,instanceId,input.planId,input.status,startsAt,endsAt]);
      await connection.query("INSERT INTO subscription_events (id,subscription_id,instance_id,event_type,actor_id,new_values_json) VALUES (?,?,?,'CREATED',?,?)", [crypto.randomUUID(),subscriptionId,instanceId,actorId,JSON.stringify({status:input.status,startsAt,endsAt,planId:input.planId})]);
      const generated = generateActivationCode(activationPepper), activationId = crypto.randomUUID();
      const expiresAt = new Date(now().getTime() + input.ttlHours * 60 * 60 * 1000);
      await connection.query('INSERT INTO activation_codes (id,instance_id,code_digest,expires_at,created_by) VALUES (?,?,?,?,?)', [activationId,instanceId,generated.digest,expiresAt,actorId]);
      await connection.commit();
      return {
        instance:{id:instanceId,customerId:input.customerId,subdomainLabel:label,fqdn:deriveFqdn(config.root_domain,label),managementCidr,status:'PENDING_ACTIVATION'},
        subscription:{id:subscriptionId,instanceId,planId:input.planId,status:input.status,startsAt,endsAt},
        activation:{id:activationId,instanceId,code:generated.code,expiresAt},
      };
    } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
  }

  return { listCustomers, createCustomer, updateCustomer, setCustomerStatus, listPlans, createPlan, updatePlan, setPlanStatus, createInstance, listInstances, issueActivation, revokeActivation, listActivations, assignSubscription, onboardInstance };
}

module.exports = { createAdminService };
