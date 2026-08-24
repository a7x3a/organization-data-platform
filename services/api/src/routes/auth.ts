import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../middleware/validate';
import { loginSchema } from '../schemas/index';
import * as authService from '../services/auth.service';

const router = Router();

// POST /api/auth/login
router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body;
      const result = await authService.loginUser(username, password);

      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

      // Set refresh token as HttpOnly cookie
      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      });

      res.json({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token', code: 'NO_REFRESH_TOKEN' });
      return;
    }

    const result = await authService.refreshAccessToken(refreshToken);

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

    // Refresh sliding session cookie
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refresh_token', { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

export default router;
