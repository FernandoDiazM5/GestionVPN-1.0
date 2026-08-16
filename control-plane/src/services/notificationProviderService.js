'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { encryptPlatformSecret, decryptPlatformSecret } = require('../domain/platformSecrets');

function coded(code) { const error = new Error(code); error.code = code; return error; }
function safeProvider(row) {
  if (!row) return { type:'SMTP',status:'NOT_CONFIGURED',configured:false };
  const config = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;
  return { type:row.provider_type,displayName:row.display_name,status:row.status,configured:Boolean(row.secret_encrypted),
    config,lastTestedAt:row.last_tested_at,lastSuccessAt:row.last_success_at,lastErrorCode:row.last_error_code,version:Number(row.version) };
}

function createNotificationProviderService({ pool, encryptionKey, now=()=>new Date() }) {
  async function getSmtp() {
    const [rows] = await pool.query("SELECT * FROM notification_providers WHERE provider_type='SMTP'");
    return safeProvider(rows[0]);
  }
  async function saveSmtp(input, actorId) {
    const id = crypto.randomUUID();
    const context = 'notification-provider:SMTP';
    const [existing] = await pool.query("SELECT id,secret_encrypted,version FROM notification_providers WHERE provider_type='SMTP'");
    const record = existing[0];
    const encrypted = input.password ? encryptPlatformSecret(input.password,encryptionKey,context) : record?.secret_encrypted;
    if (input.enabled && input.username && !encrypted) throw coded('SMTP_PASSWORD_REQUIRED');
    const config = JSON.stringify({ host:input.host,port:input.port,secure:input.secure,username:input.username || '',
      fromName:input.fromName,fromEmail:input.fromEmail,replyTo:input.replyTo || '' });
    if (record) await pool.query(`UPDATE notification_providers SET display_name='Correo Central',config_json=?,secret_encrypted=?,
      status=?,version=version+1,updated_by=? WHERE id=?`,[config,encrypted,input.enabled?'CONFIGURED':'DISABLED',actorId,record.id]);
    else await pool.query(`INSERT INTO notification_providers
      (id,provider_type,display_name,config_json,secret_encrypted,status,updated_by) VALUES (?,'SMTP','Correo Central',?,?,?,?)`,
      [id,config,encrypted,input.enabled?'CONFIGURED':'DISABLED',actorId]);
    return getSmtp();
  }
  async function transporterAndProvider() {
    const [rows] = await pool.query("SELECT * FROM notification_providers WHERE provider_type='SMTP'");
    const row=rows[0]; if(!row || row.status==='DISABLED' || !row.secret_encrypted) throw coded('SMTP_NOT_CONFIGURED');
    const config=typeof row.config_json==='string'?JSON.parse(row.config_json):row.config_json;
    const password=decryptPlatformSecret(row.secret_encrypted,encryptionKey,'notification-provider:SMTP');
    return { row,config,transporter:nodemailer.createTransport({host:config.host,port:Number(config.port),secure:Boolean(config.secure),
      auth:config.username?{user:config.username,pass:password}:undefined,connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000}) };
  }
  async function testSmtp(recipient) {
    const timestamp=now();
    try {
      const {row,config,transporter}=await transporterAndProvider();
      await transporter.verify();
      await transporter.sendMail({to:recipient,from:{name:config.fromName,address:config.fromEmail},replyTo:config.replyTo||undefined,
        subject:'Prueba de correo · Joinpoint Central',text:'La configuración de correo de Joinpoint Central funciona correctamente.'});
      await pool.query("UPDATE notification_providers SET status='HEALTHY',last_tested_at=?,last_success_at=?,last_error_code=NULL WHERE id=?",[timestamp,timestamp,row.id]);
      return { delivered:true,testedAt:timestamp };
    } catch(error) {
      await pool.query("UPDATE notification_providers SET status='ERROR',last_tested_at=?,last_error_code=? WHERE provider_type='SMTP'",
        [timestamp,String(error.code||'SMTP_TEST_FAILED').slice(0,80)]).catch(()=>{});
      if(error.code==='SMTP_NOT_CONFIGURED') throw error;
      throw coded('SMTP_TEST_FAILED');
    }
  }
  async function getTelegram(){
    const [rows]=await pool.query("SELECT * FROM notification_providers WHERE provider_type='TELEGRAM'");
    const safe=safeProvider(rows[0]);return{...safe,type:'TELEGRAM'};
  }
  async function saveTelegram(input,actorId){
    const id=crypto.randomUUID(),context='notification-provider:TELEGRAM';
    const [existing]=await pool.query("SELECT id,secret_encrypted FROM notification_providers WHERE provider_type='TELEGRAM'"),record=existing[0];
    const encrypted=input.botToken?encryptPlatformSecret(input.botToken,encryptionKey,context):record?.secret_encrypted;
    if(input.enabled&&!encrypted)throw coded('TELEGRAM_TOKEN_REQUIRED');
    const config=JSON.stringify({chatId:input.chatId,eventSeverity:input.eventSeverity});
    if(record)await pool.query("UPDATE notification_providers SET display_name='Telegram Central',config_json=?,secret_encrypted=?,status=?,version=version+1,updated_by=? WHERE id=?",[config,encrypted,input.enabled?'CONFIGURED':'DISABLED',actorId,record.id]);
    else await pool.query("INSERT INTO notification_providers (id,provider_type,display_name,config_json,secret_encrypted,status,updated_by) VALUES (?,'TELEGRAM','Telegram Central',?,?,?,?)",[id,config,encrypted,input.enabled?'CONFIGURED':'DISABLED',actorId]);
    return getTelegram();
  }
  async function testTelegram(){
    const timestamp=now();try{
      const [rows]=await pool.query("SELECT * FROM notification_providers WHERE provider_type='TELEGRAM'"),row=rows[0];
      if(!row||row.status==='DISABLED'||!row.secret_encrypted)throw coded('TELEGRAM_NOT_CONFIGURED');
      const config=typeof row.config_json==='string'?JSON.parse(row.config_json):row.config_json,token=decryptPlatformSecret(row.secret_encrypted,encryptionKey,'notification-provider:TELEGRAM');
      const me=await fetch('https://api.telegram.org/bot'+encodeURIComponent(token)+'/getMe',{signal:AbortSignal.timeout(8000)}),meData=await me.json();
      if(!me.ok||!meData.ok)throw coded('TELEGRAM_BOT_INVALID');
      const sent=await fetch('https://api.telegram.org/bot'+encodeURIComponent(token)+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:config.chatId,text:'Joinpoint Central: configuración administrativa verificada.'}),signal:AbortSignal.timeout(8000)});
      const sentData=await sent.json();if(!sent.ok||!sentData.ok)throw coded('TELEGRAM_CHAT_INVALID');
      await pool.query("UPDATE notification_providers SET status='HEALTHY',last_tested_at=?,last_success_at=?,last_error_code=NULL WHERE id=?",[timestamp,timestamp,row.id]);
      return{delivered:true,botUsername:meData.result.username,testedAt:timestamp};
    }catch(error){await pool.query("UPDATE notification_providers SET status='ERROR',last_tested_at=?,last_error_code=? WHERE provider_type='TELEGRAM'",[timestamp,String(error.code||'TELEGRAM_TEST_FAILED').slice(0,80)]).catch(()=>{});if(/^TELEGRAM_/.test(error.code||''))throw error;throw coded('TELEGRAM_TEST_FAILED')}
  }
  return { getSmtp,saveSmtp,testSmtp,transporterAndProvider,getTelegram,saveTelegram,testTelegram };
}

module.exports={createNotificationProviderService};
