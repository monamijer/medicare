// Minimal HTTP client with a cookie jar, for testing the app like a browser would.
function createClient(app) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();

  async function request(path, { method = 'GET', form, json, raw, contentType } = {}) {
    const headers = {};
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    }
    if (raw !== undefined) {
      headers['content-type'] = contentType || 'application/json';
      body = raw;
    }
    const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });
    const setCookie = res.headers.getSetCookie();
    for (const cookie of setCookie) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      const cleared = /max-age=0/i.test(cookie) || /expires=thu, 01 jan 1970/i.test(cookie);
      if (cleared) jar.delete(pair.slice(0, index));
      else jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await res.text();
    const isJson = (res.headers.get('content-type') || '').includes('json');
    return { status: res.status, location: res.headers.get('location'), setCookie, html: text, json: isJson && text ? JSON.parse(text) : null };
  }

  function close() {
    server.close();
    server.closeAllConnections();
  }

  return { request, jar, close };
}

module.exports = { createClient };
