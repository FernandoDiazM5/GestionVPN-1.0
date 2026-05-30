# Monitor Components

Monitoreo en tiempo real de Access Points (APs).

## Contenido

- **ApMonitorModule.tsx** (650+ líneas) - Dashboard de monitoreo AP

## Características

- Polling automático cada 5-30 segundos
- Métricas en vivo:
  - Señal (dBm)
  - Traffic (Mbps tx/rx)
  - CCQ (Current Channel Quality %)
  - Uptime
  - Estaciones conectadas

- Gráficos de tendencias
- Listado de estaciones conectadas por AP
- Indicadores visuales de estado

## Responsabilidades

- Cargar estado inicial de APs
- Mantener polling automático activo
- Actualizar métricas sin refrescar página
- Renderizar gráficos en tiempo real
- Listar estaciones conectadas por AP
- Manejar errores de conexión con retry automático

## APIs Utilizadas

- `GET /api/ap-monitor/status` - Estado de APs y métricas
- `GET /api/ap-monitor/{ap-id}/stations` - Estaciones conectadas
- `GET /api/ap-monitor/{ap-id}/metrics` - Histórico de métricas

## Nota Sobre Polling

El componente inicia polling al montar y lo detiene al desmontar.
Intervalo configurable entre 5-30 segundos.

**Última actualización:** 2026-05-29
