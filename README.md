# 🏦 Scraper de Descuentos Bancarios - Chile

Sistema de scraping para extraer ofertas y descuentos de los principales bancos chilenos usando Playwright y Crawlee.

## 🚀 Instalación

```bash
npm install
npx playwright install
```

## 📋 Uso

### Ejecutar todos los scrapers exitosos (Recomendado)

**En Linux/Mac:**
```bash
chmod +x run_all_banks.sh
./run_all_banks.sh
```

**En Windows (Git Bash o WSL):**
```bash
bash run_all_banks.sh
```

**O usando npm directamente:**
```bash
npm run runAllWorking
npm run consolidateJsonl
```

Esto ejecutará los scrapers de:
- Banco Santander
- Banco de Chile
- BancoEstado
- CMR / Banco Falabella

### Ejecutar scrapers individuales

```bash
# Santander
npm run santanderV7Categories

# Banco de Chile
npm run bancoChileV2Categories

# BancoEstado
npm run bancoEstadoV3

# Falabella
npm run falabellaComplete

# Ripley
npm run bancoRipleyV1
```

### Consolidar resultados JSONL

```bash
npm run consolidateJsonl
```

Esto creará:
- `data/descuentos_all.jsonl` - Archivo consolidado en formato JSONL
- `data/descuentos_all.json` - Archivo consolidado en formato JSON

## 📁 Estructura del Proyecto

```
src/
├── scrapers_playwright/    # Scrapers individuales por banco
├── utils.js                 # Utilidades compartidas
├── extractor_final.js       # Extractores de datos
└── banks.js                 # Catálogo de bancos

data/
├── jsonl/                   # Archivos JSONL individuales por banco
└── descuentos_all.jsonl     # Archivo consolidado
```

## 📊 Formato de Datos

Cada oferta incluye:
- `title` - Título de la oferta
- `merchant` - Comercio/empresa
- `discount` - Descuento (ej: "40% Sin Tope")
- `category` - Categoría (Gastronomía, Viajes, etc.)
- `days` - Días válidos (array)
- `terms` - Términos y condiciones
- `imageUrl` - URL de la imagen
- `linkUrl` - URL del descuento
- `url` - URL de origen
- `bankSlug` - Slug del banco

## 🔧 Scripts Disponibles

- `runAllWorking` - Ejecuta todos los scrapers exitosos
- `consolidateJsonl` - Consolida todos los JSONL en uno
- `santanderV7Categories` - Scraper de Santander con categorías
- `bancoChileV2Categories` - Scraper de Banco de Chile con categorías
- `bancoEstadoV3` - Scraper de BancoEstado
- `falabellaComplete` - Scraper completo de Falabella
- `bancoRipleyV1` - Scraper de Ripley

## 📝 Notas

- Los archivos de datos (CSV, JSON, JSONL) están excluidos del repositorio por tamaño
- Los resultados se guardan en `data/jsonl/` como archivos individuales por banco
- El script de consolidación combina todos los JSONL en un solo archivo
