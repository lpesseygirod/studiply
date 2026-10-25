/**
 * http.ts
 * JSON answers and CORS for Edge Functions. The web app calls functions
 * from the browser, so every answer (errors included) carries CORS headers.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** An error the app can show as is (`error`) and act on (`code`). */
export function fail(status: number, code: string, error: string): Response {
  return json({ error, code }, status);
}
