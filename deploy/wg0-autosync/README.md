# wg0-autosync — sincronización event-driven del `wg0` del VPS

Cuando se provisiona una torre, su LAN debe estar en el `AllowedIPs` del `wg0`
del VPS para poder escanearla (handoff **§4.27**). Esto lo automatiza, **sin dar
privilegios al backend** (modelo *hardened*).

## Cómo funciona

```
Provisión de nodo (backend, contenedor no-root)
   └─ escribe la LAN en  /wg0sync/allowedips.desired   (bind-mount → host)
        └─ systemd .path (host, root) detecta el cambio
             └─ wg0-autosync.service ejecuta wg0-autosync.sh
                  └─ añade la LAN al wg0.conf (si falta) + `wg syncconf`  ← sin cortar el túnel
```

- El **backend** solo escribe un archivo de texto (CIDR por línea). No toca el
  `wg0`, no necesita `NET_ADMIN`, `root`, ni ver la clave privada del túnel.
- El **host** (root) es quien aplica. La **guarda de idempotencia** vive en los
  dos lados: el backend solo escribe si la LAN es nueva; el script solo recarga
  si falta algo en el `wg0`.

## Instalación (una sola vez, en el VPS como root)

```bash
# 1) Directorio compartido (bind-mount). El backend corre como uid 1001.
install -d -o 1001 -g 1001 /opt/wg0-autosync

# 2) Script reconciliador (root) + unidades systemd
install -m 0755 deploy/wg0-autosync/wg0-autosync.sh      /usr/local/sbin/wg0-autosync.sh
install -m 0644 deploy/wg0-autosync/wg0-autosync.service /etc/systemd/system/
install -m 0644 deploy/wg0-autosync/wg0-autosync.path    /etc/systemd/system/
install -m 0644 deploy/wg0-autosync/wg0-autosync.timer   /etc/systemd/system/

# 3) Activar el watcher (+ la red de seguridad periódica, opcional)
systemctl daemon-reload
systemctl enable --now wg0-autosync.path
systemctl enable --now wg0-autosync.timer    # opcional pero recomendado

# 4) Asegúrate de que wireguard-tools está en el host (wg, wg-quick)
apt-get install -y wireguard-tools
```

El bind-mount lo añade `docker-compose.prod.yml` al servicio `backend`:

```yaml
    volumes:
      - backend-data:/data
      - /opt/wg0-autosync:/wg0sync     # ← intención del wg0 (host ⇄ contenedor)
```

…y se aplica en el próximo `docker compose -f docker-compose.prod.yml up -d`.

## Verificación

```bash
# Provisiona una torre desde el panel, luego:
cat /opt/wg0-autosync/allowedips.desired      # debe listar la LAN nueva
journalctl -u wg0-autosync.service -n 20      # "AllowedIPs actualizado … wg syncconf"
grep AllowedIPs /etc/wireguard/wg0.conf       # la LAN nueva ya está
ip route get <ip-de-la-LAN>                   # debe decir  dev wg0
```

Forzar una reconciliación manual (sin esperar al evento):

```bash
systemctl start wg0-autosync.service
# o el reconciliador directo:
WG0_INTENT=/opt/wg0-autosync/allowedips.desired /usr/local/sbin/wg0-autosync.sh
```

## Notas

- **Solo añade, nunca borra.** Quitar una LAN del `wg0` al de-provisionar es
  deliberadamente manual (varias torres comparten LAN — análogo a §13). Para
  depurar entradas viejas, edita el `allowedips.desired` y el `wg0.conf` a mano.
- **Toggle:** `WG0_AUTOSYNC=false` en `server/.env.production` desactiva la
  escritura de intención en el backend.
- **Reinicio:** el `wg0.conf` queda persistido en disco, así que el `AllowedIPs`
  sobrevive a reboots (con `wg-quick@wg0` habilitado).
