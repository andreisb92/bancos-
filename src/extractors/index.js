export function getExtractorForBank(slug) {
  switch (slug) {
    case 'itau':
      return extractItau;
    case 'bancoestado':
      return extractBancoEstado;
    case 'scotiabank':
      return extractScotiabank;
    case 'falabella-cmr':
      return extractFalabella;
    case 'security':
      return extractSecurity;
    case 'ripley':
      return extractRipley;
    default:
      return null;
  }
}

// --- Implementations ---

async function extractItau(page) {
  return await page.evaluate(() => {
    function pick(node, sel) { return node.querySelector(sel); }
    function text(el) { return (el?.innerText || el?.textContent || '').trim(); }
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
    const blocks = Array.from(document.querySelectorAll('article, .card, li, .grid-item'));
    const out = [];
    const pctRe = /(\d{1,2})\s?%|2x1/i;
    const catRe = /(Restaurantes|Ruta gourmet|Gourmet|Tiempo libre|Hogar|De compras|Salud y belleza|Sustentable|Viajes|Educación|Otros)/i;
    for (const n of blocks) {
      const t = norm(text(n));
      if (!pctRe.test(t)) continue;
      if (!catRe.test(t)) continue;
      const a = n.querySelector('a[href]');
      const titleEl = n.querySelector('h2,h3,h4,strong');
      const title = norm(text(titleEl)) || norm(t.split('\n')[0]);
      const m = t.match(pctRe);
      const discount = m ? (m[0].toLowerCase()==='2x1'?'2x1':`${m[1]}%`) : '';
      const category = (t.match(catRe)||[])[0] || '';
      out.push({ title, merchant: title, discount, category, terms: t, url: a?.href || location.href });
    }
    return out;
  });
}

async function extractSecurity(page) {
  return await page.evaluate(() => {
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
    const rows = Array.from(document.querySelectorAll('.views-row, .item-beneficio, article'));
    const pctRe = /(\d{1,2})\s?%|2x1/i;
    const out = [];
    for (const r of rows) {
      const title = norm((r.querySelector('h2 a, h3 a, .title a, h2, h3')?.textContent)||'');
      const t = norm(r.textContent||'');
      const m = t.match(pctRe);
      if (!title || !m) continue;
      const discount = m[0].toLowerCase()==='2x1'?'2x1':`${m[1]}%`;
      const url = r.querySelector('a[href]')?.href || location.href;
      out.push({ title, merchant: title, discount, category: /Gastr|Rest/i.test(t)?'Gastronomía':'', terms: t, url });
    }
    return out;
  });
}

async function extractRipley(page) {
  return await page.evaluate(() => {
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
    const links = Array.from(document.querySelectorAll('a[href*="/beneficio"], a[href*="beneficios"]'));
    const pctRe = /(\d{1,2})\s?%|2x1/i;
    const out = [];
    for (const a of links) {
      const t = norm(a.closest('article,li,div')?.textContent || a.textContent || '');
      const m = t.match(pctRe);
      if (!m) continue;
      const title = norm(a.textContent || t.split('\n')[0]);
      const discount = m[0].toLowerCase()==='2x1'?'2x1':`${m[1]}%`;
      out.push({ title, merchant: title, discount, category: /Rest|Gastr/i.test(t)?'Gastronomía':'', terms: t, url: a.href });
    }
    return out;
  });
}

async function extractFalabella(page) {
  // Wait a little for SPA content
  try { await page.waitForTimeout(1500); } catch {}
  return await page.evaluate(() => {
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
    const cards = Array.from(document.querySelectorAll('a[href]'))
      .filter(a => /descuento|benef/i.test(a.textContent||'') || /descuento|benef/i.test(a.href));
    const pctRe = /(\d{1,2})\s?%|2x1/i;
    const out = [];
    for (const a of cards) {
      const t = norm(a.closest('article,div,li')?.textContent || a.textContent || '');
      const m = t.match(pctRe); if(!m) continue;
      const discount = m[0].toLowerCase()==='2x1'?'2x1':`${m[1]}%`;
      const title = norm(a.textContent || t.split('\n')[0]);
      out.push({ title, merchant: title, discount, terms: t, url: a.href });
    }
    return out;
  });
}

async function extractScotiabank(page) {
  // Target only descuentos category
  try { await page.waitForTimeout(1000); } catch {}
  return await page.evaluate(() => {
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
    const containers = Array.from(document.querySelectorAll('a[href*="/categoria/mundos/"]'))
      .map(a => a.closest('article,div,li'));
    const pctRe = /(\d{1,2})\s?%|2x1/i;
    const out = [];
    const nodes = containers.length?containers:Array.from(document.querySelectorAll('article, .card, li, .grid-item'));
    for (const n of nodes) {
      const t = norm(n?.textContent||'');
      if (!/Descuentos/i.test(t)) continue;
      const m = t.match(pctRe); if(!m) continue;
      const discount = m[0].toLowerCase()==='2x1'?'2x1':`${m[1]}%`;
      const title = norm(n.querySelector('h2,h3,strong')?.textContent || t.split('\n')[0]);
      const a = n.querySelector('a[href]');
      out.push({ title, merchant: title, discount, terms: t, url: a?.href || location.href });
    }
    return out;
  });
}

async function extractBancoEstado(page) {
  try { await page.waitForTimeout(1200);} catch {}
  return await page.evaluate(() => {
    function norm(s){ return (s||'').replace(/\s+/g,' ').trim(); }
    const sections = Array.from(document.querySelectorAll('a[href]'))
      .filter(a => /Conoce más|Conoce mas/i.test(a.textContent||''));
    const pctRe = /(\d{1,2})\s?%|2x1/i;
    const out = [];
    for (const a of sections) {
      const root = a.closest('article,div,li,section');
      const t = norm(root?.textContent || a.textContent || '');
      const m = t.match(pctRe); if(!m) continue;
      const discount = m[0].toLowerCase()==='2x1'?'2x1':`${m[1]}%`;
      const title = norm(root?.querySelector('h2,h3,strong')?.textContent || t.split('\n')[0]);
      out.push({ title, merchant: title, discount, terms: t, url: a.href, category: /Sabores|Viajes|Salud|Supermercados|Hogar|Retail/i.test(t)?'Gastronomía':'' });
    }
    return out;
  });
}


