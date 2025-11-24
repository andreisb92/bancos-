import { chromium } from 'playwright';

async function debugSantander() {
  console.log(`🔍 DEBUGGING SANTANDER - Analizando estructura de la página...`);

  let browser;
  let page;

  try {
    browser = await chromium.launch({
      headless: false,
      slowMo: 50,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log(`📄 Cargando página...`);
    await page.goto('https://banco.santander.cl/beneficios', { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await page.waitForTimeout(8000); // Esperar más tiempo

    // Analizar la estructura
    const analysis = await page.evaluate(() => {
      const results = {
        totalText: document.body.innerText.substring(0, 500),
        benefitCount: 0,
        pagination: {
          buttons: [],
          links: [],
          text: ''
        },
        cards: [],
        allClasses: new Set(),
        elementsWithPercent: [],
        elementsWithDcto: [],
      };

      // Buscar "256" o "Todos los beneficios"
      const headerText = document.body.innerText;
      const countMatch = headerText.match(/Todos los beneficios \((\d+)\)/i);
      if (countMatch) {
        results.benefitCount = parseInt(countMatch[1]);
      }

      // Buscar paginación
      const paginationElements = document.querySelectorAll('[class*="pagination"], [class*="Pagination"], [class*="page"], [class*="Page"]');
      paginationElements.forEach(el => {
        results.pagination.text += el.innerText + ' | ';
        Array.from(el.classList).forEach(cls => results.allClasses.add(cls));
      });

      // Buscar botones de paginación
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        const text = btn.innerText.trim();
        if (/^\d+$/.test(text) || text === '>' || text === '<' || text.toLowerCase().includes('siguiente') || text.toLowerCase().includes('anterior')) {
          results.pagination.buttons.push({
            text: text,
            classes: Array.from(btn.classList).join(' '),
            disabled: btn.disabled
          });
        }
      });

      // Buscar links de paginación
      const links = document.querySelectorAll('a');
      links.forEach(link => {
        const text = link.innerText.trim();
        if (/^\d+$/.test(text)) {
          results.pagination.links.push({
            text: text,
            href: link.href,
            classes: Array.from(link.classList).join(' ')
          });
        }
      });

      // Buscar elementos con "%" o "dcto"
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = (el.innerText || '').trim();
        if (text.length > 10 && text.length < 200) {
          if (text.includes('%') || text.includes('dcto')) {
            results.elementsWithPercent.push({
              tag: el.tagName,
              classes: Array.from(el.classList).join(' '),
              text: text.substring(0, 100)
            });
          }
        }
        
        // Recopilar todas las clases
        Array.from(el.classList).forEach(cls => results.allClasses.add(cls));
      }

      // Buscar cards de beneficios (selectores comunes)
      const cardSelectors = [
        'div[class*="card"]',
        'div[class*="Card"]',
        'div[class*="benefit"]',
        'div[class*="Benefit"]',
        'article',
        '.box',
        '[data-benefit]',
        '[data-card]',
        'li[class*="item"]',
        'div[class*="item"]'
      ];

      for (const selector of cardSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.cards.push({
            selector: selector,
            count: elements.length,
            sample: elements[0] ? {
              classes: Array.from(elements[0].classList).join(' '),
              text: (elements[0].innerText || '').substring(0, 150)
            } : null
          });
        }
      }

      return {
        ...results,
        allClasses: Array.from(results.allClasses).filter(cls => cls.length > 0).slice(0, 100)
      };
    });

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📊 ANÁLISIS DE LA PÁGINA:`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`Beneficios detectados en texto: ${analysis.benefitCount}`);
    console.log(`\n📄 PAGINACIÓN:`);
    console.log(`   Texto: ${analysis.pagination.text}`);
    console.log(`   Botones: ${analysis.pagination.buttons.length}`);
    analysis.pagination.buttons.forEach(btn => {
      console.log(`      - "${btn.text}" (${btn.classes}) ${btn.disabled ? '[DISABLED]' : ''}`);
    });
    console.log(`   Links: ${analysis.pagination.links.length}`);
    analysis.pagination.links.forEach(link => {
      console.log(`      - "${link.text}" → ${link.href}`);
    });

    console.log(`\n🃏 CARDS ENCONTRADAS:`);
    analysis.cards.forEach(card => {
      console.log(`   ${card.selector}: ${card.count} elementos`);
      if (card.sample) {
        console.log(`      Clases: ${card.sample.classes}`);
        console.log(`      Texto: ${card.sample.text}...`);
      }
    });

    console.log(`\n💯 ELEMENTOS CON "%" o "dcto" (primeros 10):`);
    analysis.elementsWithPercent.slice(0, 10).forEach((el, i) => {
      console.log(`   ${i + 1}. <${el.tag}> ${el.classes}`);
      console.log(`      ${el.text}...`);
    });

    console.log(`\n🏷️  CLASES CSS ENCONTRADAS (primeras 30):`);
    analysis.allClasses.slice(0, 30).forEach(cls => {
      console.log(`   - ${cls}`);
    });

    console.log(`\n📝 TEXTO INICIAL DE LA PÁGINA:`);
    console.log(analysis.totalText);
    console.log(`${'═'.repeat(80)}`);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    if (browser) {
      console.log(`\n⏸️  Navegador abierto para inspección manual.`);
      console.log(`   Presiona Ctrl+C para cerrar.`);
      await new Promise(() => {}); // Mantener abierto
    }
  }
}

debugSantander();
