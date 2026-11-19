import { ApiError } from '../storage.mjs';

export function compatibleProvider({ endpoint, model, key }) {
  let base;
  try { base = endpoint && new URL(endpoint.endsWith('/') ? endpoint : endpoint + '/'); } catch {}
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (base && (base.username || base.password || base.search || base.hash
    || (base.protocol !== 'https:' && (base.protocol !== 'http:' || !loopback.has(base.hostname))))) base = undefined;
  const destination = base?.origin;
  const ready = !!(base && typeof model === 'string' && model.trim() && model.length <= 150);

  async function listModels() {
    return { destination, available: ready, models: ready ? [model] : [],
      reason: ready ? undefined : 'COMPAT_NOT_CONFIGURED' };
  }

  async function generate(selected, system, input, schema, signal) {
    if (!ready || selected !== model) throw new ApiError(503, 'PROVIDER_UNAVAILABLE');
    let response;
    try {
      const deadline = AbortSignal.timeout(85_000);
      response = await fetch(new URL('chat/completions', base), {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        body: JSON.stringify({ model, stream: false, messages: [
          { role: 'system', content: system + '\nReturn only JSON matching this schema: ' + JSON.stringify(schema) },
          { role: 'user', content: JSON.stringify(input) },
        ] }),
      });
      if (!response.ok || !response.body) throw new Error('Request failed');
    } catch { throw new ApiError(503, 'PROVIDER_UNAVAILABLE'); }

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let payload = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 512 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
        payload += decoder.decode(value, { stream: true });
      }
      const content = JSON.parse(payload + decoder.decode()).choices?.[0]?.message?.content;
      return JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1'));
    } catch { throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE'); }
  }

  return { id: 'compatible', listModels, generate };
}
