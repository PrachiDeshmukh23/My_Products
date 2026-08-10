const {
  sendJson,
  requireAdminWrite,
  readJsonBody,
  getProducts,
  saveProducts,
  prepareProduct
} = require('./_blobStore');

module.exports = async function productsApi(req, res) {
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, await getProducts());
    }

    if (req.method === 'POST') {
      if (!requireAdminWrite(req, res)) return;
      const input = await readJsonBody(req);
      const product = await prepareProduct(input);
      const products = await getProducts();
      const index = products.findIndex(
        item => item.slug === product.slug || String(item.id) === String(product.id)
      );

      if (index >= 0) products[index] = { ...products[index], ...product };
      else products.push(product);

      await saveProducts(products);
      return sendJson(res, 200, product);
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, {
      error: error.message || 'Product API failed',
      setup: 'Create/connect a Vercel Blob store so BLOB_READ_WRITE_TOKEN is available in this Vercel project.'
    });
  }
};
