'use strict';
const crypto=require('crypto');
const ALLOWED=new Set(['contactName','customerName','fqdn','publicIp','managementCidr','activationCode','expiresAt','manualUrl','planName','status','endsAt','graceEndsAt','reason','eventName']);
function variables(text){return [...String(text||'').matchAll(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g)].map(x=>x[1])}
function validateTemplate(subject,body){const invalid=[...variables(subject),...variables(body)].filter(x=>!ALLOWED.has(x));if(invalid.length){const e=new Error('TEMPLATE_VARIABLE_INVALID');e.code=e.message;e.variables=[...new Set(invalid)];throw e}}
function render(text,data){return String(text||'').replace(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g,(_,key)=>String(data[key]??''))}
function createNotificationTemplateService({pool}){
 async function list(){const [r]=await pool.query("SELECT id,template_key,channel,locale,subject_template,body_text_template,version,created_at FROM notification_templates WHERE is_active=TRUE ORDER BY template_key,channel");return r}
 async function save(key,input,actor){validateTemplate(input.subject,input.body);const db=await pool.getConnection();try{await db.beginTransaction();const [rows]=await db.query('SELECT version FROM notification_templates WHERE template_key=? AND channel=? AND locale=? AND is_active=TRUE FOR UPDATE',[key,input.channel,input.locale]);const version=Number(rows[0]?.version||0)+1;await db.query('UPDATE notification_templates SET is_active=FALSE WHERE template_key=? AND channel=? AND locale=? AND is_active=TRUE',[key,input.channel,input.locale]);await db.query('INSERT INTO notification_templates (id,template_key,channel,locale,subject_template,body_text_template,version,is_active,created_by) VALUES (?,?,?,?,?,?,?,TRUE,?)',[crypto.randomUUID(),key,input.channel,input.locale,input.subject||null,input.body,version,actor]);await db.commit();return{template_key:key,...input,version}}catch(e){await db.rollback().catch(()=>{});throw e}finally{db.release()}}
 async function active(key,channel='EMAIL',locale='es-PE'){const [r]=await pool.query('SELECT * FROM notification_templates WHERE template_key=? AND channel=? AND locale=? AND is_active=TRUE',[key,channel,locale]);return r[0]||null}
 return{list,save,active,render,allowedVariables:[...ALLOWED]}
}
module.exports={createNotificationTemplateService,render,validateTemplate};
