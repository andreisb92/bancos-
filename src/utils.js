import { createObjectCsvWriter } from 'csv-writer';
import path from 'node:path';
import fs from 'node:fs';

export function normalizeWhitespace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export async function createCsvWriterForBank(slug) {
  // Si el slug incluye una carpeta (ej: "full/banco-slug"), crear la estructura
  const dir = path.join(process.cwd(), 'data', path.dirname(slug));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Usar el slug completo (puede incluir carpeta)
  const fileName = slug.includes('/') ? path.basename(slug) : `descuentos-${slug}`;
  const filePath = path.join(process.cwd(), 'data', slug.includes('/') ? `${slug}.csv` : `${fileName}.csv`);
  
  return createObjectCsvWriter({
    path: filePath,
    header: [
      { id: 'bank', title: 'bank' },
      { id: 'title', title: 'title' },
      { id: 'merchant', title: 'merchant' },
      { id: 'discount', title: 'discount' },
      { id: 'days', title: 'days' },
      { id: 'category', title: 'category' },
      { id: 'validUntil', title: 'valid_until' },
      { id: 'terms', title: 'terms' },
      { id: 'url', title: 'url' },
      { id: 'sourceUrl', title: 'source_url' },
      { id: 'scrapedAt', title: 'scraped_at' },
    ],
    alwaysQuote: true,
    fieldDelimiter: ',',
  });
}

export function dedupeRecords(records) {
  const seen = new Set();
  const result = [];
  for (const r of records) {
    const key = [
      (r.bankSlug || r.bank || '').toLowerCase(),
      normalizeWhitespace(r.merchant || r.title || ''),
      normalizeWhitespace(r.discount || ''),
      r.url || r.sourceUrl || '',
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(r);
    }
  }
  return result;
}

export async function writeJsonForBank(slug, items) {
  // Si el slug incluye una carpeta (ej: "full/banco-slug"), crear la estructura
  const dir = path.join(process.cwd(), 'data', path.dirname(slug));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Usar el slug completo (puede incluir carpeta)
  const fileName = slug.includes('/') ? path.basename(slug) : `descuentos-${slug}`;
  const filePath = path.join(process.cwd(), 'data', slug.includes('/') ? `${slug}.json` : `${fileName}.json`);
  
  const pretty = JSON.stringify(items, null, 2);
  await fs.promises.writeFile(filePath, pretty, 'utf-8');
  return filePath;
}

export async function writeJsonlForBank(slug, items) {
  // Crear directorio si no existe
  const dir = path.join(process.cwd(), 'data', 'jsonl');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  // Archivo JSONL individual por banco
  const jsonlPath = path.join(dir, `${slug}.jsonl`);
  const lines = items.map(item => JSON.stringify(item)).join('\n');
  await fs.promises.writeFile(jsonlPath, lines + '\n', 'utf-8');
  
  return jsonlPath;
}

export function filterValidDeals(records, bankSlug = '') {
  const out = [];
  for (const r of records) {
    const title = normalizeWhitespace(r.title || '');
    const terms = normalizeWhitespace(r.terms || '');
    const d = (r.discount || '').toString().trim().toLowerCase();
    const isPercent = /^(\d{1,2})%$/.exec(d);
    const is2x1 = d === '2x1';
    const pct = isPercent ? parseInt(isPercent[1], 10) : NaN;
    const looksValidDiscount = (is2x1 || (isPercent && pct >= 5 && pct <= 80));
    if (!looksValidDiscount) continue;
    const noise = /(error 404|cargando|acceso clientes|inicio productos|marketplace|misiones|sorteo|concurso|pesos scotia)/i;
    if (noise.test(title) || noise.test(terms)) continue;
    if (bankSlug === 'bancoestado' && /Ofertas y Descuentos Especiales/i.test(title)) continue;
    out.push(r);
  }
  return out;
}

export async function resetBankOutputs(slug) {
  const dsPath = path.join(process.cwd(), 'storage', 'datasets', `descuentos-${slug}`);
  const dataCsv = path.join(process.cwd(), 'data', `descuentos-${slug}.csv`);
  const dataJson = path.join(process.cwd(), 'data', `descuentos-${slug}.json`);
  try { fs.rmSync(dsPath, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(dataCsv, { force: true }); } catch {}
  try { fs.rmSync(dataJson, { force: true }); } catch {}
}


