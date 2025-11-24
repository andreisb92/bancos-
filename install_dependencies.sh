#!/bin/bash

# Script para instalar dependencias del proyecto
# Uso: sudo ./install_dependencies.sh

set -e

echo "════════════════════════════════════════════════════════════════════════════════"
echo "📦 INSTALACIÓN DE DEPENDENCIAS - SCRAPER DE DESCUENTOS BANCARIOS"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Verificar que se ejecuta como root o con sudo
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Este script requiere permisos de administrador"
    echo "   Ejecuta: sudo ./install_dependencies.sh"
    exit 1
fi

echo "🔍 Detectando sistema operativo..."
OS="$(uname -s)"

if [ "$OS" = "Linux" ]; then
    # Detectar distribución
    if [ -f /etc/debian_version ]; then
        echo "✅ Sistema detectado: Debian/Ubuntu"
        
        echo ""
        echo "📦 Actualizando lista de paquetes..."
        apt-get update
        
        echo ""
        echo "📦 Instalando Node.js y npm..."
        # Instalar Node.js desde NodeSource (versión LTS)
        curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
        apt-get install -y nodejs
        
        echo ""
        echo "📦 Instalando dependencias adicionales para Playwright..."
        apt-get install -y \
            libnss3 \
            libnspr4 \
            libatk1.0-0 \
            libatk-bridge2.0-0 \
            libcups2 \
            libdrm2 \
            libdbus-1-3 \
            libxkbcommon0 \
            libxcomposite1 \
            libxdamage1 \
            libxfixes3 \
            libxrandr2 \
            libgbm1 \
            libasound2 \
            libatspi2.0-0 \
            libxshmfence1
        
        echo ""
        echo "📦 Instalando Python 3 y pip..."
        apt-get install -y python3 python3-pip
        
        echo ""
        echo "📦 Instalando dependencias de Python para ETL..."
        pip3 install psycopg2-binary
        
    elif [ -f /etc/redhat-release ]; then
        echo "✅ Sistema detectado: RedHat/CentOS"
        
        echo ""
        echo "📦 Instalando Node.js y npm..."
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
        yum install -y nodejs
        
        echo ""
        echo "📦 Instalando Python 3 y pip..."
        yum install -y python3 python3-pip
        
        echo ""
        echo "📦 Instalando dependencias de Python para ETL..."
        pip3 install psycopg2-binary
        
    else
        echo "⚠️  Distribución no reconocida. Instalación manual requerida."
        exit 1
    fi
else
    echo "⚠️  Sistema operativo no soportado: $OS"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "✅ VERIFICANDO INSTALACIONES"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""

# Verificar Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js instalado: $NODE_VERSION"
else
    echo "❌ Node.js no se instaló correctamente"
    exit 1
fi

# Verificar npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✅ npm instalado: $NPM_VERSION"
else
    echo "❌ npm no se instaló correctamente"
    exit 1
fi

# Verificar Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✅ Python instalado: $PYTHON_VERSION"
else
    echo "❌ Python no se instaló correctamente"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "✅ INSTALACIÓN COMPLETADA"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📝 Próximos pasos:"
echo "   1. cd CMR/crawlee"
echo "   2. npm install"
echo "   3. npx playwright install"
echo "   4. ./run_all_banks.sh"
echo ""

