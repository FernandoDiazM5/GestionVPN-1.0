# Plan de comercialización de GestionVPN en Perú

**Fecha:** 25 de julio de 2026  
**Producto:** MikroTikVPN Remote Manager / GestionVPN  
**Alcance:** convertir el sistema actual en un servicio B2B vendible a WISP pequeños y medianos de Perú.

> Este documento es una propuesta comercial y técnica. Los precios deben validarse con clientes reales y las obligaciones tributarias y legales con un contador y un abogado peruano.

## 1. Resumen ejecutivo

GestionVPN ya tiene una propuesta valiosa: permite administrar remotamente un Core MikroTik, aprovisionar y controlar accesos VPN, trabajar con roles y workspaces, escanear equipos Ubiquiti airOS, monitorear enlaces, generar auditoría e informes, respaldar configuraciones y producir diagnósticos consultivos con Gemini.

Sin embargo, todavía no debe venderse como un SaaS masivo y autoservicio. El riesgo principal no está en la cantidad de funciones, sino en la operación:

- El sistema aún está muy acoplado a un Core y a un stack de producción.
- Falta completar el aislamiento real de datos, credenciales, tareas y respaldos por cliente y por servidor VPN.
- Staging fue eliminado y debe restaurarse antes de aceptar clientes.
- Hay funciones publicadas que todavía necesitan validación autenticada y pruebas con RouterOS de laboratorio.
- Faltan suscripciones, límites por plan, cobros, comprobantes, soporte, SLA y procesos de baja.

La salida recomendada es vender primero un **servicio administrado de operación remota para WISP**, con una instancia aislada por cliente, implementación pagada y mensualidad. Después de operar con 3 a 5 clientes piloto y demostrar estabilidad, se puede evolucionar a un SaaS multiempresa más automatizado.

## 2. Cliente ideal y problema que se vende

### Cliente ideal inicial

WISP peruano que tenga:

- Uno a cinco Core MikroTik.
- Entre 10 y 200 nodos, torres, AP o CPE que necesite observar.
- Equipos Ubiquiti airOS y operación remota distribuida.
- Dos a veinte operadores o técnicos.
- Procesos manuales con Winbox, hojas de cálculo, WhatsApp y accesos compartidos.
- Necesidad de saber quién hizo qué, reducir desplazamientos y responder más rápido a fallas.

### Comprador

- Dueño o gerente del WISP.
- Responsable de NOC.
- Jefe de operaciones o soporte.

### Problemas por los que pagaría

- Accesos remotos desordenados o compartidos.
- Riesgo al permitir cambios directos sobre el Core.
- Falta de trazabilidad por operador.
- Diagnóstico lento de enlaces y visitas de campo innecesarias.
- Inventario disperso.
- Respaldos no verificados.
- Dificultad para separar el acceso de cada técnico o cliente.

### Promesa comercial

> “Centraliza y controla la operación remota de tu red MikroTik y Ubiquiti, con accesos separados, auditoría, monitoreo, diagnósticos y respaldos, sin exponer el Core directamente.”

No se debe anunciar todavía como un ERP completo para ISP: GestionVPN no reemplaza facturación de abonados, CRM, inventario comercial, cobranza ni mesa de ayuda integral. Su ventaja inicial es la **operación segura de red**.

## 3. Diagnóstico del producto actual

### Fortalezas que sí se pueden convertir en argumentos de venta

- Sesiones HttpOnly, CSRF, revocación y autorización respaldada por MySQL.
- Roles de plataforma, OWNER y MEMBER.
- Workspaces y auditoría de acciones.
- Acceso VPN individual y aislamiento mediante reglas por usuario.
- Aprovisionamiento WireGuard/SSTP y administración remota del Core.
- Escaneo Ubiquiti airOS de solo lectura.
- Monitor AP, métricas y exportaciones PDF, CSV, JSON y XLSX.
- Respaldos y health del Core.
- Diagnóstico consultivo con Gemini, con cuotas, caché, seudonimización y retención limitada.
- Secretos y credenciales fuera del repositorio.
- Historial Git y proceso de rollback.

### Bloqueadores para cobrar de forma recurrente

