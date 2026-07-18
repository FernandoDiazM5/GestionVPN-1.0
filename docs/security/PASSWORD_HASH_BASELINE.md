# Baseline de rendimiento de hash de contraseñas

## Objetivo

Medir el coste actual de bcrypt antes de seleccionar parámetros de Argon2id. La medición de producción debe ejecutarse en el mismo tipo de VPS, bajo una ventana controlada y sin tráfico real, porque CPU y memoria determinan parámetros seguros.

## Comando reproducible

```bash
cd server
npm run security:hash-benchmark -- --samples 10 --rounds 10
```

El benchmark usa una contraseña sintética fija, realiza un calentamiento previo y no lee usuarios, hashes ni secretos del sistema. Reporta latencias de hash/verificación, CPU consumida y RSS del proceso.

## Línea base local inicial — 2026-07-18

Esta ejecución sirve para validar la herramienta; **no autoriza los parámetros de producción**.

| Dato | Resultado |
|---|---:|
| Entorno | Windows x64, Node v24.16.0, 16 CPU lógicas |
| Algoritmo | bcryptjs, coste 10 |
| Muestras | 5 |
| Hash medio / p95 | 79.74 ms / 90.89 ms |
| Verificación media / p95 | 75.99 ms / 80.09 ms |
| CPU user / system total | 766 ms / 16 ms |
| RSS inicial / pico | 58.13 MiB / 59.05 MiB |

## Evidencia pendiente antes de Argon2id

1. Ejecutar al menos 10 muestras de bcrypt coste 10 en staging o en el VPS objetivo.
2. Registrar CPU, memoria total, concurrencia esperada y p95 de login actual.
3. Probar candidatos Argon2id empezando por las recomendaciones mínimas de OWASP.
4. Seleccionar parámetros con memoria suficiente para encarecer ataques offline sin provocar swapping ni degradar el p95 del login.
5. Repetir bajo concurrencia representativa y documentar el criterio de rollback.

La salida completa del VPS debe adjuntarse a la evidencia de despliegue; no debe contener secretos ni datos de usuarios.
