import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireDataManager } from '../middleware/rbac';

const router = Router();

const TARGET_URLS = Array.from(
  new Set([
    process.env.SCRAPER_HTTP_URL,
    process.env.SCRAPER_SERVICE_URL,
    'http://scraper:8000',
    'http://127.0.0.1:8000',
    'http://localhost:8000',
  ].filter(Boolean))
) as string[];

async function fetchFromScraper(path: string, options: RequestInit = {}): Promise<globalThis.Response> {
  let lastErr: any = null;
  for (const baseUrl of TARGET_URLS) {
    try {
      const controller = new AbortController();
      const timeoutMs = (options as any).timeout || 15000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return resp;
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not reach Telegram scraper service');
}

router.use(requireAuth);

// GET /api/telegram/status — Check Telegram authentication & configuration status
router.get('/status', async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const resp = await fetchFromScraper('/telegram/status', { timeout: 10000 } as any);
    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    res.json({
      is_configured: false,
      is_authorized: false,
      reason: err?.message || 'Scraper service unavailable',
    });
  }
});

// POST /api/telegram/send-code — Request OTP verification code from Telegram
router.post('/send-code', requireDataManager, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const resp = await fetchFromScraper('/telegram/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      timeout: 20000,
    } as any);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to send verification code' });
  }
});

// POST /api/telegram/verify-code — Verify OTP code & 2FA password, saving session string
router.post('/verify-code', requireDataManager, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const resp = await fetchFromScraper('/telegram/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      timeout: 30000,
    } as any);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to verify login code' });
  }
});

export default router;
