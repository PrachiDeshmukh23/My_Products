const {
  sendJson,
  readJsonBody,
  hasValidAdminSession,
  hasValidAdminCredentials,
  setAdminSession,
  clearAdminSession
} = require('../_blobStore');

module.exports = async function adminSessionApi(req, res) {
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { authenticated: hasValidAdminSession(req) });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '').trim();

      if (!hasValidAdminCredentials(username, password)) {
        return sendJson(res, 401, { error: 'Invalid username or password.' });
      }

      if (!setAdminSession(req, res, username)) {
        return sendJson(res, 503, { error: 'Admin session is not configured.' });
      }

      return sendJson(res, 200, { authenticated: true });
    }

    if (req.method === 'DELETE') {
      clearAdminSession(req, res);
      return sendJson(res, 200, { authenticated: false });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, { error: 'Admin session request failed.' });
  }
};
