import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALWAYS_BLOCKED = [
  'youtube.com', 'youtu.be', 'google.com', 'facebook.com', 'twitter.com', 'x.com',
  'netflix.com', 'twitch.tv', 'reddit.com', 'github.com', 'instagram.com', 'amazon.com',
  'tiktok.com'
];

function isBlockedByHeaders(response: Response): boolean {
  const xfo = (response.headers.get('x-frame-options') || '').toLowerCase();
  if (xfo.includes('deny') || xfo.includes('sameorigin')) return true;

  const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
  const match = csp.match(/frame-ancestors\s+([^;]+)/i);
  if (match) {
    const policy = match[1].trim();
    if (policy === "'none'" || policy === "'self'") return true;
  }
  return false;
}

function normalizeUrl(raw: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  const parsed = normalizeUrl(raw);
  if (!parsed) {
    return res.status(200).json({
      url: raw,
      title: raw,
      isEmbeddable: false,
      suggestTabShare: true,
      reason: 'Invalid URL format',
    });
  }

  const hostname = parsed.hostname.toLowerCase();
  if (ALWAYS_BLOCKED.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return res.status(200).json({
      url: parsed.href,
      title: hostname,
      isEmbeddable: false,
      suggestTabShare: true,
      reason: 'Protected by X-Frame-Options / CSP',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    let response = await fetch(parsed.href, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 SyncRoom-EmbedChecker' },
    });

    // Some servers reject HEAD or omit security headers on HEAD. Retry with GET.
    if (!response.ok || (!response.headers.get('x-frame-options') && !response.headers.get('content-security-policy'))) {
      response = await fetch(parsed.href, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 SyncRoom-EmbedChecker',
          Range: 'bytes=0-0',
        },
      });
    }

    const blocked = isBlockedByHeaders(response);
    clearTimeout(timeout);

    return res.status(200).json({
      url: parsed.href,
      title: hostname,
      isEmbeddable: !blocked,
      suggestTabShare: blocked,
      reason: blocked ? 'Protected by X-Frame-Options / CSP' : undefined,
    });
  } catch {
    clearTimeout(timeout);
    // Fail closed: an unknown destination must not be treated as iframe-safe.
    return res.status(200).json({
      url: parsed.href,
      title: hostname,
      isEmbeddable: false,
      suggestTabShare: true,
      reason: 'The site could not be verified for iframe embedding',
    });
  }
}
