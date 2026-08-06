// PlantCare Fertilizers - Main JS
// Hamburger menu toggle
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
});

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
