# FOX GAMER Entregas

Plataforma de seguimiento y administración de entregas de FOX GAMER.

## Estado actual
- Seguimiento público conectado a Supabase mediante la función segura `track_shipment`.
- Panel administrativo conectado a una Netlify Function.
- Base de datos real con `shipments`, `shipment_events` y `messages`.
- RLS habilitado y lectura pública directa de las tablas bloqueada.
- La consulta pública solo devuelve campos seguros del envío.

## Variables de entorno necesarias en Netlify
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_TOKEN`

Nunca publiques `SUPABASE_SERVICE_ROLE_KEY` en el frontend ni en GitHub.

## Rutas
- `/`: consulta pública de guía.
- `/admin`: panel administrativo.
- `/api/shipments`: API administrativa protegida.

## Despliegue
El proyecto está preparado para Netlify mediante `netlify.toml`.
