try { require('dotenv').config(); } catch (_) { /* opcional */ }
const express = require('express');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
const healthRoutes = require('./routes/health.routes');
const accountRoutes = require('./routes/account.routes');
const teamRoutes = require('./routes/team.routes');
const auditRoutes = require('./routes/audit.routes');
const eventsRoutes = require('./routes/events.routes');
const adminRoutes = require('./routes/admin.routes');
const { errorMiddleware } = require('./lib/apiResponse');
const coreRoutes = require('./routes/core.routes');
const nodeRoutes = require('./routes/node.routes');
const deviceRoutes = require('./routes/device.routes');
const wireguardRoutes = require('./routes/wireguard.routes');
const settingsRoutes = require('./routes/settings.routes');
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
    console.error('[FATAL]', err);
    // process.exit(1); // Mantenemos vivo el server ante excepciones no reconocidas
});
process.on('unhandledRejection', (reason) => {
    console.error('[WARN] Promesa rechazada:', reason?.code || reason?.errno, '-', reason?.message || String(reason));
});

// Orígenes permitidos: variables de entorno (Docker) o valores por defecto (dev local)
const defaultOrigins = ['http://localhost:5173','http://localhost:5174','http://localhost:4173',
                        'http://127.0.0.1:5173','http://127.0.0.1:5174','http://localhost:8080','http://127.0.0.1:8080',
                        'http://134.199.212.232:8080'];
const allowedOrigins = process.env.CORS_ORIGINS
    ? [...new Set([...process.env.CORS_ORIGINS.split(',').map(s => s.trim()), ...defaultOrigins])]
    : defaultOrigins;

const authRoutes = require('./auth.routes');
const { verifyToken } = require('./auth.middleware');

app.use(cors({
    origin: (origin, callback) => {
        // Permitir requests sin origin (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn(`[CORS] Origen bloqueado: ${origin}`);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET','POST','PUT','PATCH','DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Montar rutas públicas e integradas
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);   // Fase 2: auth multi-usuario (cookies)
app.use('/api/team', teamRoutes);          // Fase 3: invitaciones y roles (RBAC)
app.use('/api/audit', auditRoutes);        // Fase 3: auditoría de túneles
app.use('/api/events', eventsRoutes);      // Fase 4: SSE tiempo real (por workspace)
app.use('/api/admin', adminRoutes);        // Roles v2: Administrador de plataforma

// Omitir apiRoutes legado que ya fue borrado, registrar los modulares protegidos
app.use('/api', verifyToken, coreRoutes);
app.use('/api', verifyToken, nodeRoutes);
app.use('/api', verifyToken, deviceRoutes);
app.use('/api', verifyToken, wireguardRoutes);
app.use('/api', verifyToken, settingsRoutes);
app.use('/api/ap-monitor', verifyToken, apRoutes);

// ── Middleware de error central (estandariza respuestas) ─────────────────────
app.use(errorMiddleware);

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
        console.log(`  MySQL listo | Intento ${attempt}`);
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

// Inicializa la BD con reintentos: si MySQL/XAMPP aún no está arriba, espera y
// reintenta en vez de morir con un [FATAL] críptico.
async function bootstrap() {
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await initDb();
            return startServer();
        } catch (err) {
            const msg = err.code || err.message || '';
            const isConn = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|PROTOCOL_CONNECTION_LOST|ER_GET_CONNECTION_TIMEOUT/i.test(msg);
            if (isConn && attempt < maxAttempts) {
                console.warn(`[WARN] MySQL no disponible (intento ${attempt}/${maxAttempts}). ¿Está MySQL/XAMPP iniciado? Reintentando en 3s...`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            console.error('[FATAL] No se pudo inicializar la base de datos:', err.message);
            if (isConn) console.error('       → Inicia MySQL en XAMPP y vuelve a ejecutar el backend.');
            process.exit(1);
        }
    }
}
bootstrap();
