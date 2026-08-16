'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {render,validateTemplate}=require('../src/services/notificationTemplateService');
test('renderiza sólo variables declaradas',()=>{validateTemplate('Hola {{customerName}}','Código {{activationCode}}');assert.equal(render('Hola {{customerName}}',{customerName:'Acme'}),'Hola Acme')});
test('rechaza variables no permitidas',()=>assert.throws(()=>validateTemplate('Hola {{password}}','Contenido suficientemente largo'),/TEMPLATE_VARIABLE_INVALID/));
