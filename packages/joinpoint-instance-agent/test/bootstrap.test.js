'use strict';
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const test=require('node:test');
const assert=require('node:assert/strict');
const { readActivation }=require('../src/bootstrap');

test('lee solamente una respuesta de activacion completa',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'joinpoint-bootstrap-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const file=path.join(directory,'activation.json');
  await fs.writeFile(file,JSON.stringify({activation:{instanceId:'i-1',license:'token',licensePublicKey:'pem'}}),{mode:0o600});
  assert.equal((await readActivation(file)).instanceId,'i-1');
  await fs.writeFile(file,JSON.stringify({instanceId:'i-1'}),{mode:0o600});
  await assert.rejects(readActivation(file),/JOINPOINT_ACTIVATION_LICENSE_REQUIRED/);
});
