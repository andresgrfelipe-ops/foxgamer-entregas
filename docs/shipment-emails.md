# Avisos de FOX GAMER Entregas

Cada evento nuevo de una guía con correo crea una fila en una cola privada, dentro de la misma transacción que guarda la guía. No se envían avisos de las guías históricas por instalar esta migración. El seguimiento público no devuelve el correo del cliente.

La función programada `shipment-emails` revisa la cola cada minuto. Registra la aceptación de Resend, reintenta errores temporales hasta ocho intentos, usa bloqueos e idempotencia para reducir duplicados y detiene reintentos después de 23 horas desde el primer intento. Un correo aceptado por el proveedor no confirma entrega en la bandeja del cliente. Los avisos fallidos se muestran en el panel.

## Activación

1. Aplicar la migración SQL incluida y desplegar este commit desde Git.
2. Crear o conectar una cuenta de Resend y verificar `entregasfoxgamer.co` con los registros DNS exactos que indique el proveedor. No sustituir registros del sitio ni del correo existente.
3. Configurar en Netlify, contexto Production y alcance Functions:
   - `RESEND_API_KEY`: secreto de envío.
   - `SHIPMENT_EMAIL_FROM`: `FOX GAMER Entregas <notificaciones@entregasfoxgamer.co>`.
   - `SHIPMENT_EMAIL_REPLY_TO`: opcional, solo si existe un buzón de atención verificado.
   - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: ya forman parte del servidor; no exponerlos en los archivos públicos.
   - `EMAIL_NOTIFICATIONS_ENABLED=true`: únicamente después de verificar dominio, revisar avisos pendientes y preparar una prueba autorizada.
4. Volver a desplegar. Crear una guía de prueba con una dirección del propietario expresamente confirmada y comprobar recepción, actualización y enlace de seguimiento. No reutilizar el correo de un cliente para pruebas.
5. Si la activación se retrasa, revisar los avisos acumulados antes de habilitar envíos para evitar notificaciones antiguas.

Mientras falta esa configuración, el panel muestra que el envío está pendiente de activación y permite guardar correos. No se crea un buzón de Gmail ni un buzón de recepción al configurar el remitente.

## Verificación

`npm test` comprueba plantilla, hora Colombia, configuración incompleta, aceptación del proveedor, errores permanentes, reintentos y pérdida de confirmación en base de datos. `npm run build` publica únicamente los archivos estáticos de la aplicación en `dist`, dejando código de servidor, pruebas y migraciones fuera del sitio público.
