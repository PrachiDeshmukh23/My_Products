const {
  sendJson,
  requireAdminWrite,
  getProducts,
  saveProducts
} = require('../_blobStore');

function getSlug(req) {
  if (req.query && req.query.slug) return String(req.query.slug);
  const pathname = String(req.url || '').split('?')[0];
  return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
}

function matchesProductIdentifier(product, identifier) {
  if (product.slug === identifier ||
      String(product.id) === identifier ||
      (Array.isArray(product.aliases) && product.aliases.includes(identifier))) {
    return true;
  }

  // Older Admin pages generated package QR slugs such as
  // "agri-power-500bottle500ml". Match their size and unit to the
  // canonical Agri Power product so those printed codes stay valid.
  const oldCode = String(identifier || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = String(product.name || '').toLowerCase();
  const unit = String(product.unit || '').toLowerCase();
  const packUnit = unit.includes('ml') ? 'ml' : (unit.includes('ltr') || unit === 'l' ? 'ltr' : '');
  const pack = `${String(product.weight || '').toLowerCase()}${packUnit}`;
  return name.startsWith('agri power') && oldCode.startsWith('agripower') && Boolean(pack) && oldCode.includes(pack);
}

module.exports = async function productBySlugApi(req, res) {
  try {
    const slug = getSlug(req);
    const products = await getProducts();
    const product = products.find(item => matchesProductIdentifier(item, slug));

    if (req.method === 'GET') {
      return product
        ? sendJson(res, 200, product)
        : sendJson(res, 404, { error: 'Product not found' });
    }

    if (req.method === 'DELETE') {
      if (!requireAdminWrite(req, res)) return;
      if (!product) return sendJson(res, 404, { error: 'Product not found' });
      await saveProducts(products.filter(item => item.slug !== product.slug && String(item.id) !== String(product.id)));
      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message || 'Product API failed',
      setup: 'Create/connect a Vercel Blob store so BLOB_READ_WRITE_TOKEN is available in this Vercel project.'
    });
  }
};
