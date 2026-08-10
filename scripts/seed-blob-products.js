const fs = require('fs');

function loadBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    const line = env.split(/\r?\n/).find(item => item.startsWith('BLOB_READ_WRITE_TOKEN='));
    if (!line) return;
    const raw = line.slice('BLOB_READ_WRITE_TOKEN='.length).trim();
    process.env.BLOB_READ_WRITE_TOKEN = raw.replace(/^["']|["']$/g, '');
  } catch (error) {}
}

async function main() {
  loadBlobToken();
  const products = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
  const store = require('../api/_blobStore');
  await store.saveProducts(products);
  console.log(`Uploaded a new immutable catalogue with ${products.length} products.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
