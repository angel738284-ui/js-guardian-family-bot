# JS Guardian — comandos propios de JS Family

Esta versión conserva Asena y agrega comandos en español:

- `/reglas`: publica las reglas oficiales de Free Fire y el ID 11572310927.
- `/kick @usuario`: expulsa a un integrante del grupo. También funciona respondiendo al mensaje del integrante con `/kick`.
- Se conserva el prefijo original `#` para los comandos existentes de Asena.

**Permisos:** solo el número `OWNER_NUMBER` puede usar ambos comandos personalizados. Para expulsar también debe ser administrador del grupo y JS BOT ADM debe tener permisos de administrador.

## Instalación

En Render: Servicio JS Guardian → Settings → Build → Source → Edit → seleccionar este repositorio. Mantener las variables de entorno existentes (sobre todo SESSION_ID y OWNER_NUMBER). No crear una segunda instancia con el mismo SESSION_ID. Render desplegará el repositorio actualizado.

Comprobación: en un grupo de prueba, usar `/reglas` y contestar el mensaje de un usuario de prueba con `/kick`.

No agregar códigos de sesión, contraseñas ni tokens a este repositorio.