import got from 'got';
import os from 'node:os';

// Auto-whitelist current public IP in LocalProxies endpoint
// Requires env WHITELIST_URL like:
// http://amember.localproxies.com/add_ip_whitelist.php?token=...&id=35234

export async function whitelistCurrentIp() {
  const base = process.env.WHITELIST_URL;
  if (!base) return { ok: false, reason: 'Missing WHITELIST_URL' };
  try {
    // Obtain public IP via a simple service
    const ip = (await got('https://api.ipify.org')).body.trim();
    const url = `${base}&ip_address=${encodeURIComponent(ip)}`;
    const res = await got(url, { method: 'GET', timeout: { request: 10000 } });
    return { ok: true, ip, statusCode: res.statusCode, body: res.body?.slice(0, 200) };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  whitelistCurrentIp().then((r) => {
    console.log(JSON.stringify(r, null, 2));
  });
}


