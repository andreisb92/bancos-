import fg from 'fast-glob';
import got from 'got';

export function getBanksCatalog() {
  // Slugs en minúscula y sin espacios
  return [
    {
      name: 'Banco de Chile',
      slug: 'banco-de-chile',
      domains: ['bancochile.cl', 'sitiospublicos.bancochile.cl'],
      startUrls: [
        'https://sitiospublicos.bancochile.cl/personas/beneficios',
      ],
    },
    {
      name: 'BancoEstado',
      slug: 'bancoestado',
      domains: ['bancoestado.cl'],
      startUrls: [
        'https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/todosuma---bancoestado-personas/bieneeeneficios-que-te-vienen-bien---bancoestado-personas.html#/',
      ],
      waitForSelector: '#main, .contenido, .beneficios, .listado, .grid',
    },
    {
      name: 'Banco Santander',
      slug: 'santander',
      domains: ['banco.santander.cl', 'santander.cl'],
      startUrls: [
        'https://banco.santander.cl/beneficios',
      ],
    },
    {
      name: 'BCI / Club Bci',
      slug: 'bci',
      domains: ['bci.cl', 'www.bci.cl'],
      startUrls: [
        'https://www.bci.cl/beneficios/beneficios-bci',
      ],
    },
    {
      name: 'Itaú',
      slug: 'itau',
      domains: ['itaubeneficios.cl'],
      startUrls: [
        'https://itaubeneficios.cl/beneficios/',
      ],
    },
    {
      name: 'Scotiabank',
      slug: 'scotiabank',
      domains: ['beneficios.scotiabank.cl'],
      startUrls: [
        'https://beneficios.scotiabank.cl/scclubfront/categoria/mundos/descuentos',
      ],
    },
    {
      name: 'CMR / Banco Falabella',
      slug: 'falabella-cmr',
      domains: ['bancofalabella.cl', 'www.bancofalabella.cl'],
      startUrls: [
        'https://www.bancofalabella.cl/descuentos',
      ],
    },
    {
      name: 'Banco BICE',
      slug: 'bice',
      domains: ['bice.cl', 'banco.bice.cl'],
      startUrls: [
        'https://banco.bice.cl/personas/beneficios?region=&tarjeta=&subcategorias=&tiposTarjeta=&categoriaSeleccionada=&pagina=1&ordenamiento=M%C3%A1s+reciente',
      ],
    },
    {
      name: 'Banco Ripley',
      slug: 'ripley',
      domains: ['bancoripley.cl', 'www.bancoripley.cl'],
      startUrls: [
        'https://www.bancoripley.cl/beneficios-y-promociones',
      ],
    },
    {
      name: 'Cencosud Scotiabank',
      slug: 'cencosud-scotiabank',
      domains: ['tarjetacencosud.cl', 'www.tarjetacencosud.cl'],
      startUrls: [
        'https://www.tarjetacencosud.cl/publico/beneficios/landing/inicio',
      ],
    },
    {
      name: 'Banco Security',
      slug: 'security',
      domains: ['bancosecurity.cl', 'personas.bancosecurity.cl'],
      startUrls: ['https://personas.bancosecurity.cl/beneficios'],
    },
    {
      name: 'Banco Edwards (Santander)',
      slug: 'edwards',
      domains: ['bancoedwards.cl', 'sitiospublicos.bancoedwards.cl'],
      startUrls: ['https://sitiospublicos.bancoedwards.cl/personas/beneficios'],
    },
    {
      name: 'Consorcio',
      slug: 'consorcio',
      domains: ['consorcio.cl', 'sitio.consorcio.cl'],
      startUrls: ['https://sitio.consorcio.cl/beneficios'],
    },
    {
      name: 'Banco Internacional',
      slug: 'internacional',
      domains: ['internacional.cl', 'beneficios.internacional.cl'],
      startUrls: ['https://beneficios.internacional.cl/categoria/seccioneshome/beneficios'],
    },
  ];
}

// Quick probe to find likely benefit pages. This is best-effort and safe.
export async function findCandidateBenefitPages(bank) {
  const seeds = new Set(bank.startUrls || []);
  const paths = [
    '/beneficios', '/personas/beneficios', '/beneficios/gastronomia', '/club',
    '/club/beneficios', '/descuentos', '/promociones', '/ofertas', '/entretenimiento',
  ];
  for (const domain of bank.domains) {
    for (const p of paths) {
      seeds.add(`https://${domain}${p}`);
      seeds.add(`https://www.${domain}${p}`);
    }
  }

  // Filter only URLs responding with 2xx/3xx quickly
  const alive = [];
  await Promise.all(Array.from(seeds).map(async (u) => {
    try {
      const res = await got.head(u, { followRedirect: true, timeout: { request: 5000 } });
      if (res.statusCode >= 200 && res.statusCode < 400) alive.push(res.url || u);
    } catch (e) {
      // Ignore
    }
  }));
  return Array.from(new Set(alive));
}


