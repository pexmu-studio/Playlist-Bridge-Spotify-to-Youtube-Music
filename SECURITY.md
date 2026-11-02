# Credenciales y datos

La app utiliza Google Identity Services en el navegador. No almacena contraseñas, Client Secrets ni refresh tokens. El permiso solicitado es `https://www.googleapis.com/auth/youtube.force-ssl`, necesario para las operaciones de YouTube que utiliza esta implementación.

## Qué es público

- El código fuente y los recursos de la interfaz.
- El Client ID de Google cuando se configure una instalación: debe llegar al navegador para iniciar OAuth. No permite acceder a una cuenta por sí solo.
- Los metadatos de las playlists públicas de Spotify que se consultan.

## Qué no debes publicar

- Tokens de acceso o cookies de Google, YouTube, Spotify, GitHub o Cloudflare.
- API keys, Client Secrets, claves privadas y credenciales de cuentas de servicio.
- Archivos `.env` o `.dev.vars` con valores reales.
- Exportaciones del progreso o datos de tu navegador.
- Historial Git de otras instalaciones que contenga configuraciones personales.

La configuración se lee desde `/api/config`, que solo devuelve `googleClientId`. El servidor no expone variables de entorno arbitrarias. El token de Google se usa directamente desde el navegador para llamar a Google y no se envía al servidor de esta app.

Los metadatos y el progreso se guardan en `localStorage`. Los tokens de acceso se conservan solo en memoria. Usa **Borrar datos y desconectar** en dispositivos compartidos. Puedes revocar el permiso de la app en [los ajustes de tu cuenta de Google](https://myaccount.google.com/permissions).

La importación del servidor solo acepta identificadores de playlist de Spotify con formato restringido y consulta un dominio fijo. No es un proxy de direcciones arbitrarias. Tiene tiempo máximo de espera y un límite de tamaño de respuesta.

Esta versión no lleva acceso privado integrado, telemetría, analítica ni almacenamiento de usuarios en un servidor. El alojamiento puede generar sus propios registros de peticiones. La interfaz solicita la biblioteca de acceso y las fuentes a Google; las miniaturas de los vídeos se cargan desde YouTube.

Antes de hacer una instalación accesible a otras personas, configura los orígenes OAuth exactos, el consentimiento y los usuarios autorizados. Si necesitas restringir el acceso, hazlo en el alojamiento. No sustituyas los permisos de usuario por un token compartido.

`npm run check:secrets` busca formatos habituales de credenciales e identificadores personales. No puede garantizar la ausencia de cualquier tipo de dato sensible. Revisa siempre qué archivos y cambios vas a subir.
