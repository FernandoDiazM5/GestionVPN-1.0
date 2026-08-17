'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {encryptPlatformSecret,decryptPlatformSecret}=require('../src/domain/platformSecrets');
const {createNotificationDeliveryService}=require('../src/services/notificationDeliveryService');
const key=Buffer.alloc(32,19).toString('base64');
test('cifra secretos de proveedores con contexto autenticado',()=>{
 const encrypted=encryptPlatformSecret('smtp-password-seguro',key,'smtp');
 assert.equal(encrypted.includes('smtp-password-seguro'),false);
 assert.equal(decryptPlatformSecret(encrypted,key,'smtp'),'smtp-password-seguro');
 assert.throws(()=>decryptPlatformSecret(encrypted,key,'otro'),/PLATFORM_SECRET_INVALID/);
});
test('la cola de bienvenida nunca persiste el código en claro',async()=>{
 let insertArgs;
 const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT pi.id'))return[[{id:'i1',customer_id:'c1',display_name:'Cliente',full_name:'Owner',email:'owner@example.test',subdomain_label:'cliente',root_domain:'joinpoint.cloud',management_cidr:'10.64.0.0/22'}]];insertArgs=args;return[{affectedRows:1}]}};
 const service=createNotificationDeliveryService({pool,encryptionKey:key,providers:{},now:()=>new Date('2026-08-16T00:00:00Z')});
 const result=await service.queueWelcome('i1',{id:'a1',code:'JPR-CODIGO-SECRETO',expiresAt:new Date('2026-08-17T00:00:00Z')});
 assert.equal(result.queued,true);
 assert.equal(JSON.stringify(insertArgs).includes('JPR-CODIGO-SECRETO'),false);
 assert.match(insertArgs[5],/^v1\./);
});
test('encola una sola comunicación por evento de membresía sin secretos',async()=>{
 let insertArgs;
 const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT s.id'))return[[{id:'s1',status:'SUSPENDED',ends_at:new Date('2026-09-01T00:00:00Z'),grace_ends_at:null,plan_name:'Profesional',instance_id:'i1',subdomain_label:'cliente',customer_id:'c1',display_name:'Cliente',full_name:'Owner',email:'owner@example.test',root_domain:'joinpoint.cloud'}]];insertArgs=args;return[{affectedRows:1}]}};
 const service=createNotificationDeliveryService({pool,encryptionKey:key,providers:{},now:()=>new Date('2026-08-16T00:00:00Z')});
 const result=await service.queueSubscriptionEvent('s1',{eventId:'event-1',eventType:'SUSPENDED',reason:'Pago pendiente'});
 assert.equal(result.queued,true);
 assert.equal(insertArgs[3],'SUBSCRIPTION_SUSPENDED');
 assert.equal(insertArgs[4],'owner@example.test');
 assert.equal(JSON.parse(insertArgs[5]).reason,'Pago pendiente');
 assert.match(insertArgs[6],/^[a-f0-9]{64}$/);
});
test('encola factura emitida con snapshot comercial y clave idempotente',async()=>{
 let insertArgs;const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT bi.id'))return[[{id:'f1',invoice_number:'JP-2026-000001',total:'118.00',currency:'PEN',due_at:new Date('2026-08-20T00:00:00Z'),plan_name:'Profesional',instance_id:'i1',subdomain_label:'cliente',customer_id:'c1',display_name:'Cliente',full_name:'Owner',email:'owner@example.test',root_domain:'joinpoint.cloud',payment_instructions:'Transferencia'}]];insertArgs=args;return[{affectedRows:1}]}};
 const service=createNotificationDeliveryService({pool,encryptionKey:key,providers:{},now:()=>new Date('2026-08-16T00:00:00Z')});const result=await service.queueInvoiceEvent('f1','INVOICE_ISSUED');
 assert.equal(result.queued,true);assert.equal(insertArgs[3],'INVOICE_ISSUED');assert.equal(JSON.parse(insertArgs[5]).invoiceNumber,'JP-2026-000001');assert.match(insertArgs[6],/^[a-f0-9]{64}$/);
});
