# Services Directory

Servicios especializados que integran con dispositivos de red.

## Contenido

- **routeros.service.js** - Integración con RouterOS API
- **ubiquiti.service.js** - Integración con Ubiquiti airOS

## ⚠️ JavaScript Puro (No TypeScript)

Estos servicios son `.js` porque:
- Interactúan con librerías no tipadas
- Implementan lógica específica de protocolos
- Son usados principalmente desde backend

## routeros.service.js

Usa librería `node-routeros` para:
- Ejecutar comandos en RouterOS
- Parsear respuestas
- Manejar conexiones persistentes

## ubiquiti.service.js

Usa SSH2 para conectar a Ubiquiti airOS:
- SSH a routers Ubiquiti
- Ejecutar comandos mca-cli
- Parsear outputs de mca-status
- Extraer datos de antenas

## Nota Importante

**Estos servicios se llaman SOLO desde backend.**

El frontend NO importa ni usa estos servicios directamente.
La comunicación es a través de API REST en Express.

## Ubicación Anterior

Estaban en `src/components/` (lugar incorrecto).
Se movieron a `src/utils/services/` para mejor organización.

**Última actualización:** 2026-05-29
