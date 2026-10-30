/**
 * ScrollTax Zero-Knowledge Cloud Sync Worker (Cloudflare Workers)
 *
 * Free serverless sync backend for syncing rules, schedules, and daily limits
 * across Opera GX, Vivaldi, Firefox, Chrome, and Edge without accounts or logins.
 *
 * All payloads are client-side encrypted via AES-GCM before reaching this worker.
 * The server only sees encrypted ciphertext blobs.
 *
 * Setup Instructions:
 * 1. Create a free Cloudflare account at https://workers.cloudflare.com
 * 2. Create a new Worker (e.g. "scrolltax-sync")
 * 3. In Cloudflare Dashboard -> Storage & Databases -> KV, create a namespace named "SCROLLTAX_KV"
 * 4. In Worker Settings -> Variables -> KV Namespace Bindings, bind "SCROLLTAX_KV" to your namespace
 * 5. Paste this file into the Worker editor and click "Deploy".
 * 6. Copy your worker URL (e.g. https://scrolltax-sync.yourname.workers.dev/sync) into ScrollTax Options.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
};

// In-memory fallback if KV binding is not yet attached
const MEMORY_CACHE = new Map();

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "" || path === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "ScrollTax Cloud Sync Worker",
          kvAttached: Boolean(env?.SCROLLTAX_KV),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const syncMatch = path.match(/^\/sync\/([a-zA-Z0-9_-]+)$/);
    if (!syncMatch) {
      return new Response(JSON.stringify({ error: "Invalid path. Use /sync/<keyId>" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keyId = syncMatch[1];

    if (request.method === "GET") {
      let dataStr = null;
      if (env?.SCROLLTAX_KV) {
        dataStr = await env.SCROLLTAX_KV.get(keyId);
      } else {
        dataStr = MEMORY_CACHE.get(keyId) || null;
      }

      if (!dataStr) {
        return new Response(JSON.stringify({ error: "Record not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(dataStr, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();
        if (!body.iv || !body.ciphertext) {
          return new Response(JSON.stringify({ error: "Missing iv or ciphertext" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const dataStr = JSON.stringify({
          iv: body.iv,
          ciphertext: body.ciphertext,
          updatedAt: body.updatedAt || Date.now(),
        });

        if (env?.SCROLLTAX_KV) {
          // Cloudflare KV free tier retention
          await env.SCROLLTAX_KV.put(keyId, dataStr);
        } else {
          MEMORY_CACHE.set(keyId, dataStr);
        }

        return new Response(
          JSON.stringify({ status: "ok", keyId, updatedAt: body.updatedAt || Date.now() }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Invalid JSON" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
