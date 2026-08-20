const fs = require('fs');
const path = require('path');

const APPROVED_SLUGS = new Set([
  'sugarcane-special',
  'onion-corn',
  'soybean-cotton',
  'crop-shakti'
]);

function loadLocalSecrets() {
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (error) {}
}

async function main() {
  loadLocalSecrets();

  const dataFile = path.join(process.cwd(), 'data', 'products.json');
  const products = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const approvedProducts = products.filter(product => APPROVED_SLUGS.has(product.slug));

  if (approvedProducts.length !== APPROVED_SLUGS.size) {
    throw new Error('The approved four products were not found. No catalogue changes were made.');
  }

  const store = require('../api/_blobStore');
  await store.saveProducts(approvedProducts);
  fs.writeFileSync(dataFile, JSON.stringify(approvedProducts, null, 2) + '\n');

  console.log(`Saved ${approvedProducts.length} approved products to the local and cloud catalogues.`);
  approvedProducts.forEach(product => console.log(`${product.slug}|${product.name}`));
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
