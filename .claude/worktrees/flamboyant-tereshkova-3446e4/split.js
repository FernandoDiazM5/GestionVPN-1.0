const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'server', 'api.routes.js');
const routesDir = path.join(__dirname, 'server', 'routes');
if (!fs.existsSync(routesDir)) fs.mkdirSync(routesDir);

const content = fs.readFileSync(srcPath, 'utf8');

const routeNames = [
    '/connect', '/diagnose', '/secrets', '/active', 
    '/interface/activate', '/interface/deactivate', '/nodes', 
    '/tunnel/activate', '/tunnel/deactivate', '/tunnel/keepalive',
    '/node/next', '/node/provision', '/node/deprovision', '/node/details', '/node/edit', '/node/script', '/node/label/save',
    '/settings/get', '/settings/save', '/node/scan-stream', '/device/auto-login', '/device/antenna',
    '/wireguard/peers', '/wireguard/peer/add', '/device/wifi/get', '/wireguard/peer/edit', '/wireguard/peer/color/save', '/wireguard/peer/colors',
    '/node/creds/save', '/node/creds/get', '/node/ssh-creds/save', '/node/ssh-creds/get',
    '/db/devices', '/db/devices/:id', '/node/tags', '/node/tag/save', '/node/history/add', '/node/history/get', '/db/cleanup-orphan-devices'
];

// Helper to find the matching closing brace for a block
function findClosingBrace(str, startIdx) {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let i = startIdx; i < str.length; i++) {
        const char = str[i];
        if (!inString) {
            if (char === "'" || char === '"' || char === '`') {
                inString = true;
                stringChar = char;
            } else if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0) return i;
            }
        } else {
            if (char === stringChar && str[i - 1] !== '\\') {
                inString = false;
            }
        }
    }
    return -1;
}

const groups = {
    'node': [],
    'device': [],
    'wireguard': [],
    'settings': [],
    'core': [] // /connect, /interface, /tunnel, etc.
};

let remainingContent = content;

// Empezamos buscando cada router.* y guardándolo
const functionBlocks = [];

let regex = /router\.(get|post|put|delete)\(['"]([^'"]+)['"]/g;
let match;
while ((match = regex.exec(content)) !== null) {
    const startIdx = match.index;
    const method = match[1];
    const endpoint = match[2];
    
    // Find where the block opens
    const blockOpen = content.indexOf('{', startIdx);
    const blockClose = findClosingBrace(content, blockOpen);
    
    // Also include trailing `;` or newline
    let endIdx = blockClose + 1;
    if (content[endIdx] === ')') endIdx++;
    if (content[endIdx] === ';') endIdx++;
    
    const blockContent = content.substring(startIdx, endIdx);
    
    // Categorize
    if (endpoint.startsWith('/node/') || endpoint === '/nodes') {
        groups['node'].push(blockContent);
    } else if (endpoint.startsWith('/device/') || endpoint.startsWith('/db/')) {
        groups['device'].push(blockContent);
    } else if (endpoint.startsWith('/wireguard/')) {
        groups['wireguard'].push(blockContent);
    } else if (endpoint.startsWith('/settings/')) {
        groups['settings'].push(blockContent);
    } else {
        groups['core'].push(blockContent);
    }
}

// Generate files
const imports = `const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');
const { connectToMikrotik, safeWrite, getErrorMessage, cleanTunnelRules } = require('../routeros.service');
const { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials } = require('../ubiquiti.service');
const { getDb, encryptDevice, decryptDevice, encryptPass, decryptPass, saveNode, getNodes, deleteNode } = require('../db.service');
`;

for (const group in groups) {
    if (groups[group].length === 0) continue;
    let fileContent = imports + '\n' + groups[group].join('\n\n') + '\n\nmodule.exports = router;\n';
    fs.writeFileSync(path.join(routesDir, `${group}.routes.js`), fileContent);
}

// Actualizar index.js
const indexPaths = path.join(__dirname, 'server', 'index.js');
let indexContent = fs.readFileSync(indexPaths, 'utf8');

indexContent = indexContent.replace(
    "const apiRoutes = require('./api.routes');",
    `const nodeRoutes = require('./routes/node.routes');
const deviceRoutes = require('./routes/device.routes');
const wireguardRoutes = require('./routes/wireguard.routes');
const settingsRoutes = require('./routes/settings.routes');
const coreRoutes = require('./routes/core.routes');`
);

indexContent = indexContent.replace(
    "app.use('/api', authMiddleware.verifyToken, apiRoutes);",
    `app.use('/api', authMiddleware.verifyToken, coreRoutes);
app.use('/api', authMiddleware.verifyToken, nodeRoutes);
app.use('/api', authMiddleware.verifyToken, deviceRoutes);
app.use('/api', authMiddleware.verifyToken, wireguardRoutes);
app.use('/api', authMiddleware.verifyToken, settingsRoutes);`
);

fs.writeFileSync(indexPaths, indexContent);
console.log('Split completado');
