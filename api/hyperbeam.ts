import type { VercelRequest, VercelResponse } from '@vercel/node';

const HYPERBEAM_API = 'https://engine.hyperbeam.com/v0/vm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.HYPERBEAM_API_KEY || process.env.HB_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Hyperbeam is not configured',
      code: 'HYPERBEAM_API_KEY_MISSING',
      message: 'Add HYPERBEAM_API_KEY to the Vercel project environment variables.',
    });
  }

  const body = (req.body || {}) as { startUrl?: string };
  const startUrl = typeof body.startUrl === 'string' && body.startUrl.trim()
    ? body.startUrl.trim()
    : 'https://duckduckgo.com/';

  try {
    const upstream = await fetch(HYPERBEAM_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        start_url: startUrl,
        kiosk: true,
        offline_timeout: 3600,
        control_disable_default: false,
        region: 'EU',
        ublock: true,
        width: 1280,
        height: 720,
        fps: 30,
        webgl: true,
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Hyperbeam session creation failed',
        details: data,
      });
    }

    return res.status(200).json({
      sessionId: data.session_id,
      embedUrl: data.embed_url,
    });
  } catch (error) {
    console.error('Hyperbeam session error:', error);
    return res.status(500).json({
      error: 'Unable to create Hyperbeam session',
    });
  }
}
