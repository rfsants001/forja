import { ApiError } from '../storage.mjs';

export function ollamaProvider(endpoint) {
  const base = new URL(endpoint);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('FORJA_OLLAMA_URL inválida.');
  }
  const destination = base.origin;

  async function request(path, { signal, ...options } = {}) {
    try {
      const response = await fetch(new URL(path, base), {
        ...options, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(55_000)]) : AbortSignal.timeout(55_000),
      });
      if (!response.ok) throw new Error('Provider returned an unsuccessful response');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      let json = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 512 * 1024) {
          await reader.cancel();
          throw new Error('Provider response too large');
        }
        json += decoder.decode(value, { stream: true });
      }
      return JSON.parse(json + decoder.decode());
    } catch {
      throw new ApiError(503, 'PROVIDER_UNAVAILABLE');
    }
  }

  async function listModels(signal) {
    try {
      const timeout = AbortSignal.timeout(4000);
      const result = await request('/api/tags', { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      const models = (result.models ?? []).filter((model) => typeof model?.name === 'string' && model.name.length > 0 && model.name.length <= 150
        && !model.remote_host && !model.remote_model && !/[:.-]cloud(?:[:.-]|$)/i.test(model.name))
        .map((model) => model.name);
      return { destination, models, available: true };
    } catch {
      return { destination, models: [], available: false };
    }
  }

  async function generate(model, system, input, schema, signal) {
    const response = await request('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({
        model, stream: false, format: schema, options: { temperature: 0.15, num_predict: 700 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }],
      }),
    });
    try {
      return JSON.parse(response.message?.content);
    } catch {
      throw new ApiError(502, 'INVALID_PROVIDER_RESPONSE');
    }
  }

  return { id: 'ollama', listModels, generate };
}
