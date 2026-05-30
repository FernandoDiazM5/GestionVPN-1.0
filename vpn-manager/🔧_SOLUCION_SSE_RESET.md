# 🔧 Solución: ERR_CONNECTION_RESET en SSE

**Problema Identificado**: ✅ ENCONTRADO  
**Causa Raíz**: Node.js watch reiniciando servidor en cada cambio de BD  
**Severidad**: Alta (rompe SSE streaming)

---

## 🎯 El Problema

### Síntomas
```
GET /api/tunnel/events → net::ERR_CONNECTION_RESET 200 (OK)
POST /api/node/scan-stream → net::ERR_CONNECTION_RESET 200 (OK)
```

### Causa Raíz
```
1. Backend corre con: node --watch index.js
2. Operación en base de datos actualiza: database.sqlite
3. Node.js watcher detecta cambio en .sqlite, .sqlite-wal, .sqlite-shm
4. Node.js REINICIA TODO el servidor
5. Conexiones SSE se cortan → ERR_CONNECTION_RESET
6. Frontend recibe error 200 pero sin datos
```

### Cadena de Eventos
```
Frontend envía: GET /api/tunnel/events
     ↓
Backend abre stream SSE
     ↓
Frontend actualiza BD (activar túnel, etc)
     ↓
SQLite cambia archivo database.sqlite
     ↓
Node.js watch DETECTA CAMBIO
     ↓
Node.js REINICIA TODO el server
     ↓
Conexión SSE se CORTA abruptamente
     ↓
Frontend recibe: ERR_CONNECTION_RESET
```

---

## ✅ Soluciones

### Solución 1: RECOMENDADA - Excluir BD del Watch

**Archivo**: `server/package.json`

```json
{
  "scripts": {
    "start": "node --watch --watch-preserve-output --exclude='**/*.sqlite*' index.js",
    "dev": "NODE_ENV=development node --watch --watch-preserve-output --exclude='**/*.sqlite*' index.js"
  }
}
```

**Qué hace**:
- `--exclude='**/*.sqlite*'` → Ignora archivos SQLite
- Evita reinicio al cambiar la BD
- Las conexiones SSE siguen activas

**Resultado**: ✅ SSE funciona correctamente

---

### Solución 2: Mover Base de Datos

**Ubicación actual** (MALO):
```
server/
├── index.js
├── database.sqlite     ← En la carpeta del código
├── database.sqlite-wal
└── ...
```

**Nueva ubicación** (BUENO):
```
server/
├── index.js
├── src/
│   ├── routes/
│   ├── services/
│   └── ...
└── data/                ← Nueva carpeta para BD
    ├── database.sqlite
    ├── database.sqlite-wal
    └── database.sqlite-shm
```

**Implementación**:
1. Crear carpeta `server/data/`
2. Mover `database.sqlite*` a `data/`
3. Actualizar ruta en código:

```javascript
// server/src/db.js (o donde cargues la BD)

// ANTES
const DB_PATH = './database.sqlite';

// DESPUÉS
const DB_PATH = './data/database.sqlite';

// O con path absoluto
const DB_PATH = path.join(__dirname, '../data/database.sqlite');
```

4. Agregar al `.watchignore` o `.gitignore`:
```
# server/.gitignore
data/
database.sqlite*
```

**Resultado**: ✅ BD en carpeta separada, no reinicia watch

---

### Solución 3: Usar Nodemon en lugar de node --watch

**Instalación**:
```bash
cd server
npm install -D nodemon
```

**Archivo**: `server/nodemon.json`
```json
{
  "watch": ["src"],
  "ignore": ["*.sqlite*", "data/", "node_modules/"],
  "ext": "js,json",
  "env": {
    "NODE_ENV": "development"
  }
}
```

**Archivo**: `server/package.json`
```json
{
  "scripts": {
    "start": "nodemon index.js",
    "dev": "NODE_ENV=development nodemon index.js"
  }
}
```

**Resultado**: ✅ Control fino sobre qué archivos triggerean reload

---

### Solución 4: Sin Watch (Más Simple)

**Archivo**: `server/package.json`
```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "NODE_ENV=development node index.js"
  }
}
```

**Flujo de desarrollo**:
```bash
npm run dev
# Editas código
# Paras con Ctrl+C
# Vuelves a ejecutar npm run dev
```

**Ventaja**: Simple, predecible  
**Desventaja**: Más manual (tienes que parar/iniciar)

---

## 🎬 Implementación Recomendada (Solución 1)

### Paso 1: Actualizar package.json

```bash
cd server
```

**Edita** `server/package.json`:
```json
{
  "name": "vpn-manager-api",
  "version": "1.0.0",
  "scripts": {
    "start": "node --watch --watch-preserve-output --exclude='**/*.sqlite*' index.js",
    "dev": "NODE_ENV=development node --watch --watch-preserve-output --exclude='**/*.sqlite*' index.js",
    "prod": "NODE_ENV=production node index.js"
  },
  ...
}
```

### Paso 2: Reiniciar el servidor

```bash
# Matar proceso actual (Ctrl+C en la terminal)
# Luego reiniciar
npm run dev
```

### Paso 3: Verificar que funciona

```bash
# En otra terminal, haz una prueba
curl http://localhost:3001/api/health

# En el navegador
http://localhost:5173
# Intenta activar un túnel
# Debería funcionar SIN errores ERR_CONNECTION_RESET
```

---

## 🧪 Verificación

### Antes (Con el problema)
```
npm run dev
# Backend corriendo con watch
GET /api/tunnel/events
# Alguna operación que escribe en BD
# ❌ ERR_CONNECTION_RESET 200 (OK)
# ❌ Stream se corta
# ❌ Conexión reset abruptamente
```

### Después (Con la solución)
```
npm run dev
# Backend corriendo con watch PERO excluye *.sqlite*
GET /api/tunnel/events
# Alguna operación que escribe en BD
# ✅ Stream sigue activo
# ✅ Datos se transmiten correctamente
# ✅ Sin reinicio del servidor
```

---

## 📋 Checklist de Implementación

- [ ] Actualizar `server/package.json` con `--exclude='**/*.sqlite*'`
- [ ] Reiniciar servidor (`npm run dev`)
- [ ] Probar conexión SSE
- [ ] Verificar que scan-stream funciona
- [ ] Verificar que tunnel events funciona
- [ ] Probar activación de túnel
- [ ] Revisar logs del servidor (no debe haber reinicio)

---

## 🎯 Resultado Final

**Con la solución implementada**:

✅ SSE streams mantienen conexión activa  
✅ No hay reinicio del servidor durante operaciones BD  
✅ Escaneo de nodos funciona  
✅ Eventos de túnel se transmiten en tiempo real  
✅ Frontend recibe datos correctamente  
✅ Desarrollador aún tiene reload automático para código  

---

## 📚 Referencias

- **Node.js watch**: `node --watch --help`
- **SQLite files**: `.sqlite`, `.sqlite-wal`, `.sqlite-shm`
- **SSE (Server-Sent Events)**: Requiere conexión persistente
- **Nodemon**: Alternativa más configurable a `node --watch`

---

## 🚀 Próximos Pasos

1. Implementar la solución 1 (Excluir *.sqlite*)
2. Reiniciar servidor
3. Verificar que SSE funciona
4. Prueba completa del flujo "activar túnel"
5. Confirmar que no hay conexión reset

