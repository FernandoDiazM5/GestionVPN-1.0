'use strict';
const fs=require('fs'); const path=require('path'); const test=require('node:test'); const assert=require('node:assert/strict');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const compose=read('compose.yaml'), nginx=read('nginx.conf.template');
test('MariaDB no se publica y Central no expone puerto directo',()=>{ const central=compose.match(/\n  central:[\s\S]*?\n  proxy:/)[0]; assert.doesNotMatch(compose,/3306:3306/); assert.doesNotMatch(central,/\n    ports:/); });
test('Central usa imagen, privada read-only y capacidades retiradas',()=>{ assert.match(compose,/JOINPOINT_CENTRAL_IMAGE/); assert.match(compose,/license-signing\.pem:ro/); assert.match(compose,/cap_drop: \[ALL\]/); });
test('proxy fuerza HTTPS, host canónico y limita login',()=>{ assert.match(nginx,/return 301 https:/); assert.match(nginx,/return 444/); assert.match(nginx,/limit_req zone=central_login/); assert.match(nginx,/TLSv1\.2 TLSv1\.3/); });
