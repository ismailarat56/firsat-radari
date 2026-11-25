import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Request, Response, RequestHandler } from 'express';
import type { DB } from '../db/database';
import { AppError } from '../errors';
import type { SessionInfo } from '../../../../packages/shared/src/contracts';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const constantEqual = (a: string, b: string) => {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
export function createAuth(
  db: DB,
  options: {
    demo: boolean;
    pairingCode?: string;
    now: () => Date;
    allowedOrigins: string[];
    onPairingCode?: (code: string) => void;
  },
) {
  let code = options.pairingCode || String(randomInt(10_000_000, 99_999_999));
  let codeHash: string | null = hash(code);
  let codeExpires = options.now().getTime() + 10 * 60_000;
  function rotateCode() {
    code = String(randomInt(10_000_000, 99_999_999));
    codeHash = hash(code);
    codeExpires = options.now().getTime() + 10 * 60_000;
    attempts.clear();
    options.onPairingCode?.(code);
    return code;
  }
  const attempts = new Map<string, { count: number; until: number }>();
  const hosts = new Set(options.allowedOrigins.map((o) => new URL(o).host));
  const boundary: RequestHandler = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    );
    if (!hosts.has(req.headers.host || ''))
      return next(new AppError('HOST_REJECTED', 'Bu sunucu adresine izin verilmiyor.', 403));
    const origin = req.get('Origin');
    if (origin && !options.allowedOrigins.includes(origin))
      return next(new AppError('ORIGIN_REJECTED', 'İstek kaynağına izin verilmiyor.', 403));
    next();
  };
  function get(req: Request) {
    const match = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('fr_session='));
    if (!match) return;
    const token = match.slice('fr_session='.length);
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    return db
      .prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?')
      .get(hash(token), options.now().toISOString()) as
      { token_hash: string; csrf_token: string; expires_at: string } | undefined;
  }
  const protect: RequestHandler = (req, _res, next) => {
    const session = get(req);
    if (!session)
      return next(
        new AppError('UNAUTHENTICATED', 'Devam etmek için bu tarayıcıyı eşleştirin.', 401),
      );
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.get('Origin'))
      return next(new AppError('ORIGIN_REQUIRED', 'Değişiklik isteğinde aynı köken gerekli.', 403));
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !constantEqual(req.get('X-CSRF-Token') || '', session.csrf_token)
    )
      return next(
        new AppError('CSRF_REJECTED', 'Oturum doğrulaması geçersiz. Sayfayı yenileyin.', 403),
      );
    next();
  };
  function info(req: Request): SessionInfo {
    const session = get(req);
    if (!session && !options.demo && (!codeHash || options.now().getTime() >= codeExpires))
      rotateCode();
    return session
      ? {
          authenticated: true,
          demo: options.demo,
          csrfToken: session.csrf_token,
          expiresAt: session.expires_at,
        }
      : { authenticated: false, demo: options.demo };
  }
  function login(req: Request, res: Response) {
    if (!req.get('Origin'))
      throw new AppError('ORIGIN_REQUIRED', 'Eşleştirme için aynı köken gerekli.', 403);
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(options.now().getTime() + 7 * 86400_000).toISOString();
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), csrfToken, expiresAt);
    res.cookie('fr_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      path: '/',
      maxAge: 7 * 86400_000,
    });
    res.json({ authenticated: true, demo: options.demo, csrfToken, expiresAt });
  }
  function pair(req: Request, res: Response) {
    const ip = req.socket.remoteAddress || 'local';
    const now = options.now().getTime();
    const previous = attempts.get(ip);
    const state = previous && previous.until > now ? previous : { count: 0, until: now + 60_000 };
    state.count++;
    attempts.set(ip, state);
    if (state.count > 5)
      throw new AppError(
        'RATE_LIMITED',
        'Çok fazla deneme. Bir dakika sonra yeniden deneyin.',
        429,
      );
    if (
      !codeHash ||
      now >= codeExpires ||
      typeof req.body?.code !== 'string' ||
      !constantEqual(hash(req.body.code), codeHash)
    )
      throw new AppError(
        'PAIRING_INVALID',
        'Eşleştirme kodu geçersiz, kullanılmış veya süresi dolmuş.',
        401,
      );
    codeHash = null;
    login(req, res);
  }
  function logout(req: Request, res: Response) {
    const session = get(req);
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);
    res.clearCookie('fr_session', {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: req.secure,
    });
    if (!options.demo) rotateCode();
    res.status(204).end();
  }
  return {
    boundary,
    protect,
    info,
    pair,
    login,
    logout,
    rotateCode,
    get pairingCode() {
      return code;
    },
  };
}
