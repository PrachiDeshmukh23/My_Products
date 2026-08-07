const http = require('http');
const fs = require('fs');
const path = require('path');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const root = __dirname;
const dataFile = path.join(root, 'data', 'products.json');
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };

function readProducts() {
  try {
    const products = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return Array.isArray(products) ? products : [];
  } catch { return []; }
}

function writeProducts(products) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(products, null, 2) + '\n');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function safeProduct(input) {
  if (!input || typeof input !== 'object') return null;
  const name = String(input.name || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!name || !slug) return null;
  return { ...input, id: input.id || Date.now(), name, slug, updatedAt: new Date().toISOString() };
}

function staticFile(urlPath) {
  let requested = decodeURIComponent(urlPath);
  if (requested === '/') requested = '/index.html';
  const rewrites = { '/products': '/products.html', '/about': '/about.html', '/contact': '/contact.html', '/products/detail': '/products/detail.html', '/products/sugarcane-special': '/products/sugarcane-special.html', '/products/onion-corn': '/products/onion-corn.html', '/products/soybean-cotton': '/products/soybean-cotton.html', '/products/crop-shakti': '/products/crop-shakti.html' };
  requested = rewrites[requested] || requested;
  let file = path.resolve(root, '.' + requested);
  // Match the clean-URL behavior previously provided by `serve.json`.
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  return file.startsWith(root + path.sep) || file === root ? file : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/products' && req.method === 'GET') return sendJson(res, 200, readProducts());
  if (pathname.startsWith('/api/products/') && req.method === 'GET') {
    const slug = decodeURIComponent(pathname.slice('/api/products/'.length));
    const product = readProducts().find(p => p.slug === slug || String(p.id) === slug);
    return product ? sendJson(res, 200, product) : sendJson(res, 404, { error: 'Product not found' });
  }
  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    const slug = decodeURIComponent(pathname.slice('/api/products/'.length));
    const products = readProducts();
    const updated = products.filter(p => p.slug !== slug && String(p.id) !== slug);
    if (updated.length === products.length) return sendJson(res, 404, { error: 'Product not found' });
    writeProducts(updated);
    return res.writeHead(204).end();
  }
  if (pathname === '/api/products' && req.method === 'POST') {
    try {
      const product = safeProduct(await readBody(req));
      if (!product) return sendJson(res, 400, { error: 'Product name and slug are required' });
      const products = readProducts();
      const index = products.findIndex(p => p.slug === product.slug || String(p.id) === String(product.id));
      if (index >= 0) products[index] = { ...products[index], ...product }; else products.push(product);
      writeProducts(products);
      return sendJson(res, 200, product);
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }

  const file = staticFile(pathname);
  if (!file) return res.end('Forbidden');
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, host, () => console.log(`PlantCare is available at http://${host}:${port}`));