| Bloqueador | Riesgo comercial | Acción requerida |
|---|---|---|
| Un juego global de credenciales `MT_*` | Un cambio puede afectar al Core equivocado | Crear perfiles de Core por cliente y `core_server_id` |
| Staging eliminado | Las pruebas terminan ocurriendo cerca de producción | Restaurar un stack de staging separado |
| Funciones no validadas en vivo | Incidentes durante onboarding | Suite de aceptación contra laboratorio y piloto |
| URL técnica `nip.io` | Baja confianza comercial y dependencia temporal | Dominio propio, TLS, correo y marca |
| Google/Firebase en validación | Función visible que puede fallar | Terminarla o esconderla hasta que pase aceptación |
| Sin módulo de suscripciones | No existen límites ni ciclo de cobro | Planes, entitlements, uso, gracia y suspensión |
| Sin proceso formal de soporte | El fundador absorbe solicitudes ilimitadas | Canal, horarios, severidades y SLA |
| Sin recuperación probada | Un backup no garantiza restauración | Pruebas periódicas de restore y RTO/RPO |
| Sin documentación contractual | Riesgo de expectativas y responsabilidad | Términos, privacidad, DPA y límites del servicio |

## 4. Modelo de entrega recomendado

### Etapa inicial: servicio administrado y aislado

Durante los primeros 3 a 5 clientes:

- Un stack separado por cliente: frontend, backend, base de datos, credenciales, backups y monitoreo.
- Un subdominio por cliente, por ejemplo `cliente.tudominio.pe`.
- El mismo código y proceso automatizado de despliegue.
- Soporte y onboarding controlados por el proveedor.
- Los cambios RouterOS sensibles requieren aprobación humana y auditoría.

Esto reduce el riesgo de que una falla de aislamiento afecte a varias empresas y permite cobrar más por una solución administrada.

### Etapa posterior: SaaS multiempresa

Sólo después de completar:

- `core_server_id` en inventario, accesos, jobs, escaneos, respaldos, auditoría y métricas.
- Límites automáticos por plan.
- Medición de consumo.
- Exportación y eliminación por tenant.
- Pruebas automatizadas de aislamiento.
- Consola de operación y soporte multiempresa.

## 5. Cambios obligatorios antes de vender

### 5.1 Arquitectura y aislamiento

1. Convertir Workspace en la entidad comercial “Organización” o “Empresa”.
2. Crear `CoreServer` por organización con:
   - Credenciales cifradas.
   - Modo “Sólo observación” por defecto.
   - Modo “Operativo” habilitado explícitamente.
   - Prueba de conexión.
   - Estado, versión RouterOS y última sincronización.
3. Añadir `core_server_id` a:
   - Nodos, peers, interfaces y VRF.
   - Inventario y escaneos.
   - Jobs y colas.
   - Respaldos.
   - Eventos, auditoría y métricas.
4. Probar que un OWNER de una organización nunca pueda consultar o cambiar datos de otra.
5. Usar un stack dedicado por cliente mientras este aislamiento se completa.

### 5.2 Entornos y despliegue

- Restaurar staging con base de datos, credenciales y dominio propios.
- Mantener producción sin datos de prueba.
- Automatizar backup previo, migración, health check y rollback.
- Implementar CI que ejecute pruebas, lint, build, auditoría de diseño y análisis de seguridad.
- Usar despliegue canary o blue/green para cambios de alto riesgo.
- Mantener la política existente: commit y push a `vps_prod` antes de desplegar, más autorización explícita para cada despliegue.

### 5.3 Seguridad

- Rotar la clave WireGuard del VPS que quedó identificada como pendiente.
- Revisar permisos mínimos en RouterOS y eliminar credenciales compartidas.
- Añadir MFA para OWNER y administradores; Google puede ser una opción, no el único acceso de recuperación.
- Proteger secretos con un gestor de secretos o archivos root-only fuera de las imágenes.
- Ejecutar un pentest externo antes del lanzamiento general.
- Añadir alertas por inicios de sesión anómalos, cambios de rol, exportaciones y acciones operativas.
- Probar restauración de respaldos y documentar RPO/RTO.
- Preparar un procedimiento de respuesta a incidentes.

### 5.4 Confiabilidad y observabilidad

