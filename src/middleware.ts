import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = new URL(context.request.url);
  // Rewrite /editor/<songId> → /editor/ so the SPA island handles the ID
  if (/^\/editor\/.+/.test(pathname)) {
    return context.rewrite('/editor/');
  }
  return next();
});
