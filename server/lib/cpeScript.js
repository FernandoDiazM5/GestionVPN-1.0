// ============================================================
//  lib/cpeScript.js — generador del script de configuración del CPE (nodo remoto WG)
//
//  Única fuente de verdad del .rsc que se pega en el MikroTik de la torre.
//  La comparten /node/provision (lo devuelve tras crear el nodo) y
//  /node/script (regenerar para nodos existentes).
//
//  Modelo unificado: el CPE tiene UNA sola IP (= IP del nodo), que es a la vez
//  el extremo del túnel WG. Sin /30 de transporte.
//
//  Auto-gen de llaves: si se pasa `cpePrivateKey`, se embebe en la interfaz para
//  que el operador NO tenga que generar ni copiar la llave a mano (mismo modelo
//  que el .conf del usuario). La pública correspondiente vive en el peer del Core.
// ============================================================

const CORE_IFACE = 'WG-CORE-ISP';

/**
 * Construye el script WireGuard del CPE (lista de comandos RouterOS).
 * @param {object} o
 * @param {number|string} o.nodeNum  número de nodo (ND≥2)
 * @param {string} o.nodeMgmt        IP única del nodo (sin /32)
 * @param {string} o.serverPublicKey clave pública del Core (peer del CPE)
 * @param {string} o.serverPublicIP  endpoint WAN del Core
 * @param {number|string} o.wgPort   listen-port del Core para este nodo
 * @param {string[]} o.returnNets    redes de retorno (gestión + scan-pool)
 * @param {string} [o.cpePrivateKey] privada del CPE; si viene, se embebe en la interfaz
 * @returns {{ script: string, cpeSteps: {title:string, cmd:string}[] }}
 */
function buildCpeWgScript({ nodeNum, nodeMgmt, serverPublicKey, serverPublicIP, wgPort, returnNets, cpePrivateKey }) {
  const nets = Array.isArray(returnNets) ? returnNets : [];
  const allowedCsv = nets.join(',');
  const pubKey = serverPublicKey || '<CLAVE_PUBLICA_SERVIDOR>';
  // La privada va entrecomillada; si no hay, la interfaz autogenera una en el CPE
  // (flujo legacy: el operador debe leer la pública del CPE y registrarla a mano).
  const privPart = cpePrivateKey ? `private-key="${cpePrivateKey}" ` : '';

  const ifaceLine = `/interface wireguard add name=${CORE_IFACE} ${privPart}mtu=1420 comment="Conexion al Servidor Core"`;
  const tunnelIpLine = `/ip address add address=${nodeMgmt}/32 interface=${CORE_IFACE} comment="IP del nodo ND${nodeNum} (gestion + tunel)"`;
  const peerLine = `/interface wireguard peers add interface=${CORE_IFACE} public-key="${pubKey}" endpoint-address=${serverPublicIP} endpoint-port=${wgPort} allowed-address=${allowedCsv} persistent-keepalive=25s comment="Conexion al Servidor Core"`;
  const routeCmd = (n) => `/ip route add dst-address=${n} distance=20 gateway=${CORE_IFACE} comment="Retorno hacia Administracion/Software"`;

  const script = [ifaceLine, tunnelIpLine, peerLine, ...nets.map(routeCmd)].join('\n') + '\n';
  const cpeSteps = [
    { title: cpePrivateKey ? 'Crear interfaz WireGuard (llave incluida)' : 'Crear interfaz WireGuard', cmd: ifaceLine },
    { title: 'Asignar IP única del nodo (/32)', cmd: tunnelIpLine },
    { title: 'Agregar peer (servidor Core)', cmd: peerLine },
    ...nets.map(n => ({ title: `Ruta de retorno (${n})`, cmd: routeCmd(n) })),
  ];
  return { script, cpeSteps };
}

/**
 * Construye el script del CPE para SSTP (cliente sstp-out1, idempotente).
 * Autoconfigurable: usuario + contraseña embebidos (no requiere rutas de
 * retorno — RouterOS las arma dinámicamente con la remote-address del PPP).
 * @param {object} o
 * @param {string} o.pppUser
 * @param {string} o.pppPassword
 * @param {string} o.serverPublicIP  endpoint WAN del Core
 * @returns {{ script: string, cpeSteps: {title:string, cmd:string}[] }}
 */
function buildCpeSstpScript({ pppUser, pppPassword, serverPublicIP }) {
  const addLine = `add authentication=mschap2 connect-to=${serverPublicIP} disabled=no http-proxy=0.0.0.0 name=sstp-out1 profile=default-encryption tls-version=only-1.2 user=${pppUser} password=${pppPassword}`;
  const setLine = `set [find name=sstp-out1] connect-to=${serverPublicIP} disabled=no user=${pppUser} password=${pppPassword}`;
  const block = `/interface sstp-client\n:if ([find name=sstp-out1] = "") do={\n  ${addLine}\n} else={\n  ${setLine}\n}`;
  return { script: block, cpeSteps: [{ title: 'Configurar Cliente SSTP', cmd: block }] };
}

module.exports = { buildCpeWgScript, buildCpeSstpScript, CORE_IFACE };
