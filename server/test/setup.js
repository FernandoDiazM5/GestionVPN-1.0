// ============================================================
//  test/setup.js — setup global de Vitest (backend)
//
//  • Forzar NODE_ENV=test para que el logger pino vaya a nivel 'silent'
//    y no inunde la salida del runner con líneas de info.
//  • Variables de entorno mínimas para que módulos que validan env
//    no aborten al cargarse en el banco de pruebas.
// ============================================================
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

// MySQL: valores neutros — los tests que necesiten BD deben mockear el módulo
// db/mysql.js. Si llegan a importarlo directamente, no se conectarán a nada.
process.env.MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
process.env.MYSQL_PORT = process.env.MYSQL_PORT || '3306';
process.env.MYSQL_USER = process.env.MYSQL_USER || 'test';
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'test_vpn_manager';

// JWT secret efímero (no usar el real). Coincide con lo que pide auth.middleware.
process.env.JWT_SECRET_TEST = 'test_only_jwt_secret_do_not_use_in_prod';
