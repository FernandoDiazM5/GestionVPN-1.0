'use strict';

const net = require('node:net');
const { waitForTcp } = require('../../scripts/waitForDatabase');

describe('waitForDatabase', () => {
  test('resolves when the TCP endpoint accepts connections', async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    await expect(waitForTcp({
      host: '127.0.0.1',
      port,
      timeoutMs: 1_000,
      retryMs: 10,
    })).resolves.toBeUndefined();

    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  test('rejects after the configured timeout when the endpoint is unavailable', async () => {
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address();
    await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));

    await expect(waitForTcp({
      host: '127.0.0.1',
      port,
      timeoutMs: 30,
      retryMs: 10,
    })).rejects.toThrow('was unavailable');
  });
});
