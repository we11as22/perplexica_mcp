import express from 'express';

type Provider = {
  id: string;
  name: string;
};

const app = express();
app.use(express.json());

const env = {
  perplexicaApi: (process.env.PERPLEXICA_API_URL || 'http://perplexica:3000').replace(/\/$/, ''),
  port: Number(process.env.MCP_PORT || 8000),
  providerName: process.env.MCP_PROVIDER_NAME || '',
  embedProviderName:
    process.env.MCP_EMBED_PROVIDER_NAME || process.env.MCP_PROVIDER_NAME || '',
  llmModel: process.env.MCP_LLM_MODEL || 'gpt-4o-mini',
  embedModel: process.env.MCP_EMBED_MODEL || 'text-embedding-3-small',
  focusMode: process.env.MCP_FOCUS_MODE || 'webSearch',
  optimizationMode: process.env.MCP_OPTIMIZATION_MODE || 'balanced',
  systemInstructions: process.env.MCP_SYSTEM_INSTRUCTIONS || '',
};

const providersUrl = `${env.perplexicaApi}/api/providers`;
const searchUrl = `${env.perplexicaApi}/api/search`;

async function fetchProviders(): Promise<Provider[]> {
  const resp = await fetch(providersUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch providers (${resp.status})`);
  }

  const data = (await resp.json()) as { providers?: Provider[] };
  return Array.isArray(data.providers) ? data.providers : [];
}

function pickProvider(providers: Provider[], preferred: string): Provider | null {
  if (!providers.length) return null;

  if (preferred) {
    const found = providers.find(
      (p) =>
        p.id === preferred ||
        p.name?.toLowerCase() === preferred.toLowerCase(),
    );
    if (found) return found;
  }

  return providers[0];
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/tools/perplexica_search', async (req, res) => {
  const query =
    typeof req.body?.query === 'string' ? req.body.query.trim() : '';

  if (!query) {
    return res.status(400).json({ message: 'Missing query' });
  }

  const focusMode =
    typeof req.body?.focusMode === 'string' && req.body.focusMode
      ? req.body.focusMode
      : env.focusMode;

  const optimizationMode =
    typeof req.body?.optimizationMode === 'string' && req.body.optimizationMode
      ? req.body.optimizationMode
      : env.optimizationMode;

  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  try {
    const providers = await fetchProviders();
    const chatProvider = pickProvider(providers, env.providerName);
    const embedProvider = pickProvider(
      providers,
      env.embedProviderName || env.providerName,
    );

    if (!chatProvider || !embedProvider) {
      return res.status(500).json({
        message: 'No configured providers found in Perplexica',
      });
    }

    const searchBody = {
      optimizationMode,
      focusMode,
      chatModel: {
        providerId: chatProvider.id,
        key: env.llmModel,
      },
      embeddingModel: {
        providerId: embedProvider.id,
        key: env.embedModel,
      },
      query,
      history,
      stream: false,
      systemInstructions: env.systemInstructions,
    };

    const searchResp = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody),
    });

    if (!searchResp.ok) {
      const text = await searchResp.text();
      throw new Error(`Search failed (${searchResp.status}): ${text}`);
    }

    const result = await searchResp.json();

    return res.json({
      tool: 'perplexica_search',
      query,
      focusMode,
      optimizationMode,
      providerId: chatProvider.id,
      embedProviderId: embedProvider.id,
      llmModel: env.llmModel,
      embeddingModel: env.embedModel,
      result,
    });
  } catch (error: any) {
    console.error('[mcp-search] error', error);
    return res.status(500).json({
      message: 'MCP search error',
      error: error?.message || 'unknown error',
    });
  }
});

app.listen(env.port, '0.0.0.0', () => {
  console.log(
    `[mcp-search] listening on ${env.port}, targeting Perplexica at ${env.perplexicaApi}`,
  );
});
