/**
 * Catch-all API route that delegates to the Hono router.
 *
 * This is needed for Vercel deployments where the Hono server adapter
 * is not used and API routes need to be handled through React Router.
 */
import { handleApiRequest } from '~/lib/api-handler.server';

export const loader = async ({ request }: { request: Request }) => {
  return await handleApiRequest(request);
};

export const action = async ({ request }: { request: Request }) => {
  return await handleApiRequest(request);
};
