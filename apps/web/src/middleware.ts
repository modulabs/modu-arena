import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

let edgeRateLimiter: Ratelimit | null = null;

function getEdgeRateLimiter(): Ratelimit | null {
  if (edgeRateLimiter) return edgeRateLimiter;

  const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    return null;
  }

  try {
    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    edgeRateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(200, '1 m'),
      analytics: true,
      prefix: 'modu-arena:edge-ratelimit',
    });

    return edgeRateLimiter;
  } catch {
    return null;
  }
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return '127.0.0.1';
}

function rateLimitResponse(resetTime: number): NextResponse {
  return new NextResponse(
    JSON.stringify({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Reset': resetTime.toString(),
        'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
      },
    }
  );
}

function shouldSkipIntlMiddleware(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/trpc/') ||
    pathname.includes('.')
  );
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function isRateLimitExempt(pathname: string): boolean {
  return pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/cron/');
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!shouldSkipIntlMiddleware(pathname)) {
    return intlMiddleware(request);
  }

  if (isApiRoute(pathname) && !isRateLimitExempt(pathname)) {
    const rateLimiter = getEdgeRateLimiter();

    if (rateLimiter) {
      const clientIp = getClientIp(request);
      const identifier = `edge:${clientIp}`;

      try {
        const { success, reset } = await rateLimiter.limit(identifier);

        if (!success) {
          return rateLimitResponse(reset);
        }
      } catch (error) {
        console.warn('[Middleware] Edge rate limit check failed:', error);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)',
    '/(api|trpc)(.*)',
  ],
};
