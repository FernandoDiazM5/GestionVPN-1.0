function unsafeShell(exec, req) {
  // ruleid: gestionvpn-direct-request-to-command
  return exec(req.body.command);
}

function unsafeRouter(safeWrite, api, req) {
  // ruleid: gestionvpn-direct-request-to-command
  return safeWrite(api, ['/ip/route/add', `=gateway=${req.query.gateway}`]);
}

function unsafeSsh(ssh, req) {
  // ruleid: gestionvpn-direct-request-to-command
  return ssh.execCommand(req.params.command);
}

function safeValidatedRouter(safeWrite, api, req, schema) {
  const input = schema.parse(req.body);
  // ok: gestionvpn-direct-request-to-command
  return safeWrite(api, ['/ip/route/add', `=gateway=${input.gateway}`]);
}

function safeConstantShell(execFile) {
  // ok: gestionvpn-direct-request-to-command
  return execFile('/usr/bin/wg', ['show']);
}
