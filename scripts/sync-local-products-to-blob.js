const fs = require('fs');

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
  const store = require('../api/_blobStore');
  const localProducts = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
  const cloudProducts = await store.getProducts();
  const merged = [...cloudProducts];

  for (const localProduct of localProducts) {
    const prepared = await store.prepareProduct(localProduct);
    const index = merged.findIndex(item => item.slug === prepared.slug || String(item.id) === String(prepared.id));
    if (index >= 0) merged[index] = { ...merged[index], ...prepared };
    else merged.push(prepared);
    console.log(`Synced ${prepared.slug}: ${prepared.img}`);
  }

  await store.saveProducts(merged);
  console.log(`Uploaded ${merged.length} products to Vercel Blob DB.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
