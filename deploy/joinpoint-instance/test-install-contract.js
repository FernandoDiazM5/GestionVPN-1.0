'use strict';
const fs=require('fs');
const path=require('path');
const test=require('node:test');
const assert=require('node:assert/strict');
const installer=fs.readFileSync(path.join(__dirname,'install.sh'),'utf8');
const compose=fs.readFileSync(path.join(__dirname,'compose.yaml'),'utf8');

test('el instalador es fail-closed y reanudable',()=>{
  assert.match(installer,/set -Eeuo pipefail/);
  assert.match(installer,/umask 077/);
  assert.match(installer,/--check\)/);
  assert.match(installer,/--apply\)/);
  assert.match(installer,/--resume\)/);
  assert.match(installer,/PENDING_DNS_TLS/);
  assert.match(installer,/TLS_READY/);
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

test('compose aisla base de datos y endurece el agente',()=>{
  assert.match(compose,/127\.0\.0\.1:\$\{DB_HOST_PORT:-3307\}:3306/);
  assert.match(compose,/instance-agent:[\s\S]*?read_only: true/);
  assert.match(compose,/instance-agent:[\s\S]*?cap_drop:\s*\n\s*- ALL/);
  assert.match(compose,/instance-private\.pem:ro/);
  assert.doesNotMatch(compose,/TELEGRAM_BOT_TOKEN|GEMINI_API_KEY|SMTP_PASS/);
});

test('genera secretos unicos y deja integraciones personales apagadas',()=>{
  assert.match(installer,/random_hex\(\) \{ openssl rand -hex/);
  assert.match(installer,/TELEGRAM_BOT_ENABLED=false/);
  assert.match(installer,/GEMINI_AI_ENABLED=false/);
  assert.match(installer,/FEDERATED_AUTH_ENABLED=false/);
  assert.match(installer,/WG0_AUTOSYNC=false/);
  assert.doesNotMatch(installer,/gmail\.com|AIza|bot[0-9]+:/);
});

test('TLS y agente se preparan antes de permitir el arranque',()=>{
  assert.match(installer,/certbot\/certbot:v5\.7\.0/);
  assert.match(installer,/certonly --standalone --non-interactive --agree-tos/);
  assert.match(installer,/openssl x509[\s\S]*?-checkend 86400/);
  assert.match(installer,/JOINPOINT_ACTIVATION_RESPONSE_FILE/);
  assert.match(installer,/rm -f "\$INSTALL_ROOT\/secrets\/activation-response\.json"/);
  assert.match(installer,/READY_FOR_PLATFORM_BOOTSTRAP/);
  assert.doesNotMatch(installer,/docker compose[\s\S]*? up /);
});
