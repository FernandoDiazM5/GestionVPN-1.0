---
name: project_dual_protocol
description: Soporte dual SSTP/WireGuard en frontend — NodeInfo.service como discriminador, badges de protocolo, campos WG opcionales, convención de colores violet=WG/sky=SSTP
type: project
---

## NodeInfo — campo `service` como discriminador canónico (implementado 2026-03-29)

`service: 'sstp' | 'wireguard'` es el discriminador de protocolo. El campo `protocol?: 'sstp' | 'wireguard'` fue eliminado.

Campos WG adicionales (opcionales, presentes solo si `service === 'wireguard'`):
- `wg_public_key?: string`
- `wg_listen_port?: number`
- `wg_last_handshake_secs?: number | null` — null = nunca hizo handshake
- `wg_allowed_ips?: string`

**Why:** El backend devuelve `service` con el tipo de protocolo. Tener dos campos (`service` genérico + `protocol` opcional) causaba ambigüedad. Se consolidó en `service` tipado.

**How to apply:** Siempre leer `node.service` para distinguir el protocolo, nunca `node.protocol` (eliminado).

## Convención de colores de protocolo

- WireGuard: `violet-*` (bg-violet-100, text-violet-700, border-violet-200, bg-violet-50)
- SSTP: `sky-*` (bg-sky-100, text-sky-700, border-sky-200, bg-sky-50)
- Nodos/túneles en general: `indigo-*`

## Badge de protocolo en NodeCard (linea ~339)

```tsx
{node.service === 'wireguard'
  ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 leading-none shrink-0" title="WireGuard">WG</span>
  : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 leading-none shrink-0" title="SSTP">SSTP</span>
}
```

## Tooltip de estado WireGuard en NodeCard

Cuando `!running && !disabled && service === 'wireguard'` el tooltip dice "Sin handshake WireGuard reciente" en lugar de "Torre no conectada al VPN".

## NodeProvisionForm — toggle buttons de protocolo

`<select>` reemplazado por dos `<button type="button">` con colores activo/inactivo:
- SSTP activo: `bg-sky-50 border-sky-400 text-sky-700`
- WG activo: `bg-violet-50 border-violet-400 text-violet-700`
- Inactivo: `bg-white border-slate-200 text-slate-400 hover:border-slate-300`

Campo CPE: `<textarea>` (no `<input>`) con `rows={2}` y nota "/interface/wireguard/print".

Post-provisión WG: bloque `bg-violet-50 border-violet-200` con `serverPublicKey` + `wgPort`.

## NodeCard — Botón "Agregar clave CPE" para nodos WireGuard sin peer (implementado 2026-03-29)

Condición de visibilidad: `node.service === 'wireguard' && !node.wg_public_key`

Posición en la barra de acciones: entre el botón Wrench (Reparar) y el botón SSH (KeyRound amber). Ambos botones usan el mismo ícono `KeyRound` diferenciados solo por color (violet=CPE, amber=SSH).

Estado de formulario: `showWgPeerForm`, `wgPeerKey`, `isSettingPeer`.

Función: `handleSetWgPeer` — usa `apiFetch` (no `fetchWithTimeout`) al endpoint `POST /api/node/wg/set-peer` con `{ pppUser, cpePublicKey }`. Respuesta tipada inline: `{ success?, message?, peerIP? }`.

El mini-formulario se renderiza como `<tr>` con `colSpan={7}`, igual que los paneles de logs y SSH. Va entre el `<tr>` de logs y el `<tr>` de SSH.

Al éxito: cierra formulario, limpia input, muestra log por 3s. Patrón `setTimeout(() => setLogs([]), 3000)` consistente con `handleRepair`.
