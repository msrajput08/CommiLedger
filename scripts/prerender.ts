import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { StaticRouter } from 'react-router-dom';
import { App } from '../src/App';
import { pageTitles } from '../src/pages/marketing';
const html = await readFile('dist/index.html', 'utf8');
const configured = process.env.SITE_URL;
const base = configured ? new URL(configured).origin : null;
const paths = Object.keys(pageTitles).filter(
  (p) => !['/signin', '/signup', '/reset-password'].includes(p),
);
const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
for (const path of Object.keys(pageTitles)) {
  const content = renderToString(
    createElement(StaticRouter, { location: path }, createElement(App)),
  );
  const title = `${pageTitles[path]} | CommiLedger`,
    url = base ? `${base}${path}` : null;
  const auth = ['/signin', '/signup', '/reset-password'].includes(path);
  const meta = `<meta name="prerender-path" content="${escape(path)}"/>${url ? `<link rel="canonical" href="${escape(url)}"/>` : ''}<meta property="og:title" content="${escape(title)}"/><meta property="og:type" content="website"/>${url ? `<meta property="og:url" content="${escape(url)}"/>` : ''}${!base || auth ? '<meta name="robots" content="noindex,nofollow"/>' : ''}`;
  const output = html
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`)
    .replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`)
    .replace('</head>', meta + '</head>');
  const target = path === '/' ? 'dist' : `dist${path}`;
  await mkdir(target, { recursive: true });
  await writeFile(`${target}/index.html`, output);
}
await writeFile(
  'dist/robots.txt',
  base
    ? `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /signin\nDisallow: /signup\nSitemap: ${base}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n',
);
await writeFile(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${base ? paths.map((p) => `<url><loc>${escape(base + p)}</loc></url>`).join('') : ''}</urlset>`,
);
console.log(
  `Prerendered ${Object.keys(pageTitles).length} routes. ${base ? 'Canonical host: ' + base : 'No SITE_URL configured: intentionally noindex.'}`,
);
