import fs from 'node:fs';
import path from 'node:path';
import { normalizeWhitespace, dedupeRecords } from './utils.js';

// Consolidate all per-bank JSON files into a single normalized output
async function consolidate() {
  const dataDir = path.join(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir)
    .filter((f) => /^descuentos-.*\.json$/i.test(f) && f !== 'descuentos_all.json');

  const all = [];
  for (const file of files) {
    try {
      const slug = file.replace(/^descuentos-|\.json$/g, '');
      const contents = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
      for (const r of contents) {
        all.push({
          bank: r.bank,
          bankSlug: r.bankSlug || slug,
          merchant: normalizeWhitespace(r.merchant || r.title || ''),
          title: normalizeWhitespace(r.title || ''),
          discount: r.discount || '',
          days: Array.isArray(r.days) ? r.days : [],
          category: r.category || '',
          modality: r.modality || '',
          validUntil: r.validUntil || '',
          terms: normalizeWhitespace(r.terms || ''),
          url: r.url || r.sourceUrl || '',
          sourceUrl: r.sourceUrl || r.url || '',
          scrapedAt: r.scrapedAt || new Date().toISOString(),
        });
      }
    } catch {}
  }

  const unique = dedupeRecords(all);
  const outPath = path.join(dataDir, 'descuentos_all.json');
  fs.writeFileSync(outPath, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`Consolidated ${unique.length} records from ${files.length} files → ${outPath}`);
}

consolidate();



