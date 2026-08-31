#!/usr/bin/env python3
import base64, ipaddress, json, os, pathlib, re, shutil, subprocess, sys, time

INTENT = pathlib.Path(os.environ.get('WG0_SERVER_INTENT', '/opt/wg0-autosync/server-config.desired.json'))
RESULT = pathlib.Path(os.environ.get('WG0_SERVER_RESULT', '/opt/wg0-autosync/server-config.result.json'))
CONF = pathlib.Path('/etc/wireguard/wg0.conf')
KEY = pathlib.Path('/etc/wireguard/wg0.key')
BACKUPS = pathlib.Path('/var/backups/gestionvpn-wireguard')
LATEST = BACKUPS / 'latest'

def run(args, input_text=None, check=True):
    return subprocess.run(args, input=input_text, text=True, capture_output=True, check=check)

def write_atomic(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name('.' + path.name + '.tmp')
    temp.write_text(content, encoding='utf-8')
    os.chmod(temp, mode)
    os.replace(temp, path)

def result(req, status, message, public_key=None, backup_id=''):
    payload = {'requestId': req.get('requestId',''), 'operation': req.get('operation',''), 'status': status,
               'message': message, 'publicKey': public_key, 'backupId': backup_id, 'completedAt': int(time.time()*1000)}
    # Sólo contiene estado y clave pública; el backend no-root debe poder leerlo.
    write_atomic(RESULT, json.dumps(payload, indent=2) + '\n', 0o644)

def valid_key(value):
    try: return len(base64.b64decode(value, validate=True)) == 32
    except Exception: return False

def validate(desired):
    iface = desired.get('interface','')
    if iface != 'wg0': raise ValueError('La primera versión sólo permite la interfaz wg0')
    address = ipaddress.ip_interface(desired.get('address',''))
    if address.version != 4 or address.network.prefixlen != 32: raise ValueError('La dirección debe ser IPv4 /32')
    mtu = int(desired.get('mtu',0)); port = int(desired.get('localListenPort') or 0)
    if not 1280 <= mtu <= 1500: raise ValueError('MTU fuera de rango')
    if not 0 <= port <= 65535: raise ValueError('Puerto local fuera de rango')
    pub = desired.get('corePublicKey','')
    if not valid_key(pub): raise ValueError('Clave pública del Core inválida')
    host = desired.get('coreEndpointHost','')
    if not re.fullmatch(r'[A-Za-z0-9.-]{1,253}', host): raise ValueError('Endpoint inválido')
    endpoint_port = int(desired.get('coreEndpointPort',0))
    if not 1 <= endpoint_port <= 65535: raise ValueError('Puerto del Core inválido')
    allowed = [str(ipaddress.ip_network(v, strict=True)) for v in desired.get('allowedIps',[])]
    if not allowed or '0.0.0.0/0' in allowed: raise ValueError('AllowedIPs inválidas')
    keepalive = int(desired.get('persistentKeepalive',0))
    if not 0 <= keepalive <= 3600: raise ValueError('Keepalive inválido')
    return address, mtu, port, pub, host, endpoint_port, allowed, keepalive

def ensure_key(force=False):
    KEY.parent.mkdir(parents=True, exist_ok=True)
    if force and KEY.exists(): KEY.unlink()
    if not KEY.exists(): write_atomic(KEY, run(['wg','genkey']).stdout.strip() + '\n', 0o600)
    private = KEY.read_text(encoding='utf-8').strip()
    if not valid_key(private): raise ValueError('Clave privada local inválida')
    public = run(['wg','pubkey'], private + '\n').stdout.strip()
    return private, public

def backup():
    backup_id = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())
    target = BACKUPS / backup_id; target.mkdir(parents=True, exist_ok=False)
    if CONF.exists(): shutil.copy2(CONF, target / 'wg0.conf')
    if KEY.exists(): shutil.copy2(KEY, target / 'wg0.key')
    write_atomic(LATEST, backup_id + '\n', 0o600)
    return backup_id

def apply(req, rotate=False):
    address, mtu, port, peer, host, endpoint_port, allowed, keepalive = validate(req.get('desired') or {})
    backup_id = backup(); private, public = ensure_key(force=rotate)
    listen = f'ListenPort = {port}\n' if port else ''
    conf = (f'[Interface]\nAddress = {address}\nPrivateKey = {private}\nMTU = {mtu}\n{listen}\n'
            f'[Peer]\nPublicKey = {peer}\nEndpoint = {host}:{endpoint_port}\n'
            f'AllowedIPs = {", ".join(allowed)}\nPersistentKeepalive = {keepalive}\n')
    write_atomic(CONF, conf, 0o600)
    try:
        active = run(['wg','show','wg0'], check=False).returncode == 0
        if active: run(['wg-quick','down','wg0'])
        run(['wg-quick','up','wg0'])
        run(['wg','show','wg0'])
        result(req, 'COMPLETED', 'WireGuard aplicado y verificado', public, backup_id)
    except Exception:
        rollback_to(backup_id, remove_if_empty=True)
        raise

def rollback_to(backup_id, remove_if_empty=False):
    source = BACKUPS / backup_id
    run(['wg-quick','down','wg0'], check=False)
    old_conf = source / 'wg0.conf'; old_key = source / 'wg0.key'
    if old_conf.exists(): shutil.copy2(old_conf, CONF)
    elif remove_if_empty and CONF.exists(): CONF.unlink()
    if old_key.exists(): shutil.copy2(old_key, KEY)
    elif remove_if_empty and KEY.exists(): KEY.unlink()
    if CONF.exists(): run(['wg-quick','up','wg0'])

def rollback(req):
    if not LATEST.exists(): raise ValueError('No existe respaldo WireGuard para restaurar')
    backup_id = LATEST.read_text(encoding='utf-8').strip()
    rollback_to(backup_id)
    public = run(['wg','show','wg0','public-key'], check=False).stdout.strip() or None
    result(req, 'ROLLED_BACK', 'Respaldo WireGuard restaurado', public, backup_id)

def main():
    req = json.loads(INTENT.read_text(encoding='utf-8'))
    if req.get('version') != 1 or not re.fullmatch(r'[0-9a-f-]{36}', req.get('requestId','')): raise ValueError('Intención inválida')
    if req.get('operation') == 'APPLY': apply(req)
    elif req.get('operation') == 'ROTATE': apply(req, rotate=True)
    elif req.get('operation') == 'ROLLBACK': rollback(req)
    else: raise ValueError('Operación no permitida')

if __name__ == '__main__':
    req = {}
    try: main()
    except Exception as exc:
        try:
            if INTENT.exists(): req = json.loads(INTENT.read_text(encoding='utf-8'))
            result(req, 'FAILED', str(exc)[:500])
        finally: sys.exit(1)
