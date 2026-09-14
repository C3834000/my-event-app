import { fail, handleOptions } from './lib/apiCommon.mjs';

/** JSON 404 לכל /api/* שלא ממופה — מונע נפילה ל-index.html */
export const handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;
  const path = event.path || event.rawUrl || '/api';
  return fail(404, `Unknown API route: ${path}`);
};
