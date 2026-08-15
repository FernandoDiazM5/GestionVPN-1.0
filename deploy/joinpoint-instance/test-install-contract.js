'use strict';
const fs=require('fs');
const path=require('path');
const test=require('node:test');
const assert=require('node:assert/strict');
const installer=fs.readFileSync(path.join(__dirname,'install.sh'),'utf8');

test('el instalador es fail-closed y reanudable',()=>{
  assert.match(installer,/set -Eeuo pipefail/);
  assert.match(installer,/umask 077/);
  assert.match(installer,/--check\)/);
  assert.match(installer,/--apply\)/);
  assert.match(installer,/--resume\)/);
  assert.match(installer,/PENDING_DNS_TLS/);
  assert.match(installer,/READY_FOR_TLS/);
});

test('la activacion no envia la clave privada ni imprime el codigo',()=>{
  const request=installer.match(/jq -n --arg code[\s\S]*?> "\$INSTALL_ROOT\/secrets\/activation-request\.json"/)[0];
  assert.match(request,/instancePublicKeyPem/);
  assert.doesNotMatch(request,/instance-private/);
  assert.doesNotMatch(installer,/printf[^\n]*JOINPOINT_ACTIVATION_CODE/);
});

test('no inicia servicios antes de DNS y TLS',()=>{
  assert.doesNotMatch(installer,/docker compose (up|start)/);
  assert.match(installer,/check_dns/);
});
