'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {render,validateTemplate,createNotificationTemplateService}=require('../src/services/notificationTemplateService');
test('renderiza sólo variables declaradas',()=>{validateTemplate('Hola {{customerName}}','Código {{activationCode}}');assert.equal(render('Hola {{customerName}}',{customerName:'Acme'}),'Hola Acme')});
test('rechaza variables no permitidas',()=>assert.throws(()=>validateTemplate('Hola {{password}}','Contenido suficientemente largo'),/TEMPLATE_VARIABLE_INVALID/));
test('genera vista previa con datos ficticios sin modificar la plantilla',()=>{const service=createNotificationTemplateService({pool:{}});const out=service.preview({subject:'Factura {{invoiceNumber}}',body:'Hola {{contactName}}, total {{currency}} {{total}}'});assert.equal(out.subject,'Factura JP-2026-000001');assert.match(out.body,/María Pérez, total PEN 118\.00/)});
