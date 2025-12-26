/**
 * Catch-all API route that delegates to the Hono router.
 *
 * This is needed for Vercel deployments where the Hono server adapter
 * is not used and API routes need to be handled through React Router.
 */
import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import type { RequestIdVariables } from 'hono/request-id';
import { requestId } from 'hono/request-id';
import type { Logger } from 'pino';

import { tsRestHonoApp } from '@documenso/api/hono';
import { auth } from '@documenso/auth/server';
import { API_V2_BETA_URL, API_V2_URL } from '@documenso/lib/constants/app';
import { jobsClient } from '@documenso/lib/jobs/client';
import { getIpAddress } from '@documenso/lib/universal/get-ip-address';
import { logger } from '@documenso/lib/utils/logger';
import { openApiDocument } from '@documenso/trpc/server/open-api';

import { aiRoute } from '../../../server/api/ai/route';
import { downloadRoute } from '../../../server/api/download/download';
import { filesRoute } from '../../../server/api/files/files';
import { openApiTrpcServerHandler } from '../../../server/trpc/hono-trpc-open-api';
import { reactRouterTrpcServer } from '../../../server/trpc/hono-trpc-remix';

type HonoEnv = {
  Variables: RequestIdVariables & {
    logger: Logger;
  };
};

const app = new Hono<HonoEnv>().basePath('/api');

/**
 * Rate limiting for v1 and v2 API routes only.
 */
const rateLimitMiddleware = rateLimiter({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (c) => {
    try {
      return getIpAddress(c.req.raw);
    } catch {
      return 'unknown';
    }
  },
  message: {
    error: 'Too many requests, please try again later.',
  },
});

const aiRateLimitMiddleware = rateLimiter({
  windowMs: 60 * 1000,
  limit: 3,
  keyGenerator: (c) => {
    try {
      return getIpAddress(c.req.raw);
    } catch {
      return 'unknown';
    }
  },
  message: {
    error: 'Too many requests, please try again later.',
  },
});

app.use(contextStorage());
app.use('*', requestId());
app.use(async (c, next) => {
  const honoLogger = logger.child({
    requestId: c.var.requestId,
  });

  c.set('logger', honoLogger);

  await next();
});

// Rate limits
app.use('/v1/*', rateLimitMiddleware);
app.use('/v2/*', rateLimitMiddleware);

// Auth server
app.route('/auth', auth);

// Files route
app.route('/files', filesRoute);

// AI route
app.use('/ai/*', aiRateLimitMiddleware);
app.route('/ai', aiRoute);

// API servers
app.use('/v1/*', cors());
app.route('/v1', tsRestHonoApp);
app.use('/jobs/*', jobsClient.getApiHandler());
app.use('/trpc/*', reactRouterTrpcServer);

// V2 API routes
const v2Path = API_V2_URL.replace('/api', '');
const v2BetaPath = API_V2_BETA_URL.replace('/api', '');

app.get(`${v2Path}/openapi.json`, (c) => c.json(openApiDocument));
app.use(`${v2Path}/*`, cors());
app.route(`${v2Path}`, downloadRoute);
app.use(
  `${v2Path}/*`,
  async (c) =>
    await openApiTrpcServerHandler(c, {
      isBeta: false,
    }),
);

app.get(`${v2BetaPath}/openapi.json`, (c) => c.json(openApiDocument));
app.use(`${v2BetaPath}/*`, cors());
app.route(`${v2BetaPath}`, downloadRoute);
app.use(`${v2BetaPath}/*`, async (c) => await openApiTrpcServerHandler(c, { isBeta: true }));

/**
 * Handle all API requests using Hono's fetch handler.
 */
const handleRequest = async (request: Request): Promise<Response> => {
  return app.fetch(request);
};

export const loader = async ({ request }: { request: Request }) => {
  return handleRequest(request);
};

export const action = async ({ request }: { request: Request }) => {
  return handleRequest(request);
};
