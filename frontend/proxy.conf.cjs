// @ts-check
const origin = process.env.AI_GATEWAY_URL || '';
if (origin) {
  const parsed = new URL(origin);
  if (!/^https?:\/\/([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\])(:[0-9]{1,5})?$/.test(origin)
      || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('AI_GATEWAY_URL must be an http(s) origin without credentials, path, query, or fragment');
  }
}

/** @type {import('vite', { with: { 'resolution-mode': 'import' } }).ProxyOptions} */
const ai = {
  target: origin || 'http://127.0.0.1:9',
  changeOrigin: true,
  timeout: 600_000,
  proxyTimeout: 600_000,
  rewrite: (path) => path.replace(/^\/ai/, ''),
  bypass: (request, response) => {
    if (!response) return false;
    if (!origin) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'ai_gateway_unavailable' }));
      return request.url || '/';
    }
    return undefined;
  },
};

/** @type {import('vite', { with: { 'resolution-mode': 'import' } }).ProxyOptions} */
const unsupported = {
  target: 'http://127.0.0.1:9',
  bypass: (request, response) => {
    if (!response) return false;
    response.writeHead(404);
    response.end();
    return request.url || '/';
  },
};

module.exports = {
  '/api/**': { target: 'http://localhost:8002', secure: false, changeOrigin: true },
  '^/ai/api/v1/agents/[A-Za-z0-9_-]+/sessions(?:/[A-Za-z0-9_-]+(?:/(?:messages|turns))?)?(?:\\?.*)?$': ai,
  '^/ai(?:/|\\?|$)': unsupported,
};
