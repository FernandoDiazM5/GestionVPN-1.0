const express = require('express');
const cors    = require('cors');
const apiRoutes = require('./api.routes');
const apRoutes  = require('./ap.routes');
const { initDb } = require('./db.service');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Guard global: errores asincrónicos de node-routeros ──────────────────────
const SAFE_CODES = new Set([
    'ECONNREFUSED','ETIMEDOUT','ECONNRESET','EPIPE',
    'ENOTFOUND','EHOSTUNREACH','ENETUNREACH','EADDRINUSE',
]);
process.on('uncaughtException', (err) => {
    if (SAFE_CODES.has(err?.code) || typeof err?.errno === 'string' || typeof err?.errno === 'number') {
        console.error('[WARN] Error red/RouterOS (no fatal):', err.code || err.errno, '-', err.message);
        return;
    }
    console.error('[FATAL]', err.message);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('[WARN] Promesa rechazada:', reason?.code || reason?.errno, '-', reason?.message || String(reason));
});

app.use(cors({
    origin: ['http://localhost:5173','http://localhost:5174','http://localhost:4173','http://127.0.0.1:5173','http://127.0.0.1:5174'],
    methods: ['GET','POST','PUT','DELETE'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/api/ap-monitor', apRoutes);

// ── Inicia el servidor con reintentos si el puerto sigue ocupado ─────────────
function startServer(attempt = 1) {
    const maxAttempts = 10;
    const delay = 2000; // 2s entre intentos — suficiente para Windows TIME_WAIT

    const server = app.listen(PORT, () => {
        server.keepAliveTimeout = 2000;  // cierra keep-alive en 2s → evita FinWait2 al reiniciar
        server.headersTimeout    = 3000;
        console.log(`\n==============================================`);
        console.log(`  Servidor Backend MikroTik API Proxy`);
        console.log(`  http://localhost:${PORT}`);
        console.log(`  SQLite listo | Intento ${attempt}`);
        console.log(`==============================================\n`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            if (attempt < maxAttempts) {
                console.warn(`[WARN] Puerto ${PORT} ocupado (intento ${attempt}/${maxAttempts}), reintentando en ${delay}ms...`);
                setTimeout(() => startServer(attempt + 1), delay);
            } else {
                console.error(`[FATAL] Puerto ${PORT} sigue ocupado tras ${maxAttempts} intentos.`);
                process.exit(1);
            }
        } else {
            console.error('[FATAL] Error al escuchar:', err.message);
            process.exit(1);
        }
    });
}

initDb()
    .then(() => startServer())
    .catch(err => {
        console.error('[FATAL] Error inicializando DB:', err.message);
        process.exit(1);
    });
