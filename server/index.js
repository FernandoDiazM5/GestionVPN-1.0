try { require('dotenv').config(); } catch (_) { /* opcional */ }
const express = require('express');
const cors    = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const logger = require('./lib/logger');
const healthRoutes = require('./routes/health.routes');
const accountRoutes = require('./routes/account.routes');
const teamRoutes = require('./routes/team.routes');
const auditRoutes = require('./routes/audit.routes');
const eventsRoutes = require('./routes/events.routes');
const adminRoutes = require('./routes/admin.routes');
const workspaceRoutes = require('./routes/workspace.routes');
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
        logger.warn({ err, code: err.code || err.errno }, 'Error red/RouterOS (no fatal)');
        return;
    }
    logger.fatal({ err }, 'uncaughtException');
    // process.exit(1); // Mantenemos vivo el server ante excepciones no reconocidas
});
process.on('unhandledRejection', (reason) => {
    logger.warn({ err: reason }, 'unhandledRejection');
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
const { startMonitor } = require('./db/mysql');

app.use(cors({
    origin: (origin, callback) => {
        // Permitir requests sin origin (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        logger.warn({ origin, scope: 'cors' }, 'Origen bloqueado');
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET','POST','PUT','PATCH','DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ── HTTP logger (pino-http) ────────────────────────────────────────
//  • Asigna reqId UUID a cada request, propagado a todos los logs de la
//    request via req.log (acceso desde rutas).
//  • Niveles: 2xx/3xx → info · 4xx → warn · 5xx → error.
//  • Silencia /api/health (mucho ruido del polling MySQL).
//  • Headers Authorization/Cookie ya están redactados en lib/logger.js.
app.use(pinoHttp({
    logger,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} → ${res.statusCode} (${err?.message || 'err'})`,
    autoLogging: {
        ignore: (req) => req.url?.startsWith('/api/health'),
    },
    serializers: {
        req: (req) => ({ method: req.method, url: req.url, id: req.id }),
        res: (res) => ({ statusCode: res.statusCode }),
    },
}));

// Montar rutas públicas e integradas
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);   // Fase 2: auth multi-usuario (cookies)
app.use('/api/team', teamRoutes);          // Fase 3: invitaciones y roles (RBAC)
app.use('/api/audit', auditRoutes);        // Fase 3: auditoría de túneles
app.use('/api/events', eventsRoutes);      // Fase 4: SSE tiempo real (por workspace)
app.use('/api/admin', adminRoutes);        // Roles v2: Administrador de plataforma
app.use('/api/workspace', workspaceRoutes); // Fase C: ajustes + import/export del workspace

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
        logger.info({ port: PORT, attempt }, 'Servidor backend MikroTik API Proxy escuchando');
        // Inicia monitoreo de salud de MySQL cada 10 segundos
        startMonitor(10000);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            if (attempt < maxAttempts) {
                logger.warn({ port: PORT, attempt, maxAttempts, delay }, 'Puerto ocupado, reintentando');
                setTimeout(() => startServer(attempt + 1), delay);
            } else {
                logger.fatal({ port: PORT, maxAttempts }, 'Puerto sigue ocupado tras todos los intentos');
                process.exit(1);
            }
        } else {
            logger.fatal({ err }, 'Error al escuchar puerto');
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
                logger.warn({ attempt, maxAttempts, code: err.code }, 'MySQL no disponible, reintentando en 3s. ¿Está XAMPP arriba?');
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            logger.fatal({ err, hint: isConn ? 'Inicia MySQL en XAMPP y relanza' : undefined }, 'No se pudo inicializar la base de datos');
            process.exit(1);
        }
    }
}
bootstrap();
