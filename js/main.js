// PlantCare Fertilizers - Main JS

document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('hamburger-btn');
  const nav = document.getElementById('main-nav');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => nav.classList.toggle('open'));
  }

  document.querySelectorAll('[data-image-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.product-image-card');
      const image = card ? card.querySelector('.product-toggle-image') : null;
      if (!image) return;
      const isBack = image.dataset.showing === 'back';
      image.src = isBack ? image.dataset.front : image.dataset.back;
      image.dataset.showing = isBack ? 'front' : 'back';
      button.setAttribute('aria-label', isBack ? 'Show back side image' : 'Show front side image');
    });
  });

  checkDeletedProducts();
  renderCustomProducts();
  syncStoredProductsToServer();
});

async function saveProductToServer(product) {
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  });
  if (!response.ok) throw new Error('Could not save product to the shared catalogue');
  return response.json();
}

async function deleteProductFromServer(slug) {
  const response = await fetch('/api/products/' + encodeURIComponent(slug), { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error('Could not remove product from the shared catalogue');
}

async function syncStoredProductsToServer() {
  try {
    const stored = JSON.parse(localStorage.getItem('pc_custom_products') || '[]');
    const completeProducts = stored.map(product => {
      try {
        const detail = JSON.parse(localStorage.getItem('pc_product_' + product.slug) || '{}');
        return { ...product, ...detail, slug: product.slug, id: product.id };
      } catch { return product; }
    });
    await Promise.all(completeProducts.map(product => saveProductToServer(product)));
  } catch (error) {
    console.warn('Shared product catalogue sync skipped:', error);
  }
}

// Toast notification utility
function showToast(msg, duration = 3000) {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Add Product Modal functions
function openAddProductModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

function closeAddProductModal() {
  const modal = document.getElementById('add-product-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

async function handleAddNewProduct(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('new-name').value.trim();
  const badge = document.getElementById('new-badge').value.trim() || 'ORGANIC';
  const desc = document.getElementById('new-desc').value.trim();
  const mrp = document.getElementById('new-price').value.trim();
  const weight = document.getElementById('new-weight').value.trim();
  const img = document.getElementById('new-img').value.trim() || 'public/images/plantcare-logo-new.png';

  if (!name || !desc || !mrp || !weight) {
    showToast('⚠️ Please fill in all required fields!');
    return;
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const newProduct = { id: Date.now(), name, badge, desc, mrp: parseInt(mrp), weight, slug, img };

  let customProducts = [];
  try {
    const saved = localStorage.getItem('pc_custom_products');
    if (saved) customProducts = JSON.parse(saved);
  } catch(e) {}

  customProducts.push(newProduct);
  localStorage.setItem('pc_custom_products', JSON.stringify(customProducts));

  // Save product detail page entry
  localStorage.setItem('pc_product_' + slug, JSON.stringify({
    name, badge, desc, mrp, weight,
    compBase: 'PM Base Organic Manure',
    compN: '0.5%', compP: '0.5%', compK: '0.5%',
    specCn: '< 20', specPh: '6.5 – 7.5'
  }));

  try {
    await saveProductToServer(newProduct);
  } catch (error) {
    showToast('Saved on this computer, but shared catalogue sync failed.');
  }

  closeAddProductModal();
  renderCustomProducts();
  showToast('✅ New product "' + name + '" added successfully!');
}

function renderCustomProducts() {
  const grid = document.querySelector('.products-grid');
  if (!grid) return;

  let customProducts = [];
  try {
    const saved = localStorage.getItem('pc_custom_products');
    if (saved) customProducts = JSON.parse(saved);
  } catch(e) {}

  // Remove previously appended custom cards
  grid.querySelectorAll('.custom-added-card').forEach(el => el.remove());

  customProducts.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card custom-added-card';
    const isInsideSubfolder = window.location.pathname.includes('/products/');
    const imgPath = isInsideSubfolder ? (p.img.startsWith('public/') ? '../' + p.img : p.img) : p.img;
    const qBaseParams = '?slug=' + p.slug + '&name=' + encodeURIComponent(p.name) + '&mrp=' + encodeURIComponent(p.mrp) + '&weight=' + encodeURIComponent(p.weight) + '&unit=' + encodeURIComponent(p.unit || 'KG') + '&badge=' + encodeURIComponent(p.badge || 'ORGANIC') + '&desc=' + encodeURIComponent(p.desc || '');
    let qExtraParams = '';
    try {
      const savedDetail = localStorage.getItem('pc_product_' + p.slug);
      if (savedDetail) {
        const detail = JSON.parse(savedDetail);
        if (detail.compBase) qExtraParams += '&compBase=' + encodeURIComponent(detail.compBase);
        if (detail.compN) qExtraParams += '&compN=' + encodeURIComponent(detail.compN);
        if (detail.compP) qExtraParams += '&compP=' + encodeURIComponent(detail.compP);
        if (detail.compK) qExtraParams += '&compK=' + encodeURIComponent(detail.compK);
        if (detail.specCn) qExtraParams += '&specCn=' + encodeURIComponent(detail.specCn);
        if (detail.specPh) qExtraParams += '&specPh=' + encodeURIComponent(detail.specPh);
      }
    } catch(e) {}
    const qParams = qBaseParams + qExtraParams;
    const detailPath = isInsideSubfolder ? 'detail.html' + qParams : 'products/detail.html' + qParams;

    card.innerHTML = `
      <div class="card-badge">${p.badge || 'ORGANIC'}</div>
      <a href="${detailPath}">
        <div class="card-image-wrap">
          <img src="${imgPath}" alt="${p.name}" class="card-image" style="max-height:160px;object-fit:contain;" />
        </div>
      </a>
      <div class="card-body">
        <h3 class="card-title"><a href="${detailPath}" style="color:inherit;text-decoration:none;">${p.name}</a></h3>
        <p class="card-desc">${p.desc}</p>
        <div class="card-meta">
          <span class="card-price">₹${Number(p.mrp).toLocaleString()}</span>
          <span class="card-weight">${p.weight} ${p.unit || 'KG'}</span>
        </div>
      </div>
      <div class="card-actions" style="padding:10px 10px;border-top:1px solid #eee;display:flex;gap:4px;background:#FAFAFA;border-radius:0 0 12px 12px;flex-wrap:wrap;">
        <a href="${detailPath}" class="card-action-btn view-details" style="flex:1;min-width:65px;text-align:center;background:#1F5E2E;color:#fff;padding:7px 4px;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.78rem;display:inline-flex;align-items:center;justify-content:center;">Details</a>
        <button onclick="showProductQRModal('${p.name.replace(/'/g,"\\'")}', '${p.slug}', false, '${encodeURIComponent(qParams)}')" class="card-action-btn view-qr" style="flex:1;min-width:65px;text-align:center;background:#0d6efd;color:#fff;border:none;padding:7px 4px;border-radius:6px;font-weight:600;font-size:0.78rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:3px;" title="View QR Code">📷 QR</button>
        <a href="https://wa.me/917666046941?text=Hello%20PlantCare%2C%20I%20want%20to%20order%20${encodeURIComponent(p.name)}" target="_blank" class="card-action-btn card-wa" style="flex:1;min-width:65px;text-align:center;background:#25D366;color:#fff;padding:7px 4px;border-radius:6px;text-decoration:none;font-weight:600;font-size:0.78rem;display:inline-flex;align-items:center;justify-content:center;gap:3px;">📱 Order</a>
        <button onclick="deleteCustomProduct(${p.id})" class="card-action-btn delete-btn" style="flex:1;min-width:65px;text-align:center;background:#dc3545;color:#fff;border:none;padding:7px 4px;border-radius:6px;font-weight:600;font-size:0.78rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:3px;" title="Delete Product">🗑️ Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function showProductQRModal(name, slug, isStatic, encodedQParams) {
  let baseDomain = window.getPlantCareQrBaseUrl
    ? window.getPlantCareQrBaseUrl()
    : window.location.origin;

  let targetUrl = '';
  if (isStatic) {
    targetUrl = baseDomain + '/products/' + slug;
  } else if (encodedQParams) {
    const qParams = decodeURIComponent(encodedQParams);
    targetUrl = baseDomain + '/products/detail.html' + qParams;
  } else {
    targetUrl = baseDomain + '/products/detail.html?slug=' + slug;
  }

  const qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=' + encodeURIComponent(targetUrl) + '&color=1F5E2E&bgcolor=FFFFFF&margin=15';

  const modal = document.getElementById('view-qr-modal');
  const title = document.getElementById('qr-modal-title');
  const img = document.getElementById('qr-modal-img');
  const urlTxt = document.getElementById('qr-modal-url');
  const dlBtn = document.getElementById('qr-modal-download-btn');

  if (title) title.textContent = '📷 ' + name + ' — QR Code';
  if (img) img.src = qrApiUrl;
  if (urlTxt) urlTxt.textContent = targetUrl;

  if (dlBtn) {
    dlBtn.onclick = function() {
      showToast('Downloading QR code for ' + name + '...');
      fetch(qrApiUrl)
        .then(r => r.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'PlantCare-' + slug + '-QR.png';
          a.click();
          URL.revokeObjectURL(url);
          showToast('✅ QR Code downloaded!');
        }).catch(() => {
          window.open(qrApiUrl);
          showToast('Opening QR Code image...');
        });
    };
  }

  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

function closeQRModal() {
  const modal = document.getElementById('view-qr-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

async function deleteCustomProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  let customProducts = [];
  try {
    const saved = localStorage.getItem('pc_custom_products');
    if (saved) customProducts = JSON.parse(saved);
  } catch(e) {}

  const removed = customProducts.find(p => p.id === id);
  const updated = customProducts.filter(p => p.id !== id);
  localStorage.setItem('pc_custom_products', JSON.stringify(updated));
  if (removed) {
    try { await deleteProductFromServer(removed.slug); } catch (error) { console.warn(error); }
  }
  renderCustomProducts();
  showToast('🗑️ Product deleted successfully!');
}

function deleteStaticProduct(cardId, productName) {
  if (!confirm(`Are you sure you want to delete "${productName}"?`)) return;

  const card = document.getElementById(cardId);
  if (card) {
    card.style.display = 'none';
  }

  let deletedCards = [];
  try {
    const saved = localStorage.getItem('pc_deleted_cards');
    if (saved) deletedCards = JSON.parse(saved);
  } catch(e) {}

  if (!deletedCards.includes(cardId)) {
    deletedCards.push(cardId);
    localStorage.setItem('pc_deleted_cards', JSON.stringify(deletedCards));
  }

  showToast(`🗑️ "${productName}" deleted successfully!`);
}

function checkDeletedProducts() {
  let deletedCards = [];
  try {
    const saved = localStorage.getItem('pc_deleted_cards');
    if (saved) deletedCards = JSON.parse(saved);
  } catch(e) {}

  deletedCards.forEach(cardId => {
    const el = document.getElementById(cardId);
    if (el) el.style.display = 'none';
  });
}
