# 📱 Manual de Usuario — Notificaciones y Bot Telegram

> Guía paso a paso para activar las notificaciones y usar el bot desde tu celular.
> Pensada para usuarios finales (moderadores, miembros). No requiere conocimientos técnicos.

---

## 1) ¿Qué son las notificaciones?

El sistema te avisa por **email** o **Telegram** cada vez que ocurre algo importante:

| Evento | Cuándo lo recibes |
|--------|-------------------|
| ✅ **Túnel activado** | Cuando tú u otra persona abre uno de tus túneles |
| 🔒 **Túnel desactivado** | Cuando se cierra un túnel |
| ⏰ **Sesión expirada** | Cuando tu túnel se cierra solo por TTL (30 min sin uso) |

Por defecto, recibes los 3 eventos por email. Puedes activar Telegram para recibirlos también ahí, y pausar las notificaciones cuando estés de vacaciones.

---

## 2) Configurar notificaciones por email

📍 **Dónde:** Panel → Ajustes → **Notificaciones**

1. Entra al panel con tu usuario y contraseña.
2. Abre **Ajustes** (icono de engranaje en la barra lateral).
3. En el menú de tabs, selecciona **Notificaciones**.
4. La casilla **Email** ya está activada por defecto. Si quieres apagarla, desmárcala.
5. Más abajo verás la lista de **Eventos** — marca o desmarca según prefieras.
6. Toca **Guardar**.

> 💡 **Tip:** si no quieres recibir nada por un tiempo, usa el botón **Pausar** arriba — no pierdes la configuración, solo silencias todo. Cuando regreses, **Reanudar** la restablece.

---

## 3) Conectar tu cuenta con Telegram (vinculación)

Telegram te permite recibir las notificaciones en tu móvil con el ⚡ instante de la app. La vinculación se hace UNA vez por cuenta de usuario y queda guardada.

### Paso 1 — Buscar al bot del sistema

> ⚠️ **El nombre del bot lo da el Administrador de la plataforma.** Pídeselo al equipo de Sistemas o búscalo en la circular interna. En esta guía lo llamaremos **`@MikroTikVPNBot`** como ejemplo.

1. Abre Telegram en tu celular (o web).
2. En el buscador (lupa), escribe el nombre del bot tal como te lo dieron.
3. Toca el bot en los resultados.
4. Toca **INICIAR** (o envía `/start`).

El bot te responderá con un mensaje de bienvenida que dice algo como:

```
👋 VPN Manager Bot

Para vincular tu chat:
1) Abre el panel → Ajustes → Notificaciones
2) Toca Vincular — recibirás un código de 6 chars
3) Envíame: /link CODE

Panel: https://...
```

### Paso 2 — Generar el código en el panel

1. Vuelve al panel del navegador.
2. **Ajustes → Notificaciones**.
3. En la fila **Telegram**, toca el botón **Vincular**.
4. Aparecerá un cuadro azul con un código como `ABC123` y un botón **Copiar**.

> ⏱️ El código **expira en 15 minutos**. Si tardas más, vuelve a tocar **Vincular** para generar uno nuevo.

### Paso 3 — Enviar el código al bot

1. Toca el botón **Copiar** del cuadro azul (copia `/link ABC123` completo).
2. Abre la conversación con el bot en Telegram.
3. Pega y envía.
4. El bot responderá:

```
✅ Chat vinculado a tu-correo@ejemplo.com

Habilita el canal Telegram en el panel para recibir notificaciones.
Usa /help para ver comandos.
```

### Paso 4 — Activar el canal en el panel

1. Vuelve al panel — **Ajustes → Notificaciones**.
2. Marca la casilla **Telegram** (ya no estará deshabilitada).
3. Toca **Guardar**.

🎉 **Listo.** A partir de ahora recibirás las notificaciones también por Telegram.

---

## 4) Comandos del bot

Una vez vinculado, puedes hablar con el bot en cualquier momento. Estos son los comandos:

| Comando | Qué hace |
|---------|----------|
| `/start` | Te saluda y muestra el estado de tu vinculación. |
| `/help` | Lista todos los comandos disponibles. |
| `/status` | Te muestra qué túnel tienes activo en este momento y cuánto le queda. |
| `/tuneles` | Te lista los túneles que tienes disponibles (los tuyos asignados, o todos si eres moderador). |
| `/activar VRF-NOMBRE` | Te envía un enlace al panel para confirmar la activación del túnel. |
| `/desactivar` | Te envía un enlace al panel para confirmar la desactivación. |
| `/unlink` | Desvincula este chat de tu cuenta (puedes volver a vincular cuando quieras). |

### Ejemplos

**Ver túneles disponibles:**

```
Tú: /tuneles

Bot: Túneles disponibles (3)

• VRF-ND1-TORRENORTE — Torre Norte
• VRF-ND2-TORRESUR — Torre Sur
• VRF-ND3-CASETA — Caseta Central

Para activar: /activar VRF-NOMBRE
```

**Activar un túnel:**

```
Tú: /activar VRF-ND1-TORRENORTE

Bot: 🔗 Abre este enlace en el navegador donde tengas la sesión iniciada:
https://panel.tu-empresa.com/?activate=VRF-ND1-TORRENORTE

Por seguridad, el bot no activa túneles directamente — confirma en el panel.
```