- Métricas de uptime, latencia, errores 4xx/5xx, cola de jobs, uso de CPU/RAM/disco y fallos de conexión a cada Core.
- Logs centralizados con tenant, correlación y datos sanitizados.
- Alertas por caída del Core, backup fallido, disco alto, errores de autenticación y reinicios.
- Página de estado.
- Objetivo inicial de servicio: 99.5% mensual para planes normales; no prometer 99.9% hasta tener redundancia y evidencia.
- Backups cifrados diarios y prueba de restauración mensual.

### 5.5 Experiencia de incorporación

Crear un asistente de onboarding:

1. Datos de la empresa y responsable.
2. Registro del Core en modo observación.
3. Preflight de conectividad y permisos.
4. Importación o descubrimiento seguro.
5. Creación de usuarios y roles.
6. Verificación de backup.
7. Checklist de aceptación.
8. Paso explícito a modo operativo.

El cliente debe poder completar la configuración sin enviar contraseñas por correo o WhatsApp.

### 5.6 Suscripciones y cobro

Nuevas entidades recomendadas:

- `SubscriptionPlan`
- `Subscription`
- `Entitlement`
- `UsageMeter`
- `Payment`
- `InvoiceRecord`
- `GracePeriod`
- `OnboardingRun`
- `SupportCase`
- `DataExportRequest`
- `DataDeletionRequest`

Reglas:

- Estado de suscripción: prueba, activa, vencida, gracia, suspendida y cancelada.
- Gracia de 5 a 7 días antes de suspender.
- Una suspensión comercial nunca debe borrar datos ni desconectar la red del cliente.
- En suspensión, dejar exportación y acceso de facturación; bloquear nuevas operaciones.
- Avisos previos por correo.
- Baja con exportación y retención contractual.

## 6. Mejoras funcionales por prioridad

### Prioridad P0: necesarias para vender

- Perfiles de Core y aislamiento completo.
- Staging separado.
- Dominio y correo corporativo.
- Billing, límites por plan y estado de suscripción.
- Onboarding y preflight.
- Recuperación, backups y restore probados.
- Soporte, estado y alertas.
- Términos, privacidad y tratamiento de datos.
- Validar Google o desactivarlo temporalmente.
- Suite de aceptación con RouterOS de laboratorio.

### Prioridad P1: aumenta conversión y retención

- Panel de salud de flota y resumen ejecutivo.
- Alertas configurables por correo y Telegram.
- Comparación de métricas antes/después.
- Calendario y ventana de mantenimiento.
- Reportes periódicos automáticos.
- API y webhooks de sólo lectura con permisos.
- App instalable PWA para técnicos.
- Plantillas de roles y permisos.
- Centro de ayuda dentro de la aplicación.

### Prioridad P2: diferenciación futura

- Integraciones con sistemas de facturación/CRM para ISP.
- Inventario comercial y órdenes de trabajo mediante integración, no duplicando un ERP.
- Detección de degradación y tendencias.
- Gestión de equipos distintos a airOS con conectores de sólo lectura.
- SSO empresarial.
- Marca blanca.
- Instancia dedicada y retención personalizada.

## 7. Cómo cobrar

### Unidad de precio

Cobrar por:

- Número de Core administrados.
- Cantidad de nodos/AP/CPE observados.
- Número de operadores.
- Nivel de soporte y SLA.
- Instancia compartida o dedicada.

No conviene cobrar por abonado final porque el producto todavía no administra el ciclo comercial del abonado. Tampoco conviene ofrecer soporte o cambios RouterOS ilimitados dentro de una mensualidad baja.

### Tarifas iniciales para validar

Los precios siguientes son **antes de IGV**:

| Plan | Precio mensual | Incluye |
|---|---:|---|
| Piloto fundador | S/ 199 por 90 días | 1 Core, 20 equipos, 3 usuarios, onboarding controlado, soporte 8x5; máximo 5 clientes |
| Starter | S/ 249 | 1 Core, 20 equipos, 3 usuarios, monitoreo, auditoría, exportes y soporte 8x5 |
| Growth | S/ 499 | 2 Core, 75 equipos, 10 usuarios, alertas, reportes, backups y cuota de IA |
| Business | S/ 899 | 5 Core, 200 equipos, 25 usuarios, mayor retención, soporte prioritario y revisión mensual |
| Dedicado | Desde S/ 1,800 | Stack aislado, dominio/subdominio, retención y SLA acordados |

