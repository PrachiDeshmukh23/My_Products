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

module.exports = async function productBySlugApi(req, res) {
  try {
    const slug = getSlug(req);
    const products = await getProducts();
    const product = products.find(item => item.slug === slug || String(item.id) === slug);

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
