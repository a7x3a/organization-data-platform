import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireDataManager } from '../middleware/rbac';

const router = Router();
const SCRAPER_HTTP_URL = process.env.SCRAPER_HTTP_URL || process.env.SCRAPER_SERVICE_URL || 'http://scraper:8000';

router.use(requireAuth);

// GET /api/telegram/status — Check Telegram authentication & configuration status
router.get('/status', async (_req: Request, res: Response, _next: NextFunction) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${SCRAPER_HTTP_URL}/telegram/status`, { signal: controller.signal });
    clearTimeout(timer);
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`${SCRAPER_HTTP_URL}/telegram/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to send verification code' });
  }
});

// POST /api/telegram/verify-code — Verify OTP code & 2FA password, saving session string
router.post('/verify-code', requireDataManager, async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(`${SCRAPER_HTTP_URL}/telegram/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to verify login code' });
  }
});

export default router;
