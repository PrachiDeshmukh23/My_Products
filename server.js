const http = require('http');
const fs = require('fs');
const path = require('path');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const root = __dirname;
const dataFile = path.join(root, 'data', 'products.json');
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' };

function loadLocalSecrets() {
  try {
    const envFile = path.join(root, '.env.local');
    if (fs.existsSync(envFile)) {
      fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match || process.env[match[1]]) return;
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
      });
    }
    const tokenFile = path.join(root, '.admin-cloud-token.txt');
    if (!process.env.ADMIN_API_TOKEN && fs.existsSync(tokenFile)) {
      process.env.ADMIN_API_TOKEN = fs.readFileSync(tokenFile, 'utf8').trim();
    }
  } catch(e) {}
}

loadLocalSecrets();

let cloudStore = null;
try { cloudStore = require('./api/_blobStore'); } catch(e) {}

function readProducts() {
  try {
    const products = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return Array.isArray(products) ? products : [];
  } catch { return []; }
}

function matchesProductIdentifier(product, identifier) {
  return product.slug === identifier ||
    String(product.id) === identifier ||
    (Array.isArray(product.aliases) && product.aliases.includes(identifier));
}

async function readSharedProducts() {
  if (cloudStore && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const products = await Promise.race([
        cloudStore.getProducts(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud catalogue timeout')), 5000))
      ]);
      if (Array.isArray(products) && products.length) return products;
    } catch(e) {}
  }
  return readProducts();
}

function getAdminHeaderToken(req) {
  return String(req.headers['x-admin-token'] || '').trim();
}

function hasValidAdminToken(req) {
  if (cloudStore && typeof cloudStore.hasValidAdminSession === 'function' && cloudStore.hasValidAdminSession(req)) {
    return true;
  }
  return Boolean(process.env.ADMIN_API_TOKEN && getAdminHeaderToken(req) === process.env.ADMIN_API_TOKEN);
}

