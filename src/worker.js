/**
 * worker.js
 * Serves the static landing page and injects the Apps Script Web App URL
 * via /config.js — same pattern as junk_cars_web and GuestHub. No backend
 * logic lives here; the existing junk_cars_infra Apps Script project is
 * the API for this site too (its one public action, submitOfferRequest).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/config.js') {
      const apiUrl = env.APPS_SCRIPT_URL || '';
      return new Response(`window.OFFERS_API_URL = ${JSON.stringify(apiUrl)};\n`, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
