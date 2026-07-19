// Cloudflare Pages Function: issues short-lived signed WebSocket URLs for
// Tencent 智聆口语评测 (SOE, new version). The browser connects to Tencent
// directly with the returned URL — audio never passes through us, and the
// SecretKey never leaves the server.
//
// Env (set via `wrangler pages secret put` / dashboard, or .dev.vars locally):
//   SOE_APP_ID, SOE_SECRET_ID, SOE_SECRET_KEY

interface SoeEnv {
  SOE_APP_ID?: string
  SOE_SECRET_ID?: string
  SOE_SECRET_KEY?: string
}

const HOST = 'soe.cloud.tencent.com'

// Signature per Tencent's realtime-WSS scheme: sort params by key, build
// `host/path?k=v&...` (values NOT url-encoded), HMAC-SHA1 with SecretKey,
// base64. The connect URL then carries url-encoded values + the signature.
export async function signSoeUrl(
  appId: string,
  secretId: string,
  secretKey: string,
  refText: string,
  now = Math.floor(Date.now() / 1000),
  nonce = Math.floor(Math.random() * 1e9) + 1,
  voiceId = crypto.randomUUID()
): Promise<{ url: string; voiceId: string }> {
  const params: Record<string, string> = {
    secretid: secretId,
    timestamp: String(now),
    expired: String(now + 300),
    nonce: String(nonce),
    server_engine_type: '16k_en',
    voice_id: voiceId,
    voice_format: '0', // pcm
    eval_mode: '1', // whole sentence
    score_coeff: '1.0', // child-friendly leniency
    ref_text: refText,
  }
  const sortedKeys = Object.keys(params).sort()
  const path = `${HOST}/soe/api/${appId}`
  const raw = `${path}?${sortedKeys.map((k) => `${k}=${params[k]}`).join('&')}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const signature = btoa(String.fromCharCode(...new Uint8Array(mac)))

  const query = sortedKeys.map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&')
  return {
    url: `wss://${path}?${query}&signature=${encodeURIComponent(signature)}`,
    voiceId,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function onRequestPost(ctx: { request: Request; env: SoeEnv }): Promise<Response> {
  const { SOE_APP_ID, SOE_SECRET_ID, SOE_SECRET_KEY } = ctx.env
  if (!SOE_APP_ID || !SOE_SECRET_ID || !SOE_SECRET_KEY) {
    return json(501, { error: 'soe not configured' })
  }
  let refText: unknown
  try {
    ;({ refText } = (await ctx.request.json()) as { refText?: unknown })
  } catch {
    return json(400, { error: 'invalid json' })
  }
  if (typeof refText !== 'string' || !refText.trim() || refText.length > 200) {
    return json(400, { error: 'invalid refText' })
  }
  return json(200, await signSoeUrl(SOE_APP_ID, SOE_SECRET_ID, SOE_SECRET_KEY, refText.trim()))
}
