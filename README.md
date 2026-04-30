# VIDELA — Bot Financiero Ganadero (Argentina)

Sistema de gestión financiera ganadera adaptado de IMPROLUX a Argentina. Todo se mide en **kg carne** usando el promedio semanal del **Índice Novillo MAG** (Mercado Agroganadero, Cañuelas).

## ¿Cómo funciona?

- **Cargás un movimiento en pesos** ("nafta 45000", "pago peón 200000")
- **El sistema lo convierte a kg carne** usando el promedio MAG de la **semana anterior** a la fecha del movimiento
- **Cada lunes a las 9am** un cron scrapea automáticamente el MAG y guarda el promedio ponderado por cabezas de la semana cerrada
- **Saldos, presupuestos y deudas** quedan medidos en kg carne — inmunes a la inflación

## Stack

- Node.js 18+
- Express + better-sqlite3
- Twilio (WhatsApp)
- Anthropic SDK (Claude Haiku 4.5 para parser de lenguaje natural)
- PDFKit (informes)

## Variables de entorno

```
ANTHROPIC_API_KEY=sk-ant-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_NUMBER=whatsapp:+14155...
NUMERO_ADMIN=whatsapp:+5491100000000
PUBLIC_URL=https://tu-app.onrender.com
DB_PATH=./videla.db
PORT=3000
```

## Deploy

```bash
npm install
npm start
```

Para Render/Railway: build command `npm install`, start command `npm start`. La DB SQLite se crea sola en el primer arranque.

## Endpoints clave

| Endpoint | Qué hace |
|---|---|
| `GET /` | Health check |
| `POST /webhook` | Webhook de Twilio (WhatsApp) |
| `POST /webhook-interno` | Chat desde el dashboard web |
| `GET /api/resumen` | KPIs del mes (ARS y kg) |
| `GET /api/transacciones` | Lista de movimientos |
| `GET /api/cuentas` | Cuentas corrientes con saldo dual |
| `GET /api/cheques` | Cheques |
| `GET /api/inversores` | Inversores con deuda en kg |
| `GET /api/mag` | Histórico de precios MAG |
| `POST /api/mag/refrescar` | Forzar nuevo scraping del MAG |
| `GET /api/presupuestos?ciclo=25/26` | Presupuestos por ciclo |
| `GET /api/informe-pdf?ciclo=25/26` | PDF anual |
| `GET /api/informe-mensual-pdf?anio=2026&mes=4` | PDF mensual |
| `GET /api/backup` | Backup CSV de transacciones |
| `GET /api/backup-completo` | Backup CSV de todas las tablas |

## Frontend

- `index.html` — Dashboard web (KPIs, tablas, chat con el bot)
- `landing.html` — Landing pública

Servirlos con cualquier static host (Vercel, Netlify, GitHub Pages) apuntando al backend mediante CORS habilitado en el server.

## Estructura DB

- `transacciones` — cada movimiento con campos `_ars` y `_kg` + `precio_mag` + `semana_mag`
- `precios_mag` — cache de precios semanales scrapeados
- `cuentas_corrientes` — proveedores
- `cheques` — emitidos/recibidos con monto dual
- `inversores` — capital y tasa indexada a kg carne
- `presupuestos` — anuales en kg carne por ciclo (marzo a febrero)

## Ciclo ganadero

Marzo a febrero del año siguiente. "Ciclo 25/26" = marzo 2025 → febrero 2026.

## Comandos del bot (ejemplos)

- `nafta 50000` → registra egreso de combustible
- `pago peón 200000` → SUELDO PEON
- `vendí novillos 5000000` → registra ingreso
- `pago a Diego 150000` → pago_proveedor
- `cheque emitido 800000 a 30 días` → nuevo_cheque
- `inversor Juan 5000000 al 8%` → nuevo_inversor (capital_ars convertido a kg)
- `precio MAG actual` → muestra el precio activo
- `resumen del mes` → totales por categoría
- `informe pdf` → genera PDF del ciclo actual
- `presupuesto combustible 2000` → 2000 kg/año para esa categoría
- `borrar #15` → elimina la transacción 15

## Licencia

Privado — uso interno.
