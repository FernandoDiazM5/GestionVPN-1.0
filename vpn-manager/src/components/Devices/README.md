# Devices Components

Escaneo y descubrimiento de dispositivos de red.

## Contenido

- **NetworkDevicesModule.tsx** (750+ líneas) - Módulo principal de scan y tabla
- **ScannerModule.tsx** (244 líneas) - Control de escaneo
- **NodeAccessPanel.tsx** (componente) - Panel de acceso a nodos

## Flujo de Scan

1. Usuario click botón "Escanear" en ScannerModule
2. POST /api/device/scan
3. Monitorear progreso en tiempo real
4. Resultados guardados en deviceDb.ts (IndexedDB)
5. NetworkDevicesModule renderiza tabla de dispositivos
6. Usuario puede filtrar/buscar dispositivos
7. Ejecutar acciones masivas (agregar, eliminar)

## Responsabilidades

- Descubrir dispositivos en red MikroTik
- Mostrar progreso de escaneo
- Renderizar tabla con resultados
- Permitir filtrado y búsqueda
- Cachear resultados en IndexedDB
- Integración con topología (si aplica)

## APIs Utilizadas

- `POST /api/device/scan` - Iniciar escaneo
- `GET /api/device/list` - Listar dispositivos
- `POST /api/device/import` - Importar dispositivo
- `DELETE /api/device/{id}` - Eliminar dispositivo

**Última actualización:** 2026-05-29
