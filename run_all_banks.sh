#!/bin/bash

# Script para ejecutar todos los scrapers de bancos exitosos
# Autor: Scraper de Descuentos Bancarios Chile
# Fecha: $(date +%Y-%m-%d)

set -e  # Salir si hay algún error

echo "════════════════════════════════════════════════════════════════════════════════"
echo "🏦 SCRAPER DE DESCUENTOS BANCARIOS - CHILE"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "📅 $(date '+%d-%m-%Y, %H:%M:%S')"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: No se encontró package.json"
    echo "   Por favor, ejecuta este script desde el directorio CMR/crawlee"
    exit 1
fi

# Verificar que Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado"
    exit 1
fi

# Verificar que npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm no está instalado"
    exit 1
fi

echo "✅ Verificaciones completadas"
echo ""

# Crear directorio de datos si no existe
mkdir -p data/jsonl

echo "🚀 Ejecutando todos los scrapers exitosos..."
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Ejecutar todos los scrapers
npm run runAllWorking

# Verificar si hubo errores
if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  Algunos scrapers fallaron, pero continuando con la consolidación..."
fi

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "📦 Consolidando resultados..."
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Consolidar todos los JSONL
npm run consolidateJsonl

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "🔄 Ejecutando ETL (Extracción, Transformación y Carga)..."
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Verificar que Python está instalado
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "⚠️  Python no está instalado. Saltando ETL..."
else
    # Usar python3 si está disponible, sino python
    PYTHON_CMD="python3"
    if ! command -v python3 &> /dev/null; then
        PYTHON_CMD="python"
    fi
    
    # Verificar que el archivo ETL existe
    if [ -f "data/etl-bank-discounts.py" ]; then
        # Verificar que existe el archivo consolidado
        if [ -f "data/descuentos_all.jsonl" ]; then
            echo "✅ Ejecutando ETL con archivo consolidado: data/descuentos_all.jsonl"
            $PYTHON_CMD data/etl-bank-discounts.py data/descuentos_all.jsonl
            
            if [ $? -eq 0 ]; then
                echo "✅ ETL completado exitosamente"
            else
                echo "⚠️  El ETL terminó con errores, pero el proceso continúa"
            fi
        else
            echo "⚠️  No se encontró el archivo data/descuentos_all.jsonl"
            echo "   El ETL necesita el archivo consolidado para ejecutarse"
        fi
    else
        echo "⚠️  No se encontró el archivo data/etl-bank-discounts.py"
        echo "   Saltando ejecución del ETL..."
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "✅ PROCESO COMPLETADO"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📁 Archivos generados:"
echo "   - data/jsonl/*.jsonl (archivos individuales por banco)"
echo "   - data/descuentos_all.jsonl (archivo consolidado)"
echo "   - data/descuentos_all.json (archivo consolidado JSON)"
echo ""
echo "📊 Para ver el resumen de ofertas:"
echo "   cat data/descuentos_all.jsonl | wc -l"
echo ""

