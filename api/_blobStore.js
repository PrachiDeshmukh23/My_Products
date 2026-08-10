const fs = require('fs');
const path = require('path');
const { get, list, put } = require('@vercel/blob');

const LEGACY_PRODUCTS_BLOB_PATH = 'plantcare/products.json';
const CATALOG_BLOB_PREFIX = 'plantcare/catalog/';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function requireAdminWrite(req, res) {
  const expected = process.env.ADMIN_API_TOKEN;
  const received = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];

  if (!expected) {
    sendJson(res, 503, {
      error: 'Admin cloud sync token is not configured.',
      setup: 'Set ADMIN_API_TOKEN in Vercel Environment Variables, then redeploy.'
    });
    return false;
  }

  if (!received || received !== expected) {
    sendJson(res, 401, {
      error: 'Admin cloud sync token required.',
      setup: 'Enter the Admin Cloud Sync Token in the admin panel before saving products online.'
    });
    return false;
  }

  return true;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16 * 1024 * 1024) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeImagePath(src) {
  if (!src) return '';
  const value = String(src).trim();
  if (
    value.startsWith('data:') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    return value;
  }
  const clean = value
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/^public\//, '');
  return '/' + clean;
}

function normalizeProduct(product) {
  const img = normalizeImagePath(product.img || product.imgFront || product.qrImg);
  const imgFront = normalizeImagePath(product.imgFront || img);
  const imgBack = normalizeImagePath(product.imgBack || imgFront || img);
  return {
    ...product,
    img: img || '/images/plantcare-logo-new.png',
    imgFront: imgFront || img || '/images/plantcare-logo-new.png',
    imgBack: imgBack || imgFront || img || '/images/plantcare-logo-new.png',
    unit: product.unit || 'KG',
    updatedAt: product.updatedAt || new Date().toISOString()
  };
}

function readBundledProducts() {
  try {
    const file = path.join(process.cwd(), 'data', 'products.json');
    const products = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(products) ? products.map(normalizeProduct) : [];
  } catch (error) {
    return [];
  }
}

async function readJsonBlob(urlOrPathname) {
  const result = await get(urlOrPathname, {
    access: 'public',
    useCache: false
  });
  if (!result || result.statusCode === 304 || !result.stream) return null;
  const products = await new Response(result.stream).json();
  return Array.isArray(products) ? products.map(normalizeProduct) : null;
}

async function readLatestCatalogProducts() {
  let cursor;
  let latestBlob = null;

  do {
    const page = await list({
      prefix: CATALOG_BLOB_PREFIX,
      limit: 1000,
      cursor
    });
    page.blobs.forEach(blob => {
      const blobTime = new Date(blob.uploadedAt).getTime();
      const latestTime = latestBlob ? new Date(latestBlob.uploadedAt).getTime() : -1;
      if (
        !latestBlob ||
        blobTime > latestTime ||
        (blobTime === latestTime && blob.pathname > latestBlob.pathname)
      ) {
        latestBlob = blob;
      }
    });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return latestBlob ? readJsonBlob(latestBlob.url) : null;
}

async function readBlobProducts() {
  try {
    // Each catalogue save has an immutable URL. Selecting the newest version
    // avoids stale reads caused by overwriting a CDN-cached products.json.
    const latestProducts = await readLatestCatalogProducts();
    if (latestProducts) return latestProducts;
    return await readJsonBlob(LEGACY_PRODUCTS_BLOB_PATH);
  } catch (error) {
    return null;
  }
}

async function getProducts() {
  const blobProducts = await readBlobProducts();
  if (blobProducts && blobProducts.length) return blobProducts;
  return readBundledProducts();
}

async function saveProducts(products) {
  const normalized = Array.isArray(products) ? products.map(normalizeProduct) : [];
  await put(`${CATALOG_BLOB_PREFIX}products-${Date.now()}.json`, JSON.stringify(normalized, null, 2), {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/json',
    cacheControlMaxAge: 31536000
  });
  return normalized;
}

function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

function parseDataImage(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) return null;
  const mime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Product image is too large. Please use an image below 8 MB.');
  }
  return { mime, buffer, ext: extensionForMime(mime) };
}

function mimeForExt(ext) {
  const clean = String(ext || '').toLowerCase().replace(/^\./, '');
  if (clean === 'png') return 'image/png';
  if (clean === 'webp') return 'image/webp';
  if (clean === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function localImageFile(src) {
  const value = normalizeImagePath(src);
  if (!value || value.startsWith('http') || value.startsWith('data:')) return null;
  const clean = value.replace(/^\/+/, '');
  if (!/^uploads\/|^images\//.test(clean)) return null;

  const candidates = [
    path.join(process.cwd(), 'public', clean),
    path.join(process.cwd(), clean)
  ];
  return candidates.find(file => {
    try {
      return fs.existsSync(file) && fs.statSync(file).isFile();
    } catch (error) {
      return false;
    }
  }) || null;
}

async function uploadImageIfNeeded(src, slug, side) {
  const value = String(src || '').trim();
  if (!value) return '';
  const parsed = parseDataImage(value);
  let imageBuffer = parsed ? parsed.buffer : null;
  let mime = parsed ? parsed.mime : '';
  let ext = parsed ? parsed.ext : '';

  if (!parsed) {
    const file = localImageFile(value);
    if (!file) return normalizeImagePath(value);
    imageBuffer = fs.readFileSync(file);
    ext = path.extname(file).replace(/^\./, '') || 'jpg';
    mime = mimeForExt(ext);
    if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Product image is too large. Please use an image below 8 MB.');
    }
  }

  const safeSlug = String(slug || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'product';
  const blob = await put(
    `plantcare/uploads/${safeSlug}-${side}-${Date.now()}.${ext}`,
    imageBuffer,
    {
      access: 'public',
      contentType: mime,
      addRandomSuffix: true,
      cacheControlMaxAge: 31536000
    }
  );
  return blob.url;
}

async function prepareProduct(input) {
  const name = String(input.name || 'Product').trim();
  const slug = String(input.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || Date.now()).trim();
  const uploadedFront = await uploadImageIfNeeded(input.imgFront || input.img || input.qrImg, slug, 'front');
  const uploadedBack = await uploadImageIfNeeded(input.imgBack, slug, 'back');
  const img = uploadedFront || normalizeImagePath(input.img || input.imgFront) || '/images/plantcare-logo-new.png';

  return normalizeProduct({
    ...input,
    id: input.id || Date.now(),
    name,
    slug,
    img,
    imgFront: uploadedFront || img,
    imgBack: uploadedBack || uploadedFront || img,
    updatedAt: new Date().toISOString()
  });
}

module.exports = {
  sendJson,
  requireAdminWrite,
  readJsonBody,
  getProducts,
  saveProducts,
  prepareProduct,
  normalizeProduct
};
