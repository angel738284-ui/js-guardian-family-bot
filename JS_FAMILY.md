# JS Guardian — JS Family

Bot de WhatsApp basado en Asena, alojado en Render.

## Comandos propios (solo OWNER_NUMBER)

- `/reglas`: reglas oficiales de Free Fire e ID 11572310927.
- `/kick @usuario`: expulsa un usuario sin ban permanente; también funciona respondiendo a su mensaje con `/kick`.
- `/warn @usuario`: 1 advertencia; al llegar a 3, expulsión automática y reinicio de contador al expulsar exitosamente.
- `/unwarn @usuario`: borra advertencias.
- `/warnings @usuario`: consulta el contador.
- `/ban @usuario`: expulsa y guarda en la lista negra persistente de **ese grupo**. Si vuelve a entrar, intenta expulsarlo.
- `/desban @usuario` o `/desban 549...`: quita al usuario de la lista negra, incluidos sus alias LID/teléfono cuando están disponibles.
- `/guardian`: estado de las protecciones.
- `/guardian stickers on|off`: activar/desactivar límite de 2 stickers por persona cada 60 segundos. A partir del tercero se borra el sobrante y se da máximo 1 advertencia por ráfaga de 60 segundos.
- `/guardian links on|off`: activar/desactivar bloqueo de enlaces.
- `/permitirlink dominio.com`: permite links de ese dominio y sus subdominios.
- `/quitarlink dominio.com`: vuelve a bloquear ese dominio.
- `/links`: muestra lista de dominios permitidos.
- `/sanciones`: manda el historial **al chat privado de administración**, no al grupo público.
- `/menujs`: muestra el menú.

El resto de los comandos Asena siguen usando `#`. El sistema JS Guardian usa `/` para evitar conflictos: `#ban` sigue siendo el ban de comandos de Asena, mientras `/ban` es la expulsión con lista negra.

## Permisos
- Comandos administrativos nuevos: solo OWNER_NUMBER y administrador del grupo.
- JS BOT ADM debe ser administrador para borrar mensajes o expulsar.
- BOT_MODE=private impide el uso general de comandos originales por terceros no autorizados.
- Se omiten los administradores y el dueño al aplicar antistickers y antilinks automáticos.

## Persistencia y privacidad
- Render Free puede reiniciar el servicio y borrar archivos locales. Por eso los baneos, contadores, configuraciones JS Guardian y el historial se guardan en **dos tablas independientes** de Supabase (`public.js_guardian_state` y `public.js_guardian_audit`) con RLS y un encabezado secreto exclusivo de Render.
- La base está en el proyecto Supabase ya conectado; no se altera ninguna tabla de JS Torneos.
- VARIABLES SECRETAS DE RENDER (no publicar en GitHub):
  - JS_GUARDIAN_DB_URL
  - JS_GUARDIAN_DB_KEY (anon API key, no service_role)
  - JS_GUARDIAN_DB_SECRET (secreto de alta entropía validado por RLS)
  - BOT_MODE=private, OWNER_NUMBER y SESSION_ID preexistentes.
- Advertencias automáticas por sticker: 1 por ráfaga, no 1 por cada sticker extra.
- La lista negra es por grupo y dura hasta /desban, mientras Supabase esté operativo; si la base no responde, el bot no puede verificarla.
- No se detecta la intención en fotos/videos ni se interceptan llamadas grupales. El límite aplica a mensajes de tipo sticker reales que recibe el bot.

## Pruebas realizadas
- Comprobación TypeScript, sintaxis Node.
- Lógica de dominio permitido frente a dominios parecidos, conteo por minuto e identificadores.
- Integración real Supabase: escritura/lectura/borrado de bans; incremento/reset de advertencias; configuración; registro de auditoría y consulta.
- No se ejecutaron expulsiones reales de integrantes sin consentimiento; probar /kick y /ban con una cuenta voluntaria.
