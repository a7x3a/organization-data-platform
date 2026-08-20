import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../config/prisma';

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

// GET /api/telegram/status — Check Telegram authentication & configuration status for current user
router.get('/status', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const userSession = await prisma.userTelegramSession.findUnique({
      where: { userId },
    });

    if (userSession && userSession.isVerified && userSession.sessionString) {
      return res.json({
        is_configured: true,
        is_authorized: true,
        is_user_session: true,
        phone_number: userSession.phoneNumber,
        last_verified_at: userSession.lastVerifiedAt,
      });
    }

    // Check system/scraper status as fallback
    try {
      const resp = await fetchFromScraper('/telegram/status', { timeout: 8000 } as any);
      const data = (await resp.json()) as Record<string, unknown>;
      return res.json({
        ...data,
        is_user_session: false,
      });
    } catch {
      return res.json({
        is_configured: false,
        is_authorized: false,
        is_user_session: false,
      });
    }
  } catch (err: any) {
    res.json({
      is_configured: false,
      is_authorized: false,
      reason: err?.message || 'Scraper service unavailable',
    });
  }
});

// POST /api/telegram/send-code — Request OTP verification code from Telegram
router.post('/send-code', async (req: Request, res: Response, _next: NextFunction) => {
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

// POST /api/telegram/verify-code — Verify OTP code & 2FA password, saving session string to user's profile
router.post('/verify-code', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const resp = await fetchFromScraper('/telegram/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      timeout: 30000,
    } as any);
    const data = (await resp.json()) as any;

    if (resp.status === 200 && data.session_string) {
      // Save session to current user's record in PostgreSQL
      await prisma.userTelegramSession.upsert({
        where: { userId },
        create: {
          userId,
          sessionString: data.session_string,
          phoneNumber: req.body.phone_number || data.phone_number,
          apiId: req.body.api_id ? parseInt(req.body.api_id, 10) : undefined,
          apiHash: req.body.api_hash,
          isVerified: true,
          lastVerifiedAt: new Date(),
        },
        update: {
          sessionString: data.session_string,
          phoneNumber: req.body.phone_number || data.phone_number,
          apiId: req.body.api_id ? parseInt(req.body.api_id, 10) : undefined,
          apiHash: req.body.api_hash,
          isVerified: true,
          lastVerifiedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'telegram.session_verified',
          entityType: 'UserTelegramSession',
          entityId: userId,
        },
      });
    }

    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to verify login code' });
  }
});

// POST /api/telegram/disconnect — Disconnect Telegram session for current user
router.post('/disconnect', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    await prisma.userTelegramSession.deleteMany({
      where: { userId },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'telegram.session_disconnected',
        entityType: 'UserTelegramSession',
        entityId: userId,
      },
    });

    res.json({ success: true, message: 'Telegram session disconnected' });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to disconnect session' });
  }
});

export default router;
