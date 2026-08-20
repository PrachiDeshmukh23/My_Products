const fs = require('fs');
const path = require('path');

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
  const image = '/images/agri-power-500ml.png';
  const input = {
    id: 'agri-power-500ml',
    slug: 'agri-power-500ml',
    name: 'Agri Power (500 ML)',
    badge: 'MICRONUTRIENTS',
    desc: 'Agri Power is a micronutrient crop-nutrition formulation. It supplies iron, zinc, copper, boron and manganese to support balanced plant development.',
    mrp: 430,
    weight: 500,
    unit: 'ML',
    img: image,
    imgFront: image,
    imgBack: image,
    scans: 0,
    compositions: [
      { label: 'Iron (Fe)', value: '4.0%' },
      { label: 'Zinc (Zn)', value: '6.0%' },
      { label: 'Copper (Cu)', value: '0.5%' },
      { label: 'Boron (B)', value: '0.5%' },
      { label: 'Manganese (Mn)', value: '1.0%' },
      { label: 'Zyme & Vitamins', value: 'Q.S.' },
      { label: 'Carrier', value: 'Q.S.' }
    ],
    specifications: [
      { label: 'Pack size', value: '500 ML' },
      { label: 'MRP', value: '₹430' },
      { label: 'Nutrient support', value: 'Fe, Zn, Cu, B and Mn' },
      { label: 'Use', value: 'For agricultural use' }
    ]
  };

  const product = await store.prepareProduct(input);
  const products = await store.getProducts();
  const next = products.filter(item => item.slug !== product.slug && String(item.id) !== String(product.id));
  next.push(product);

  await store.saveProducts(next);
  fs.writeFileSync(path.join(process.cwd(), 'data', 'products.json'), JSON.stringify(next, null, 2) + '\n');

  console.log(JSON.stringify({
    slug: product.slug,
    name: product.name,
    mrp: product.mrp,
    weight: product.weight,
    unit: product.unit,
    imageStoredAt: product.imgFront,
    catalogueCount: next.length
  }));
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
