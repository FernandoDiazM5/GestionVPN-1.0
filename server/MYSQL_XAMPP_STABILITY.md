# 🔧 MySQL Estable en XAMPP — Guía de configuración

> Cómo evitar que mysqld se bloquee/crashee en desarrollo local.

## Problema
XAMPP's MySQL suele ser inestable en Windows porque:
- No ejecuta como servicio del SO (solo mientras XAMPP está abierto)
- Configurable (my.ini) pero con valores por defecto débiles para desarrollo
- Sin tolerancia a desconexiones del cliente

## Solución integral (3 pasos)

### 1. Configurar MySQL en XAMPP (my.ini)

Abre XAMPP Control Panel → **Config** (botón al lado de MySQL) → **my.ini**

Busca la sección `[mysqld]` y agrega/modifica:

```ini
[mysqld]
# Tamaño de buffer (menos presión de memoria)
innodb_buffer_pool_size = 128M
max_connections = 100
max_allowed_packet = 256M

# Timeouts (evita desconexiones por inactividad)
wait_timeout = 28800          # 8 horas
interactive_timeout = 28800

# Logging (útil para diagnosticar problemas)
log_error = mysql_error.log
general_log = 0               # cambiar a 1 si necesitas debug

# InnoDB estable
innodb_flush_log_at_trx_commit = 1
innodb_log_file_size = 12M
```

**Guarda** y reinicia MySQL en XAMPP.

---

### 2. Backend: Health checks automáticos ✅

**Ya implementado en `server/db/mysql.js`:**
- Pool con `enableKeepAlive: true`
- `startMonitor(10000)` → verifica salud cada 10 segundos
- Reconexión automática si detecta caída

Esto se activa automáticamente al ejecutar `npm run dev`.

**No requiere cambios adicionales.**

---

### 3. Arranque correcto del backend

```bash
cd server
npm run dev
```

**Esperado:**
```
[MONITOR] Health check de MySQL cada 10000ms
Servidor Backend MikroTik API Proxy
http://localhost:3001
MySQL listo
```

Si ves `[MONITOR] MySQL perdió conexión`:
1. Verifica que XAMPP MySQL siga corriendo
2. El backend reintentará automáticamente
3. Si persiste, reinicia MySQL en XAMPP

---

## Síntomas y soluciones rápidas

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `ECONNREFUSED` al iniciar | MySQL no está arriba | Abre XAMPP → Start MySQL |
| Backend se desconecta tras 5 min de inactividad | Timeout TCP | Aplicar paso 1 (my.ini) |
| `ER_GET_CONNECTION_TIMEOUT` al hacer queries | Pool agotado | Aumentar `max_connections` en my.ini |
| MySQL desaparece de repente | Crash silencioso | Ver `mysql_error.log` en XAMPP/mysql/data/ |

---

## Alternativa: Docker (recomendado para producción)

Si estos problemas persisten, considera **Docker**:

```bash
docker run -d \
  --name mysql-vpn \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=vpn_manager \
  -p 3306:3306 \
  mysql:8.0
```

Luego:
```bash
# Backend lee del contenedor
MYSQL_HOST=localhost npm run dev
```

**Ventajas:**
- MySQL es un servicio real
- Aislado del SO
- Reinicio automático si cae

---

## Comandos útiles

```bash
# Ver error log de MySQL en XAMPP
tail -f "C:\xampp\mysql\data\mysql_error.log"

# Probar conexión desde CLI
mysql -h 127.0.0.1 -u root vpn_manager

# Reiniciar MySQL sin XAMPP
# (en PowerShell como Admin)
& 'C:\xampp\mysql\bin\mysqld.exe' --install MySQL80
Start-Service MySQL80
```

---

## Monitoreo en tiempo real

Abre otra terminal:

```bash
# Ver logs del backend (ve los health checks)
npm run dev 2>&1 | findstr /i "MONITOR"

# O usa health endpoint
curl http://localhost:3001/api/health/db
```

Si ves:
- `"status":"online"` → ✅ MySQL está sano
- Timeout → ❌ MySQL no responde

---

**Última actualización:** 2026-06-06
