const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');

const API_BASE = 'https://api.z.ai/api/coding/paas/v4';
const STORAGE_HOST = 'firebasestorage.googleapis.com';
const ALLOWED_STORAGE_BUCKETS = new Set([
  'ebook-c74b2.firebasestorage.app',
  'ebook-c74b2.appspot.com',
]);

exports.glmProxy = onRequest(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
    secrets: ['ZAI_API_KEY'],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const apiKey = process.env.ZAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ZAI_API_KEY secret is not configured' });
      return;
    }

    try {
      const upstream = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': req.get('accept-language') || 'ko-KR,ko',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body ?? {}),
      });

      const text = await upstream.text();
      const contentType = upstream.headers.get('content-type');
      res.status(upstream.status);

      if (contentType) {
        res.set('content-type', contentType);
      }

      res.send(text);
    } catch (error) {
      logger.error('GLM proxy failed', error);
      res.status(502).json({
        error: 'Failed to reach z.ai API',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
);

exports.assetProxy = onRequest(
  {
    region: 'asia-northeast3',
    timeoutSeconds: 60,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const source = typeof req.query.src === 'string' ? req.query.src : '';
    if (!source) {
      res.status(400).json({ error: 'Missing src query' });
      return;
    }

    let parsed;
    try {
      parsed = new URL(source);
    } catch {
      res.status(400).json({ error: 'Invalid src URL' });
      return;
    }

    const isAllowedHost = parsed.hostname === STORAGE_HOST;
    const bucket = parsed.pathname.split('/')[3] || '';
    if (!isAllowedHost || !ALLOWED_STORAGE_BUCKETS.has(bucket)) {
      res.status(403).json({ error: 'Unsupported asset source' });
      return;
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          Accept: req.get('accept') || 'image/*,*/*;q=0.8',
        },
      });

      if (!upstream.ok) {
        res.status(upstream.status).send(await upstream.text());
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=3600';
      const arrayBuffer = await upstream.arrayBuffer();

      res.set('content-type', contentType);
      res.set('cache-control', cacheControl);
      res.set('Access-Control-Allow-Origin', '*');
      res.status(200).send(Buffer.from(arrayBuffer));
    } catch (error) {
      logger.error('Asset proxy failed', error);
      res.status(502).json({
        error: 'Failed to fetch asset',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
);
