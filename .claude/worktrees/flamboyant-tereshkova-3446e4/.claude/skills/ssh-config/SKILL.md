---
name: ssh-config
description: Use this skill whenever the user needs to configure SSH connections to network devices, especially Ubiquiti airOS access points or MikroTik RouterOS. Trigger for: "SSH won't connect", "No matching key exchange", "handshake fails", "ssh2 error", "legacy algorithm", "Ubiquiti SSH", "airOS SSH", configuring ssh2 in Node.js, or any question about SSH connectivity to older embedded Linux devices. Also trigger when the user is setting up SSH credentials, key-based auth, or polling devices via SSH. If ssh2 options or algorithm negotiation is involved, use this skill.
---

# SSH Configuration for Network Devices

This project connects to Ubiquiti airOS access points and MikroTik RouterOS devices via SSH using the `ssh2` Node.js library. Both device families run old firmware that requires legacy crypto algorithms. This skill provides the correct configurations and troubleshooting steps.

## The Core Problem

Modern SSH clients (including `ssh2` >= 1.0) disable legacy algorithms by default for security reasons. Ubiquiti airOS (especially firmware 5.x–6.x) and some RouterOS versions only support:
- Key exchange: `diffie-hellman-group14-sha1`, `diffie-hellman-group1-sha1`
- Ciphers: `aes128-cbc`, `aes256-cbc`, `3des-cbc`
- Host key types: `ssh-rsa`, `ssh-dss`
- MACs: `hmac-sha1`, `hmac-md5`

Without explicitly enabling these, `ssh2` will fail at handshake with an error like:
```
Error: No matching key exchange method found
Error: All configured authentication methods failed
Handshake failed: no matching cipher found
```

## Correct ssh2 Config (Ubiquiti airOS)

```js
const conn = new Client();
conn.connect({
  host: device.ip,
  port: 22,
  username: device.username || 'ubnt',
  password: device.password || 'ubnt',
  readyTimeout: 10000,
  keepaliveInterval: 5000,
  algorithms: {
    kex: [
      'diffie-hellman-group14-sha1',
      'diffie-hellman-group1-sha1',
      'ecdh-sha2-nistp256',        // modern fallback
    ],
    cipher: [
      'aes128-cbc',
      'aes256-cbc',
      '3des-cbc',
      'aes128-ctr',                // modern fallback
      'aes256-ctr',
    ],
    serverHostKey: [
      'ssh-rsa',
      'ssh-dss',
      'ecdsa-sha2-nistp256',       // modern fallback
    ],
    hmac: [
      'hmac-sha1',
      'hmac-md5',
      'hmac-sha2-256',             // modern fallback
    ],
  },
});
```

Put modern algorithms as fallback (at the end), not first — this avoids breaking connections to newer devices while still supporting old firmware.

## Correct ssh2 Config (MikroTik RouterOS via SSH)

RouterOS is generally more modern but some older versions still need:
```js
algorithms: {
  kex: ['diffie-hellman-group14-sha1', 'ecdh-sha2-nistp256', 'curve25519-sha256'],
  cipher: ['aes128-ctr', 'aes256-ctr', 'aes128-cbc'],
  serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256'],
  hmac: ['hmac-sha2-256', 'hmac-sha1'],
}
```

Note: RouterOS API (port 8728) does not use SSH — use the `node-routeros` library for that. SSH to RouterOS is only needed for direct command execution.

## Connection Lifecycle Pattern

```js
import { Client } from 'ssh2';

function sshExec(host, credentials, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { conn.end(); return reject(err); }

        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { output += data.toString(); });
        stream.on('close', (code) => {
          conn.end();
          if (code !== 0 && code !== null) {
            reject(new Error(`Exit code ${code}: ${output}`));
          } else {
            resolve(output);
          }
        });
      });
    });

    conn.on('error', (err) => reject(err));

    conn.connect({
      host,
      port: 22,
      username: credentials.username,
      password: credentials.password,
      readyTimeout: 10000,
      algorithms: { /* use full config above */ },
    });
  });
}
```

Always call `conn.end()` after the stream closes, and on error — otherwise connections accumulate until the device refuses new ones.

## Polling Multiple Devices

When polling multiple APs concurrently, limit parallelism to avoid overwhelming devices:

```js
// Don't do Promise.all on 20 SSH connections simultaneously
// Use a concurrency limit:
const results = [];
for (const device of devices) {
  try {
    const data = await sshExec(device.ip, device.credentials, 'iwconfig ath0');
    results.push({ device, data });
  } catch (err) {
    results.push({ device, error: err.message }); // don't let one failure stop others
  }
}
```

Or use `p-limit` for true concurrency with a cap:
```js
import pLimit from 'p-limit';
const limit = pLimit(3); // max 3 concurrent SSH connections
const results = await Promise.allSettled(devices.map(d => limit(() => pollDevice(d))));
```

## Credentials Storage

SSH credentials for Ubiquiti devices are stored per-device in SQLite. Never hardcode them in source files.

Schema pattern:
```sql
CREATE TABLE devices (
  id INTEGER PRIMARY KEY,
  ip TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,  -- consider encrypting at rest
  type TEXT DEFAULT 'ubiquiti'
);
```

## Parsing airOS Output

Common `iwconfig`/`iwlist` fields to extract:

```js
// Signal level from: "Signal level=-65 dBm"
const signal = output.match(/Signal level[=:](-?\d+)/)?.[1];

// CCQ from Ubiquiti custom field or from: "Link Quality=47/70"
const [linkNumerator, linkDenominator] = output.match(/Link Quality[=:](\d+)\/(\d+)/)?.slice(1) ?? [];
const ccq = linkNumerator && linkDenominator
  ? Math.round((parseInt(linkNumerator) / parseInt(linkDenominator)) * 100)
  : null;

// TX/RX bytes from ifconfig: "RX bytes:1234567"
const rxBytes = output.match(/RX bytes[=:](\d+)/)?.[1];
const txBytes = output.match(/TX bytes[=:](\d+)/)?.[1];
```

## Troubleshooting Checklist

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `No matching key exchange` | Legacy kex not in algorithm list | Add `diffie-hellman-group14-sha1` and `group1-sha1` |
| `Authentication failed` | Wrong username/password | Default is `ubnt/ubnt`; check DB record |
| `ECONNREFUSED` | SSH not enabled on device or wrong IP | Check device web UI → Services → SSH |
| `ETIMEDOUT` | Device unreachable on network | Check LAN connectivity, VLAN, firewall |
| `Handshake timeout` | Device is slow / overloaded | Increase `readyTimeout` to 15000–20000 |
| `Connection reset` | Too many open connections | Call `conn.end()` after each command |
| `No matching host key type` | Device uses only `ssh-rsa` | Add `ssh-rsa` to `serverHostKey` list |
| Command returns empty | Wrong interface name | Use `iwconfig` to list interfaces, not `iwconfig ath0` directly |
