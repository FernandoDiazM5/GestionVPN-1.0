'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCommercialService}=require('../src/services/commercialService');
function harness(current){
 const writes=[];const db={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,args)=>{writes.push({sql,args});if(sql.startsWith('SELECT * FROM subscriptions'))return[[current]];if(sql.startsWith('UPDATE subscriptions'))return[{affectedRows:1}];return[{affectedRows:1}]}};
 return{writes,service:createCommercialService({pool:{getConnection:async()=>db},now:()=>new Date('2026-08-16T00:00:00Z')})};
}
test('suspender exige motivo y no borra la instancia',async()=>{
 const {writes,service}=harness({id:'s1',instance_id:'i1',status:'ACTIVE',starts_at:new Date('2026-08-01'),ends_at:new Date('2026-09-01'),grace_ends_at:null,version:1});
 await assert.rejects(()=>service.transition('s1',{action:'SUSPEND',version:1},'admin'),error=>error.code==='SUBSCRIPTION_REASON_REQUIRED');
 assert.equal(writes.some(x=>/DELETE/i.test(x.sql)),false);
});
test('renovación usa control optimista y registra evento',async()=>{
 const {writes,service}=harness({id:'s1',instance_id:'i1',status:'ACTIVE',starts_at:new Date('2026-08-01'),ends_at:new Date('2026-09-01'),grace_ends_at:null,version:2});
 const out=await service.transition('s1',{action:'RENEW',version:2,months:1},'admin');
 assert.equal(out.status,'ACTIVE');assert.equal(out.version,3);
 assert.equal(writes.some(x=>x.sql.startsWith('INSERT INTO subscription_events')),true);
 assert.equal(writes.find(x=>x.sql.startsWith('UPDATE subscriptions')).args.at(-1),2);
});
test('el vencimiento revoca la licencia sin borrar infraestructura',async()=>{
 const writes=[];const current={id:'s1',instance_id:'i1',status:'ACTIVE',ends_at:new Date('2026-08-15T00:00:00Z'),grace_ends_at:null};
 const db={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,args)=>{writes.push({sql,args});if(sql.startsWith('SELECT * FROM subscriptions'))return[[current]];return[{affectedRows:1}]}};
 const pool={query:async()=>[[{id:'s1'}]],getConnection:async()=>db};
 const out=await createCommercialService({pool,now:()=>new Date('2026-08-16T00:00:00Z')}).reconcileExpirations();
 assert.equal(out.reconciled,1);
 assert.equal(writes.some(x=>x.sql.includes("status='REVOKED'")),true);
 assert.equal(writes.some(x=>/DELETE/i.test(x.sql)),false);
});
