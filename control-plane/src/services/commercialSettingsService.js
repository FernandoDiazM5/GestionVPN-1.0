'use strict';
function createCommercialSettingsService({pool}) {
  async function get(){const [r]=await pool.query(`SELECT legal_name,tax_id,billing_email,address,invoice_prefix,default_currency,default_tax_percent,invoice_due_days,grace_days,payment_instructions,brand_name,support_email,version,updated_at FROM commercial_settings WHERE id=1`);return r[0]}
  async function save(i,actor){const [r]=await pool.query(`UPDATE commercial_settings SET legal_name=?,tax_id=?,billing_email=?,address=?,invoice_prefix=?,default_currency=?,default_tax_percent=?,invoice_due_days=?,grace_days=?,payment_instructions=?,brand_name=?,support_email=?,version=version+1,updated_by=? WHERE id=1 AND version=?`,[i.legalName,i.taxId||null,i.billingEmail||null,i.address||null,i.invoicePrefix,i.defaultCurrency,i.defaultTaxPercent,i.invoiceDueDays,i.graceDays,i.paymentInstructions||null,i.brandName,i.supportEmail||null,actor,i.version]);if(r.affectedRows!==1){const e=new Error('SETTINGS_VERSION_CONFLICT');e.code=e.message;throw e}return get()}
  return {get,save};
}
module.exports={createCommercialSettingsService};