### Cargos separados

| Servicio | Tarifa sugerida antes de IGV |
|---|---:|
| Implementación Starter | S/ 600–1,000 |
| Implementación Growth | S/ 1,200–2,500 |
| Implementación dedicada o migración compleja | Desde S/ 2,500 |
| Core adicional | S/ 120–200 al mes |
| Bloque adicional de 25 equipos | S/ 80–120 al mes |
| Soporte fuera de horario | S/ 120–200 por hora |
| Cambio RouterOS o consultoría de red | Cotización separada |
| Capacitación remota adicional | S/ 250–500 por sesión |

### Condiciones comerciales

- Cobro mensual anticipado.
- Descuento anual equivalente a dos mensualidades, sólo después de probar retención.
- Piloto pagado de 30 días; el pago se descuenta de la implementación si contrata.
- Precios de fundador con vigencia y límites claros, no “precio de por vida”.
- Revisión de precio anual por costos, inflación y funciones incluidas.
- IA con cuota y uso razonable; el exceso se bloquea o se cobra como paquete.

### Referencias para posicionar el precio

UISP permite autoalojar gratuitamente su aplicación y ofrece hosting cloud desde USD 99 al mes; Sonar, que es una suite mucho más amplia de operación y facturación ISP, publica un mínimo de USD 500 mensuales. Estas referencias indican que GestionVPN debe competir por especialización, soporte local e implementación segura, no sólo por ser “más barato”.  
Fuentes: [UISP Cloud Hosting](https://help.uisp.com/hc/en-us/articles/29600863336599-UISP-UISP-Cloud-Hosting-FAQ), [UISP Carrier desde USD 99](https://store.ui.com/us/en/products/uisp-cloud-hosting-carrier), [Sonar Pricing](https://sonar.software/pricing).

## 8. Cobros y comprobantes en Perú

- La prestación de servicios en Perú está gravada con IGV; en 2026 la tasa total continúa en 18%. Los precios B2B deben mostrarse como “más IGV” o indicar claramente el total. [SUNAT: Impuesto General a las Ventas](https://www.gob.pe/institucion/sunat/pages/7910-impuesto-general-a-las-ventas-igv)
- Para clientes con RUC normalmente corresponderá factura electrónica; la boleta se usa para consumidores finales. [SUNAT: factura electrónica](https://cpe.sunat.gob.pe/tipos_de_comprobantes/factura)
- Conviene empezar con transferencia bancaria y comprobante electrónico. Integrar cobro recurrente cuando exista suficiente volumen.
- Mercado Pago ofrece planes de suscripción en Perú. Culqi ofrece cobros online y publica para tarjetas nacionales una comisión general de 3.44% más USD 0.20 por operación, sujeta a evaluación y condiciones vigentes. [Mercado Pago Developers](https://www.mercadopago.com.pe/developers/es/docs/getting-started), [Culqi Online](https://culqi.com/productos/online-pasarela-de-pagos/)
- La pasarela debe enviar webhooks al backend; nunca se debe activar un plan sólo porque el navegador regresó a una página de “pago exitoso”.

Antes de emitir comprobantes o elegir régimen tributario, validar la estructura del negocio, RUC, actividad económica y régimen con un contador peruano.

## 9. Privacidad, contratos y cumplimiento

Mínimos antes de captar clientes:

- Términos del servicio.
- Política de privacidad.
- Acuerdo de tratamiento de datos (DPA) para clientes empresa.
- Lista de subencargados: hosting, correo, Firebase/Google, Gemini y pasarela.
- Matriz de datos recolectados, finalidad, base legal, retención y acceso.
- Procedimiento para acceso, rectificación, cancelación, oposición y portabilidad.
- Exportación y eliminación al terminar el servicio.
- Registro de bancos de datos personales cuando corresponda. La ANPD indica que la inscripción es gratuita, virtual y obligatoria para el titular de un banco de datos personales. [ANPD: inscripción de banco de datos](https://www.gob.pe/institucion/anpd/pages/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales)
- Plan de incidentes: el reglamento vigente desde el 31 de marzo de 2025 contempla notificación de determinados incidentes de seguridad a la ANPD en un máximo de 48 horas y, cuando afecten derechos, también a los titulares. [MINJUSDH: nuevo Reglamento de Protección de Datos](https://www.gob.pe/institucion/minjus/noticias/1133500-entrara-en-vigencia-la-nueva-regulacion-sobre-el-consentimiento-expreso-de-las-personas-para-recibir-llamadas-publicitarias)
- Si se vende a consumidores, evaluar Libro de Reclamaciones virtual, precio final y canales de posventa conforme a las reglas de comercio electrónico de Indecopi. [Indecopi: guía para comercio electrónico](https://repositorio.indecopi.gob.pe/backend/api/core/bitstreams/fe84a848-2d7d-4484-8516-83d6fb443d10/content)

El contrato debe aclarar:

- Qué infraestructura administra GestionVPN y qué queda bajo control del cliente.
- Que las acciones de red requieren autorización y pueden producir interrupciones.
- Horario de soporte, severidades, SLA, exclusiones y mantenimiento.
- RPO, RTO y retención de backups.
- Responsabilidad del cliente sobre sus credenciales, licencias y configuración.
- Proceso de baja, exportación y eliminación.
- Límites de la IA: diagnóstico consultivo, nunca ejecución automática.

## 10. Proceso de venta

```mermaid
flowchart LR
    A["Prospecto WISP"] --> B["Calificación técnica y comercial"]
    B --> C["Inventario de Core, nodos y operadores"]
    C --> D["Demo con datos de laboratorio"]
    D --> E["Piloto pagado de 30 días"]
    E --> F["Checklist de aceptación"]
    F --> G["Implementación y capacitación"]
    G --> H["Suscripción mensual"]
    H --> I["Revisión de valor y renovación"]
```

### Calificación

Preguntar:

- Cuántos Core, torres, AP/CPE y operadores existen.
- Cómo ingresan hoy a MikroTik y Ubiquiti.
- Cuántos incidentes y desplazamientos tienen al mes.
- Qué cambios debe aprobar el dueño.
- Qué herramienta usan para respaldos y auditoría.
- Qué tiempo de respuesta esperan.
- Quién decide y cuánto cuesta una visita técnica o una caída.

### Piloto

- Un Core de laboratorio o de bajo riesgo.
- Modo observación inicialmente.
- Objetivos medibles acordados.
- Sin acceso compartido por WhatsApp.
- Backup previo.
- Criterios de salida y rollback.
- Informe final con ahorro de tiempo, incidentes detectados y acciones auditadas.

## 11. Plan de ejecución

### Fase 0 — Posicionamiento, semana 1

- Entrevistar a 5 WISP conocidos.
- Validar problema, disposición de pago y tamaño típico.
- Elegir nombre comercial, dominio y mensaje.
- Preparar demo de laboratorio, no usar producción como demo.
- Definir piloto, contrato y checklist.

**Salida:** al menos 3 prospectos que acepten una demo y 1 que acepte discutir un piloto pagado.

### Fase 1 — Base vendible, semanas 2 a 6

- Restaurar staging.
- Implementar perfiles de Core y aislamiento.
- Automatizar instancia dedicada por cliente.
- Terminar u ocultar Google hasta que pase aceptación.
- Dominio, TLS y correo corporativo.
- Métricas, alertas, backups y restore.
- Entitlements y estados de suscripción.
- Políticas y contratos iniciales.
- Pruebas de seguridad y aislamiento.

**Salida:** checklist P0 completo y demo repetible.

### Fase 2 — Pilotos, semanas 7 a 10

- Incorporar 2 o 3 WISP.
- Cobrar implementación y piloto.
- Operar primero en observación.
- Medir tiempo de onboarding, errores, soporte y valor.
- Corregir regresiones primero en staging.
- No activar funciones destructivas sin laboratorio.

**Salida:** dos casos de uso documentados y al menos un cliente convertido a mensualidad.

### Fase 3 — Lanzamiento controlado, semanas 11 a 16

- Publicar web comercial y documentación.
- Activar planes Starter, Growth y Business.
- Integrar pago recurrente o automatizar conciliación.
- Emitir comprobantes electrónicos.
- Página de estado y mesa de soporte.
- Referidos y alianzas con consultores MikroTik.

**Salida:** 5 clientes activos y proceso de soporte sostenible.

### Fase 4 — Escala, meses 5 a 12

- Evolucionar al SaaS multiempresa sólo con aislamiento probado.
- API/webhooks.
- PWA y alertas avanzadas.
- Marca blanca y SSO.
- Integraciones con plataformas ISP.
- Contratar soporte u operaciones antes de prometer 24x7.

## 12. Metas y números

### Objetivo comercial de 6 meses

Ejemplo:

- 2 Starter: S/ 498 MRR.
- 6 Growth: S/ 2,994 MRR.
- 2 Business: S/ 1,798 MRR.
- Total: S/ 5,290 MRR antes de IGV, más implementaciones.

El siguiente objetivo debe ser S/ 10,000 de MRR, sin que las horas mensuales de soporte crezcan en la misma proporción.

### Indicadores

- MRR e ingreso promedio por cliente.
- Clientes activos, conversión de piloto y churn.
- Margen bruto.
- Costo de infraestructura por cliente.
- Horas de soporte por cliente.
- Tiempo de onboarding.
- Uptime y latencia.
- Incidentes por severidad.
- Porcentaje de backups y restores correctos.
- Acciones auditadas y desplazamientos evitados.
- Uso real de cada función.

### Regla de rentabilidad

La mensualidad de cada cliente debe ser al menos 3 a 5 veces el costo mensual de infraestructura, pasarela, IA, correo, backups y soporte variable. Si un cliente requiere operación manual frecuente, debe pasar a un plan superior o contratar horas profesionales.

Como referencia, DigitalOcean publica Droplets básicos desde USD 4–24 al mes y backups semanales equivalentes al 20% del Droplet; el costo real será mayor al sumar base de datos, almacenamiento, correo, monitoreo y tiempo humano. [DigitalOcean Droplet Pricing](https://www.digitalocean.com/pricing/droplets)

## 13. Decisiones que no conviene tomar todavía

- No activar Firebase o funciones nuevas directamente en producción sin staging.
- No mezclar clientes en el mismo Core o base de datos sin aislamiento probado.
- No prometer soporte 24x7 siendo una sola persona.
- No ofrecer usuarios, equipos, IA o cambios de red ilimitados.
- No construir todavía un ERP completo de facturación ISP.
- No usar el VPS de producción como entorno de demostración.
- No permitir que Gemini o cualquier automatización modifique RouterOS o airOS.
- No vender la función de aprovisionamiento “desde cero” hasta validarla en laboratorio.

## 14. Próximas decisiones del propietario

Para convertir este plan en backlog y presupuesto definitivo se deben responder:

1. ¿Los primeros clientes serán WISP conocidos o se buscarán por publicidad?
2. ¿Cuántos Core, equipos y operadores tiene el cliente típico?
3. ¿Se venderá un servicio administrado o un SaaS autoservicio?
4. ¿Se puede mantener inicialmente una instancia separada por cliente?
5. ¿El soporte será 8x5 o se necesita guardia fuera de horario?
6. ¿Se emitirá factura con RUC desde el primer piloto?
7. ¿Cuántas horas mensuales puede dedicar el propietario a soporte?
8. ¿Qué función concreta ya ha pedido un posible cliente y cuánto pagaría por ella?

## 15. Recomendación final

La prioridad no es añadir más pantallas. La prioridad es convertir las capacidades actuales en un servicio seguro, repetible y cobrable:

1. Aislar cada cliente y cada Core.
2. Restaurar staging y demostrar rollback.
3. Formalizar onboarding, soporte, backups y cumplimiento.
4. Cobrar piloto e implementación.
5. Conseguir 3 a 5 clientes administrados.
6. Usar los datos de esos pilotos para ajustar funciones y precio.
7. Sólo después automatizar el SaaS multiempresa.

La propuesta tiene potencial porque combina operación MikroTik, acceso VPN individual, observación Ubiquiti, auditoría y diagnóstico local para WISP. Su ventaja comercial será la confianza operativa y el soporte especializado en español, no la cantidad de funciones.
