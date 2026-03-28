# Skill: Cascade Delete de Nodos VPN

## Trigger
Usar cuando el usuario elimina un nodo VPN (deprovision), o reporta que datos persisten después de eliminar un nodo.

## Contexto
El sistema tiene 4 capas de persistencia que deben limpiarse al eliminar un nodo:
1. **MikroTik RouterOS** — VRF, PPP secret, rutas, mangle rules
2. **SQLite backend** — nodes, devices, cpes_conocidos, historial_senal
3. **IndexedDB frontend** — VpnContext (vpn_store) + cpeCache (topology_cpes)
4. **React state** — nodes[], devices[] en cada componente

## Relación de IDs (CRÍTICO)
- `NodeInfo.id` = MikroTik `.id` (ej: `*17`) — ID interno del router
- `NodeInfo.ppp_user` = nombre PPP (ej: `ppp-pass-torreX`) — PK en SQLite `nodes`
- `SavedDevice.nodeId` = `node.id` (MikroTik `.id`, NO ppp_user)
- SQLite `nodes.id` = `ppp_user`

Por tanto: `devices.data.nodeId` NO coincide con `nodes.id`. Son dominios distintos.

## Flujo correcto de eliminación

### Backend (server/api.routes.js → POST /node/deprovision)
1. Eliminar recursos de MikroTik (8 pasos)
2. Llamar `deleteNode(pppUser)` que:
   - DELETE FROM nodes WHERE id = pppUser
   - DELETE FROM devices WHERE nodeId pertenecía al nodo (buscar por ppp_user en JSON data)
   - DELETE FROM cpes_conocidos WHERE ap_id en los devices eliminados
   - DELETE FROM historial_senal WHERE ap_id en los devices eliminados

### Frontend (NodeAccessPanel.tsx → onSuccess del EliminarNodoModal)
1. `removeNodeFromState(pppUser)` — limpia VpnContext.nodes + revoca túnel si aplica
2. `deviceDb.cleanupOrphans()` — limpia devices huérfanos en SQLite
3. `cpeCache.removeByNodeId(nodeId)` — limpia cache de topología
4. NO llamar `handleLoadNodes()` — sobreescribe el estado recién limpiado

## Archivos involucrados
- `server/db.service.js` — deleteNode()
- `server/api.routes.js` — /node/deprovision, /db/cleanup-orphan-devices
- `vpn-manager/src/context/VpnContext.tsx` — removeNodeFromState()
- `vpn-manager/src/components/NodeAccessPanel.tsx` — onSuccess del modal
- `vpn-manager/src/store/deviceDb.ts` — cleanupOrphans()
- `vpn-manager/src/store/cpeCache.ts` — cache IndexedDB de CPEs
- `vpn-manager/src/components/ApMonitorModule.tsx` — devices state local
- `vpn-manager/src/components/NetworkDevicesModule.tsx` — savedDevices state + nodesLengthRef
