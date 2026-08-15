'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { enumerateSubnets, lowestFreeSubnet } = require('../src/domain/networkPool');

test('divide el bloque central en /22 canónicos', () => {
  const ranges = enumerateSubnets('10.64.0.0/12');
  assert.equal(ranges.length, 1024);
  assert.equal(ranges[0], '10.64.0.0/22');
  assert.equal(ranges[1], '10.64.4.0/22');
  assert.equal(ranges.at(-1), '10.79.252.0/22');
});

test('asigna el /22 libre más bajo sin reutilizar reservas', () => {
  assert.equal(lowestFreeSubnet('10.64.0.0/12', ['10.64.0.0/22', '10.64.4.0/22']), '10.64.8.0/22');
});

test('rechaza pools no canónicos o agotados', () => {
  assert.throws(() => enumerateSubnets('10.64.1.0/12'), /NETWORK_POOL_NOT_CANONICAL/);
  assert.throws(() => lowestFreeSubnet('10.64.0.0/22', ['10.64.0.0/22']), /NETWORK_POOL_EXHAUSTED/);
});
