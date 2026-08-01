#!/usr/bin/env python3
import glob, gzip, hashlib, hmac, ipaddress, json, os, re, subprocess, time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ.get('SECURITY_AGENT_SECRET', '')
HOST = os.environ.get('SECURITY_AGENT_HOST', '127.0.0.1')
PORT = int(os.environ.get('SECURITY_AGENT_PORT', '8788'))
ACTIONABLE = {'sshd', 'gestionvpn-15m', 'gestionvpn-1h', 'gestionvpn-6h',
              'gestionvpn-24h', 'gestionvpn-7d', 'gestionvpn-indefinite'}
PROTECTED = {'127.0.0.1', '::1'} | set(filter(None, os.environ.get('SECURITY_AGENT_PROTECTED_IPS', '').split(',')))
# Se carga al final para que no sea sobrescrito por jails locales existentes.
TRUST_FILE = '/etc/fail2ban/jail.d/zz-gestionvpn-trusted.local'
NONCES = {}

def run(args, timeout=8):
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=True).stdout

def target(value, network=False):
    value = str(value or '').strip()
    obj = ipaddress.ip_network(value, strict=False) if ('/' in value or network) else ipaddress.ip_address(value)
    if isinstance(obj, (ipaddress.IPv4Network, ipaddress.IPv6Network)):
        if obj.version == 4 and obj.prefixlen < 24: raise ValueError('IPv4 más amplio que /24')
        if obj.version == 6 and obj.prefixlen < 64: raise ValueError('IPv6 más amplio que /64')
    return str(obj)

def jail_names():
    out = run(['fail2ban-client', 'status'])
    match = re.search(r'Jail list:\s*(.+)', out)
    return sorted(x.strip() for x in (match.group(1).split(',') if match else []) if x.strip())

def jail_status(name, attempt_counts=None):
    out = run(['fail2ban-client', 'status', name])
    def number(label):
        m = re.search(rf'{re.escape(label)}:\s*(\d+)', out); return int(m.group(1)) if m else 0
    banned = []
    m = re.search(r'Banned IP list:\s*(.*)', out)
    if m: banned = [x for x in m.group(1).split() if x]
    details = []
    try:
        timed = run(['fail2ban-client', 'get', name, 'banip', '--with-time'])
        for line in timed.splitlines():
            match = re.match(r'([^\s]+)\s+(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \+ (-?\d+) = (.+)', line.strip())
            if not match: continue
            since = int(datetime.strptime(match.group(2), '%Y-%m-%d %H:%M:%S').astimezone().timestamp()*1000)
            seconds = int(match.group(3))
            details.append({'target': match.group(1), 'blockedSince': since,
              'expiresAt': None if seconds < 0 else since + seconds*1000})
    except Exception: pass
    attempt_counts = attempt_counts or {}
    for detail in details: detail['attempts'] = attempt_counts.get(detail['target'], 0)
    return {'name': name, 'actionable': name in ACTIONABLE, 'currentlyFailed': number('Currently failed'),
            'totalFailed': number('Total failed'), 'currentlyBanned': number('Currently banned'),
            'totalBanned': number('Total banned'), 'banned': banned, 'banDetails': details}

def trusted_values():
    try: text = open(TRUST_FILE, encoding='utf-8').read()
    except FileNotFoundError: return []
    match = re.search(r'^ignoreip\s*=\s*(.*)$', text, re.M)
    return [x for x in (match.group(1).split() if match else []) if x not in {'127.0.0.0/8', '::1'}]

def write_trusted(values):
    values = sorted(set(values), key=lambda x: (':' in x, x))
    temp = TRUST_FILE + '.tmp'
    with open(temp, 'w', encoding='utf-8') as fh:
        fh.write('[DEFAULT]\nignoreip = 127.0.0.0/8 ::1 ' + ' '.join(values) + '\n')
        fh.flush(); os.fsync(fh.fileno())
    os.chmod(temp, 0o600); os.replace(temp, TRUST_FILE)
    run(['fail2ban-client', 'reload'])

ATTEMPT_PATTERN = re.compile(
    r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(?:,\d+)? .*?\[([^\]]+)\] Found ([0-9a-fA-F:.]+)(?:\s|$)'
)

def retained_attempt_history(ip=None, limit=100):
    """Read detections from Fail2ban's retained current and rotated logs."""
    events = []
    for path in glob.glob('/var/log/fail2ban.log*'):
        if not os.path.isfile(path): continue
        opener = gzip.open if path.endswith('.gz') else open
        try:
            with opener(path, 'rt', encoding='utf-8', errors='replace') as fh:
                for line in fh:
                    match = ATTEMPT_PATTERN.search(line)
                    if not match: continue
                    detected = datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S').astimezone()
                    jail, detected_ip = match.group(2), match.group(3)
                    if ip and detected_ip != ip: continue
                    events.append({'service': jail, 'target': detected_ip,
                        'detectedAt': int(detected.timestamp() * 1000),
                        'message': f'Fail2ban detectó un intento en {jail} desde {detected_ip}'})
        except (OSError, EOFError):
            continue
    events.sort(key=lambda row: row['detectedAt'], reverse=True)
    retained = events[:limit]
    timestamps = [row['detectedAt'] for row in events]
    return {'attempts': retained, 'total': len(events),
            'historySince': min(timestamps) if timestamps else None,
            'historyUntil': max(timestamps) if timestamps else None,
            'truncated': len(events) > len(retained)}

