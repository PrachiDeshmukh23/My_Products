// QR codes should always use the public site, so they work from any phone.
// This avoids generating localhost or private-network URLs in printed QR codes.
window.getPlantCareQrBaseUrl = function () {
  return 'https://my-products-sepia.vercel.app';
};
