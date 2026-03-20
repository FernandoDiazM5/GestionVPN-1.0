const express = require('express');
const cors = require('cors');
const apiRoutes   = require('./api.routes');
const apRoutes    = require('./ap.routes');
const { initDb }  = require('./db.service');

const app = express();
const PORT = process.env.PORT || 3001;

// Mantén este guard para evitar crashes por bugs internos de la librería node-routeros
process.on('uncaughtException', (err) => {
    if (typeof err?.errno === 'string') {
        console.error('[WARN] Respuesta inesperada de RouterOS (no fatal):', err.message);
        return;
    }
    throw err;
});

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

app.use('/api', apiRoutes);
app.use('/api/ap-monitor', apRoutes);

// Inicializar Base de Datos y levantar servidor
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`\n==============================================`);
        console.log(`  Servidor Backend MikroTik API Proxy`);
        console.log(`  http://localhost:${PORT}`);
        console.log(`  SQLite integrado y en funcionamiento`);
        console.log(`==============================================\n`);
    });
});
