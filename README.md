# Kbolita

Sistema automatizado de scraping y almacenamiento de resultados de lotería de Florida (Pick 3 y Pick 4). La aplicación extrae datos de sorteos diarios, los almacena en una base de datos y envía notificaciones mediante webhooks.

## 🎯 Características

- **Scraping automatizado**: Extracción de resultados de Pick 3 y Pick 4 desde el sitio oficial de Florida Lottery
- **Renderizado dinámico**: Utiliza Puppeteer para procesar contenido JavaScript
- **Almacenamiento persistente**: Guarda resultados en Supabase con detección de duplicados
- **Integración con webhooks**: Envía notificaciones a servicios externos (n8n) tras cada actualización
- **API RESTful**: Endpoints para scraping y recuperación de datos

## 🛠️ Stack Tecnológico

- **Framework**: Next.js 16.1.0
- **Runtime**: React 19.2.3
- **Base de datos**: Supabase (PostgreSQL)
- **Scraping**: Puppeteer 24.34.0, Cheerio 1.1.2
- **Bot**: Grammy 1.38.4 (Telegram)
- **Estilos**: Tailwind CSS 4

## 📋 Requisitos Previos

- Node.js 18+ 
- npm o yarn
- Cuenta de Supabase configurada
- Chromium o Google Chrome instalado en el sistema (para Puppeteer)

## 🚀 Instalación

1. Clonar el repositorio:
```bash
git clone <repository-url>
cd kbolita
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
Crear un archivo `.env.local` con las siguientes variables:

```env
SUPABASE_URL=tu_url_de_supabase
SUPABASE_SERVICE_KEY=tu_service_key_de_supabase
```

4. Ejecutar en modo desarrollo:
```bash
npm run dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000)

## 📡 API Endpoints

### `GET /api/scrape?game={PICK3|PICK4}`

Extrae los resultados más recientes del juego especificado desde el sitio web de Florida Lottery.

**Parámetros:**
- `game` (query): `PICK3` o `PICK4` (por defecto: `PICK3`)

**Respuesta:**
```json
{
  "ok": true,
  "game": "PICK3",
  "count": 2,
  "results": [
    {
      "game": "PICK3",
      "drawTime": "MIDDAY",
      "date": "2025-12-19",
      "numbers": "123",
      "fireball": "4"
    }
  ]
}
```

### `POST /api/retrieve`

Ejecuta el scraping de ambos juegos (Pick 3 y Pick 4), almacena los resultados en la base de datos y envía un webhook con el resumen.

**Respuesta:**
```json
{
  "ok": true,
  "summary": {
    "pick3": 2,
    "pick4": 2,
    "total": 4,
    "stored": 3,
    "skipped": 1
  },
  "results": [...]
}
```

## 🗄️ Estructura de Base de Datos

La tabla `games` en Supabase debe tener la siguiente estructura:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `type` | TEXT | Tipo de juego (`PICK3` o `PICK4`) |
| `draw_date` | DATE | Fecha del sorteo |
| `draw_time` | TEXT | Hora del sorteo (`MIDDAY` o `EVENING`) |
| `result` | TEXT | Números ganadores |
| `fireball` | TEXT | Número Fireball (opcional) |

**Clave única**: `(type, draw_date, draw_time)`

## 🔧 Configuración

### Puppeteer y Chromium

El sistema intenta usar Chromium del sistema antes de recurrir al empaquetado por Puppeteer. Busca en las siguientes rutas:

- `/usr/bin/chromium`
- `/usr/bin/chromium-browser`
- `/usr/bin/google-chrome`
- `/usr/bin/google-chrome-stable`

### Webhooks

El endpoint `/api/retrieve` envía automáticamente un webhook a la URL configurada en el código. Actualizar la variable `webhookUrl` en `app/api/retrieve/route.js` según sea necesario.

## 📝 Scripts Disponibles

```bash
npm run dev      # Inicia el servidor de desarrollo
npm run build    # Construye la aplicación para producción
npm run start    # Inicia el servidor de producción
npm run lint     # Ejecuta el linter
```

## 🏗️ Estructura del Proyecto

```
kbolita/
├── app/
│   ├── api/
│   │   ├── scrape/      # Endpoint de scraping
│   │   ├── retrieve/    # Endpoint de recuperación y almacenamiento
│   │   └── tgbot/       # Endpoint del bot de Telegram (en desarrollo)
│   ├── page.js          # Página principal
│   └── layout.js        # Layout de la aplicación
├── lib/
│   ├── supabase.ts      # Cliente de Supabase
│   └── tgbot.js         # Configuración del bot de Telegram
└── public/              # Archivos estáticos
```

## 🔍 Funcionamiento

1. **Scraping**: El endpoint `/api/scrape` utiliza Puppeteer para cargar la página de Florida Lottery y esperar a que el contenido dinámico (Vue.js) se renderice completamente.

2. **Parsing**: Cheerio extrae los datos estructurados (fecha, hora, números, fireball) del HTML renderizado.

3. **Almacenamiento**: El endpoint `/api/retrieve` verifica duplicados antes de insertar nuevos registros en Supabase.

4. **Notificación**: Tras almacenar los datos, se envía un webhook con el resumen de la operación.

## 🚨 Manejo de Errores

- El sistema detecta y omite resultados duplicados automáticamente
- Los errores de scraping se registran en la consola y se retornan en la respuesta JSON
- Puppeteer se configura con opciones optimizadas para entornos sin interfaz gráfica

## 📄 Licencia

Este proyecto es privado.

## 👤 Autor

Desarrollado para automatización de recolección de datos de lotería.