def execute(op, p):
    if op == 'status':
        history = {'attempts': [], 'historySince': None, 'historyUntil': None}
        try:
            history = retained_attempt_history(limit=1000000)
        except Exception: pass
        counts = {}
        for row in history['attempts']: counts[row['target']] = counts.get(row['target'], 0) + 1
        return {'jails': [jail_status(j, counts) for j in jail_names()], 'trusted': trusted_values(),
                'attemptHistory': {'since': history['historySince'], 'until': history['historyUntil']}}
    if op == 'attempts':
        return retained_attempt_history(p.get('target'), min(int(p.get('limit', 100)), 500))
    value = target(p.get('target'), op in {'trust_add', 'trust_remove'})
    bare = value.split('/')[0]
    if op in {'ban', 'promote_indefinite', 'trust_remove'} and bare in PROTECTED: raise ValueError('Dirección protegida')
    if op == 'ban':
        jail = p.get('jail')
        if jail not in ACTIONABLE or jail == 'sshd': raise ValueError('Jail manual no autorizado')
        if '/' in value: raise ValueError('El bloqueo manual requiere una IP, no una red')
        request_ip = p.get('requestIp')
        if request_ip and ipaddress.ip_address(value) == ipaddress.ip_address(str(request_ip)):
            raise ValueError('No puedes bloquear la IP de tu sesión actual')
        run(['fail2ban-client', 'set', jail, 'banip', value]); return {'target': value, 'jail': jail}
    if op == 'promote_indefinite':
        source_jail = p.get('sourceJail')
        destination = 'gestionvpn-indefinite'
        if source_jail not in ACTIONABLE or source_jail == destination:
            raise ValueError('Jail de origen no autorizado')
        if '/' in value: raise ValueError('La conversión requiere una IP, no una red')
        request_ip = p.get('requestIp')
        if request_ip and ipaddress.ip_address(value) == ipaddress.ip_address(str(request_ip)):
            raise ValueError('No puedes bloquear la IP de tu sesión actual')
        run(['fail2ban-client', 'set', destination, 'banip', value])
        try:
            run(['fail2ban-client', 'set', source_jail, 'unbanip', value])
        except Exception:
            # Si no se pudo retirar el origen, restablecer el estado previo para
            # no dejar una duplicación silenciosa entre jails.
            try: run(['fail2ban-client', 'set', destination, 'unbanip', value])
            except Exception: pass
            raise
        return {'target': value, 'sourceJail': source_jail, 'jail': destination}
    if op == 'unban':
        jail = p.get('jail')
        if jail not in ACTIONABLE: raise ValueError('Jail no autorizado')
        run(['fail2ban-client', 'set', jail, 'unbanip', value]); return {'target': value, 'jail': jail}
    values = trusted_values()
    if op == 'trust_add':
        if value not in values: values.append(value); write_trusted(values)
    elif op == 'trust_remove':
        values = [x for x in values if x != value]; write_trusted(values)
    else: raise ValueError('Operación no permitida')
    return {'target': value, 'trusted': values}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass
    def send_json(self, status, data):
        raw = json.dumps(data).encode(); self.send_response(status); self.send_header('content-type','application/json')
        self.send_header('content-length', str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):
        try:
            if self.path != '/v1/action': return self.send_json(404, {'ok':False,'error':'not found'})
            length = int(self.headers.get('content-length','0')); raw = self.rfile.read(length)
            ts = self.headers.get('x-security-timestamp',''); nonce = self.headers.get('x-security-nonce','')
            sig = self.headers.get('x-security-signature',''); now = int(time.time()*1000)
            if not ts.isdigit() or abs(now-int(ts)) > 30000 or not nonce or nonce in NONCES: raise PermissionError('firma expirada')
            expected = hmac.new(SECRET.encode(), ts.encode()+b'.'+nonce.encode()+b'.'+raw, hashlib.sha256).hexdigest()
            if not SECRET or not hmac.compare_digest(sig, expected): raise PermissionError('firma inválida')
            NONCES[nonce] = now
            for key, seen in list(NONCES.items()):
                if now-seen > 60000: NONCES.pop(key, None)
            body=json.loads(raw); result=execute(body.get('operation'), body.get('params') or {})
            self.send_json(200, {'ok':True,'result':result})
        except PermissionError as e: self.send_json(401, {'ok':False,'code':'UNAUTHORIZED','error':str(e)})
        except (ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            self.send_json(400, {'ok':False,'code':'INVALID_OPERATION','error':str(e)[:500]})
        except Exception as e: self.send_json(500, {'ok':False,'code':'AGENT_ERROR','error':str(e)[:500]})

if __name__ == '__main__':
    if len(SECRET) < 32: raise SystemExit('SECURITY_AGENT_SECRET debe tener al menos 32 caracteres')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
