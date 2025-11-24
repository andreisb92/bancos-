import playwright from 'playwright';

async function debugFalabella() {
  console.log('🔍 DEBUGGING FALABELLA - Analizando estructura de la página...\n');
  
  const browser = await playwright.chromium.launch({
    headless: false,
    slowMo: 100,
  });
  
  const page = await browser.newPage();
  
  await page.goto('https://www.bancofalabella.cl/descuentos', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  
  console.log('✅ Página cargada\n');
  
  // Esperar y hacer scroll
  await page.waitForTimeout(5000);
  
  console.log('📊 Analizando elementos en la página...\n');
  
  // Obtener información de TODOS los elementos posibles
  const analysis = await page.evaluate(() => {
    const results = {
      totalElements: 0,
      bySelector: {},
      byClass: {},
      sampleTexts: [],
      allClasses: new Set(),
    };
    
    // Probar diferentes selectores
    const selectors = [
      'div[class*="card"]',
      'div[class*="Card"]',
      'div[class*="discount"]',
      'div[class*="Discount"]',
      'div[class*="benefit"]',
      'div[class*="Benefit"]',
      'div[class*="offer"]',
      'div[class*="Offer"]',
      'div[class*="promo"]',
      'div[class*="item"]',
      'div[class*="Item"]',
      'article',
      '.card',
      '[class*="descuento"]',
      '[class*="oferta"]',
    ];
    
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.bySelector[selector] = elements.length;
          
          // Obtener clases de los primeros 3 elementos
          if (elements.length > 0 && !results.byClass[selector]) {
            results.byClass[selector] = [];
            for (let i = 0; i < Math.min(3, elements.length); i++) {
              const el = elements[i];
              results.byClass[selector].push({
                className: el.className,
                tagName: el.tagName,
                textLength: (el.innerText || '').length,
                textPreview: (el.innerText || '').substring(0, 100),
              });
              
              // Guardar todas las clases
              if (el.className) {
                el.className.split(' ').forEach(cls => {
                  if (cls) results.allClasses.add(cls);
                });
              }
            }
          }
        }
      } catch (e) {}
    }
    
    // Buscar elementos con texto que contenga "%"
    const allDivs = document.querySelectorAll('div');
    let divsWithPercent = 0;
    for (const div of allDivs) {
      const text = div.innerText || '';
      if (text.includes('%') && text.length > 10 && text.length < 500) {
        divsWithPercent++;
        if (results.sampleTexts.length < 5) {
          results.sampleTexts.push({
            className: div.className,
            text: text.substring(0, 150),
          });
        }
      }
    }
    
    results.totalElements = allDivs.length;
    results.divsWithPercent = divsWithPercent;
    results.allClasses = Array.from(results.allClasses);
    
    return results;
  });
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 ANÁLISIS DE LA PÁGINA:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total de elementos DIV: ${analysis.totalElements}`);
  console.log(`DIVs con símbolo "%": ${analysis.divsWithPercent}`);
  console.log('\n📋 ELEMENTOS POR SELECTOR:');
  console.log('───────────────────────────────────────────────────────────');
  
  for (const [selector, count] of Object.entries(analysis.bySelector)) {
    console.log(`${selector}: ${count} elementos`);
  }
  
  console.log('\n🏷️  CLASES ENCONTRADAS (primeras 20):');
  console.log('───────────────────────────────────────────────────────────');
  analysis.allClasses.slice(0, 20).forEach(cls => console.log(`  - ${cls}`));
  
  console.log('\n📝 MUESTRAS DE TEXTO CON "%":');
  console.log('───────────────────────────────────────────────────────────');
  analysis.sampleTexts.forEach((sample, i) => {
    console.log(`\n${i + 1}. Clase: ${sample.className}`);
    console.log(`   Texto: ${sample.text}...`);
  });
  
  console.log('\n🔍 DETALLES DE ELEMENTOS POR SELECTOR:');
  console.log('───────────────────────────────────────────────────────────');
  for (const [selector, details] of Object.entries(analysis.byClass)) {
    if (details && details.length > 0) {
      console.log(`\n${selector}:`);
      details.forEach((detail, i) => {
        console.log(`  ${i + 1}. Tag: ${detail.tagName}, Clase: ${detail.className}`);
        console.log(`     Longitud texto: ${detail.textLength} chars`);
        console.log(`     Preview: ${detail.textPreview}...`);
      });
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('⏸️  Navegador abierto para inspección manual.');
  console.log('   Presiona Ctrl+C para cerrar.');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Mantener el navegador abierto para inspección manual
  await new Promise(() => {});
}

debugFalabella().catch(console.error);