async function saveCloudProduct(rawProduct) {
  if (!cloudStore || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  const cloudProduct = await cloudStore.prepareProduct(rawProduct);
  const products = await cloudStore.getProducts();
  const index = products.findIndex(p => p.slug === cloudProduct.slug || String(p.id) === String(cloudProduct.id));
  if (index >= 0) products[index] = { ...products[index], ...cloudProduct }; else products.push(cloudProduct);
  await cloudStore.saveProducts(products);
  return cloudProduct;
}

async function deleteCloudProduct(slug) {
  if (!cloudStore || !process.env.BLOB_READ_WRITE_TOKEN) return;
  const products = await cloudStore.getProducts();
  const product = products.find(p => p.slug === slug || String(p.id) === slug);
  if (!product) return;
  await cloudStore.saveProducts(products.filter(p => p.slug !== product.slug && String(p.id) !== String(product.id)));
}

function writeProducts(products) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(products, null, 2) + '\n');
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 15_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function saveBase64Image(dataUrl, slug, suffix = 'front') {
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return dataUrl;
  try {
    const uploadsDir = path.join(root, 'public', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const matches = String(dataUrl).match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) return dataUrl;
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const filename = `${slug}-${suffix}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving base64 image:', err);
    return dataUrl;
  }
}

let sharp = null;
try { sharp = require('sharp'); } catch(e) {}

async function generateMicroQrImageDataUrl(imgSource) {
  if (!imgSource) return '';
  try {
    let buf = null;
    const str = String(imgSource).trim();
    if (str.startsWith('data:image/')) {
      const matches = str.match(/^data:image\/[a-zA-Z0-9]+;base64,(.+)$/);
      if (matches) buf = Buffer.from(matches[1], 'base64');
    } else {
      const cleanPath = str.replace(/^(\.\.\/)+/, '');
      const fullPath = path.join(root, cleanPath);
      if (fs.existsSync(fullPath)) buf = fs.readFileSync(fullPath);
    }
    if (!buf) return '';
    if (sharp) {
      const resizedBuf = await sharp(buf)
        .resize(56, 56, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 20 })
        .toBuffer();
      return 'data:image/webp;base64,' + resizedBuf.toString('base64');
    }
  } catch(e) {}
  return '';
}

async function safeProductAsync(input) {
  if (!input || typeof input !== 'object') return null;
  const name = String(input.name || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!name || !slug) return null;

  const rawImg = input.img || input.imgFront;
  let qrImg = input.qrImg || '';
  if (!qrImg && rawImg) {
    qrImg = await generateMicroQrImageDataUrl(rawImg);
  }

  let img = input.img ? saveBase64Image(input.img, slug, 'main') : input.img;
  let imgFront = input.imgFront ? saveBase64Image(input.imgFront, slug, 'front') : input.imgFront;
  let imgBack = input.imgBack ? saveBase64Image(input.imgBack, slug, 'back') : input.imgBack;

  if (!img && imgFront) img = imgFront;
  if (!imgFront && img) imgFront = img;

  return {
    ...input,
    id: input.id || Date.now(),
    name,
    slug,
    img,
    imgFront,
    imgBack,
    qrImg: qrImg || input.qrImg || (img && img.length < 2400 ? img : ''),
    updatedAt: new Date().toISOString()
  };
}

function staticFile(urlPath) {
  let requested = decodeURIComponent(urlPath);
  if (requested === '/') requested = '/index.html';
  if (requested.startsWith('/images/') || requested.startsWith('/uploads/')) {
    requested = '/public' + requested;
  }
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

  if (pathname === '/api/admin/session') {
    if (!cloudStore) return sendJson(res, 503, { error: 'Admin session is not available.' });
    if (req.method === 'GET') {
      return sendJson(res, 200, { authenticated: cloudStore.hasValidAdminSession(req) });
    }
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (!cloudStore.hasValidAdminCredentials(body.username, body.password)) {
          return sendJson(res, 401, { error: 'Invalid username or password.' });
        }
        if (!cloudStore.setAdminSession(req, res, body.username)) {
          return sendJson(res, 503, { error: 'Admin session is not configured.' });
        }
        return sendJson(res, 200, { authenticated: true });
      } catch (error) {
        return sendJson(res, 400, { error: 'Login could not be completed.' });
      }
    }
    if (req.method === 'DELETE') {
      cloudStore.clearAdminSession(req, res);
      return sendJson(res, 200, { authenticated: false });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (pathname === '/api/products' && req.method === 'GET') return sendJson(res, 200, await readSharedProducts());
  if (pathname.startsWith('/api/products/') && req.method === 'GET') {
    const slug = decodeURIComponent(pathname.slice('/api/products/'.length));
    const product = (await readSharedProducts()).find(p => matchesProductIdentifier(p, slug));
    return product ? sendJson(res, 200, product) : sendJson(res, 404, { error: 'Product not found' });
  }
  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    if (!hasValidAdminToken(req)) return sendJson(res, 401, { error: 'Admin login is required' });
    const slug = decodeURIComponent(pathname.slice('/api/products/'.length));
    if (!cloudStore || !process.env.BLOB_READ_WRITE_TOKEN) {
      return sendJson(res, 503, { error: 'Cloud product storage is not configured' });
    }
    try { await deleteCloudProduct(slug); } catch(error) { return sendJson(res, 500, { error: error.message }); }
    return res.writeHead(204).end();
  }
  if (pathname === '/api/products' && req.method === 'POST') {
    try {
      const rawProduct = await readBody(req);
      if (!hasValidAdminToken(req)) return sendJson(res, 401, { error: 'Admin login is required' });
      if (!cloudStore || !process.env.BLOB_READ_WRITE_TOKEN) {
        return sendJson(res, 503, { error: 'Cloud product storage is not configured' });
      }
      const product = await saveCloudProduct(rawProduct);
      if (!product) return sendJson(res, 400, { error: 'Product name and slug are required' });
      return sendJson(res, 200, product);
    } catch (error) { return sendJson(res, 400, { error: error.message }); }
  }

  const file = staticFile(pathname);
  if (!file) return res.end('Forbidden');
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return res.writeHead(404).end('Not found');
    const isHtml = path.extname(file).toLowerCase() === '.html';
    const isAdminPage = isHtml && (pathname === '/admin' || pathname.startsWith('/admin/'));
    const headers = {
      'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': isAdminPage
        ? 'private, no-store, no-cache, max-age=0, must-revalidate'
        : (isHtml ? 'no-store, no-cache, max-age=0, must-revalidate' : 'public, max-age=3600')
    };
    if (isAdminPage) {
      headers.Pragma = 'no-cache';
      headers.Expires = '0';
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, host, () => console.log(`PlantCare is available at http://${host}:${port}`));