Toca el enlace. Se abrirá el panel con un banner azul arriba que dice **"El bot de Telegram solicitó activar VRF-ND1-TORRENORTE"**. Tocas **Activar ahora** y listo.

> 🔒 **¿Por qué el bot no activa directamente?** Porque tocar el router exige una confirmación humana fuerte. El bot solo abre el camino; tú decides en el panel — donde ya estás autenticado con tu sesión segura.

---

## 5) Recibir un mensaje del bot — qué significa cada uno

Cuando ocurre uno de los eventos a los que estás suscrito, el bot te escribe automáticamente. Estos son los formatos:

**Túnel activado:**

```
🔓 Túnel activado
Túnel: VRF-ND1-TORRENORTE
Por: fernando@ejemplo.com
Desde IP: 200.x.x.x
Expira: 10/06/2026, 16:32
Fecha: 10/06/2026, 16:02
```

**Túnel desactivado:**

```
🔒 Túnel desactivado
Túnel: VRF-ND1-TORRENORTE
Por: fernando@ejemplo.com
Fecha: 10/06/2026, 16:45
```

**Sesión expirada:**

```
⏰ Sesión expirada
El túnel VRF-ND1-TORRENORTE caducó por TTL.
Reactívalo desde el panel si lo necesitas.
Fecha: 10/06/2026, 16:32
```

---

## 6) Pausar o desvincular

### Pausar temporalmente (sin perder configuración)

📍 Panel → Ajustes → Notificaciones → botón **Pausar** arriba.

Mientras esté pausado:
- ❌ No recibes emails.
- ❌ No recibes mensajes de Telegram.
- ✅ Tu configuración queda guardada — al **Reanudar**, todo vuelve.

### Desvincular Telegram (deshacer la conexión con el chat)

Opción 1 — desde el panel:
- Ajustes → Notificaciones → fila Telegram → botón **Desvincular**.

Opción 2 — desde el bot:
- Envía `/unlink` al bot.

> Después de desvincular, el bot solo responde a `/start` y `/link CODE` hasta que vincules nuevamente.

---

## 7) Problemas comunes

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| **El bot dice "código expirado"** | El código de 6 chars dura 15 min | Vuelve al panel y toca **Vincular** otra vez para generar uno nuevo |
| **El bot dice "código inválido"** | Formato distinto (8 chars en lugar de 6, lo escribí mal) | Copia el código con el botón **Copiar** del panel, no lo escribas a mano |
| **La casilla Telegram está deshabilitada** | El chat aún no está vinculado | Sigue los pasos 1-3 de la sección 3 |
| **Recibo email pero no Telegram (o viceversa)** | El canal está apagado en preferencias | Panel → Ajustes → Notificaciones → marca el canal y **Guardar** |
| **Toco `/activar VRF-X` y no pasa nada** | El bot envía un enlace, no ejecuta. Tienes que tocar el enlace que te manda | Toca el enlace y confirma en el banner del panel |
| **Dice "Tu chat no está vinculado"** | El bot perdió la asociación (rara vez) o nunca se vinculó | Repite los pasos de vinculación |
| **El bot no responde** | El Administrador puede tenerlo deshabilitado, o el servidor está caído | Contacta a Sistemas. Mientras tanto, el panel sigue funcionando con email |

---

## 8) Privacidad y seguridad

- **El bot solo te envía mensajes a ti.** Cada notificación va al `chat_id` que vinculaste; no las ven otros usuarios ni los administradores.
- **El bot no ejecuta acciones críticas por sí solo.** Para activar o desactivar siempre te envía a confirmar en el panel (autenticación fuerte con tu sesión).
- **Tu email y nombre se usan solo para el saludo y los emails de notificación.** No se comparten con Telegram ni con terceros.
- **Para desvincular completamente** envía `/unlink` al bot o toca **Desvincular** en el panel — borra tu `chat_id` de nuestra base de datos.

---

## 9) Para el Administrador de la plataforma

Si todavía no hay bot configurado, sigue estos pasos (es responsabilidad del Administrador, los usuarios finales pueden saltarse esta sección):

1. Abre Telegram y busca **@BotFather** (el bot oficial de Telegram).
2. Envía `/newbot`. BotFather te pedirá:
   - Un **nombre** del bot (cualquier texto, ej. *"MikroTik VPN Manager"*).
   - Un **username** que termine en `Bot` (ej. *MikroTikVPNBot*).
3. BotFather te devuelve un **token** del tipo `123456789:ABCDEFghijklmnopQRSTUVWXYZ`. **Guárdalo en privado** — quien tenga el token controla el bot.
4. En el servidor, edita `server/.env` y agrega:

   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCDEFghijklmnopQRSTUVWXYZ
   TELEGRAM_BOT_ENABLED=true
   APP_BASE_URL=https://panel.tu-empresa.com/
   ```

5. Reinicia el backend: `cd server && npm run dev` (o `npm start` en prod).
6. En el log debe aparecer: `Bot iniciado (long-polling)`.
7. Comunica a tus usuarios el username del bot (`@MikroTikVPNBot` o el que hayas elegido) para que lo busquen.

> 🛡️ **Opcionalmente** (recomendado para producción) configura el bot para ignorar mensajes de grupos: en BotFather → tu bot → **Bot Settings** → **Group Privacy** → **Enable**.

---

¿Tienes dudas? Contacta al Administrador de la plataforma o revisa la documentación técnica en [HANDOFF.md §26-27](./HANDOFF.md).
