const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'server', 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.routes.js'));

for (const file of files) {
    const fPath = path.join(routesDir, file);
    let content = fs.readFileSync(fPath, 'utf8');
    
    // Replace const { ip, user, pass } = req.body;
    content = content.replace(/const\s+\{\s*ip,\s*user,\s*pass\s*\}\s*=\s*req\.body;/g, 
        `if (!req.mikrotik) return res.status(500).json({ success: false, message: 'Core MikroTik no configurado en el Servidor (Settings)' });\n    const { ip, user, pass } = req.mikrotik;`);
    
    // Also fix cases where there are other properties like nodeNumber etc.
    // Example: const { ip, user, pass, nodeNumber ...
    content = content.replace(/const\s+\{\s*ip,\s*user,\s*pass,\s*(.*?)\s*\}\s*=\s*req\.body;/g, 
        `if (!req.mikrotik) return res.status(500).json({ success: false, message: 'Core MikroTik no configurado en el Servidor' });\n    const { ip, user, pass } = req.mikrotik;\n    const { $1 } = req.body;`);
    
    fs.writeFileSync(fPath, content);
}

console.log('Routes middleware variables replaced!');
