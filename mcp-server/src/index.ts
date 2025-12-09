import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { randomUUID } from 'crypto';

type Provider = {
  id: string;
  name: string;
};

const env = {
  perplexicaApi: (process.env.PERPLEXICA_API_URL || 'http://perplexica:3000').replace(/\/$/, ''),
  providerName: process.env.MCP_PROVIDER_NAME || '',
  embedProviderName:
    process.env.MCP_EMBED_PROVIDER_NAME || process.env.MCP_PROVIDER_NAME || '',
  llmModel: process.env.MCP_LLM_MODEL || 'gpt-4o-mini',
  embedModel: process.env.MCP_EMBED_MODEL || 'text-embedding-3-small',
  focusMode: process.env.MCP_FOCUS_MODE || 'webSearch',
  optimizationMode: process.env.MCP_OPTIMIZATION_MODE || 'balanced',
  systemInstructions: process.env.MCP_SYSTEM_INSTRUCTIONS || '',
  transport: process.env.MCP_TRANSPORT || 'stdio',
  port: Number(process.env.MCP_PORT || 8000),
  host: process.env.MCP_HOST || '0.0.0.0',
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

const server = new Server(
  {
    name: 'perplexica-search',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

async function listTools() {
  return {
    tools: [
      {
        name: 'perplexica_search',
        description:
          'Performs intelligent web search using Perplexica AI search engine. Combines results from multiple search engines (Google, Bing, DuckDuckGo, etc.) and uses AI to synthesize comprehensive, well-cited answers. Returns detailed responses with source citations. Supports different search modes: general web search, academic papers, writing assistance, Wolfram Alpha calculations, YouTube videos, Reddit discussions, and Habr articles.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to execute',
            },
            focusMode: {
              type: 'string',
              enum: [
                'webSearch',
                'academicSearch',
                'writingAssistant',
                'wolframAlphaSearch',
                'youtubeSearch',
                'redditSearch',
                'habrSearch',
              ],
              description:
                'Search focus mode: webSearch (default), academicSearch, writingAssistant, wolframAlphaSearch, youtubeSearch, redditSearch, or habrSearch',
              default: 'webSearch',
            },
            optimizationMode: {
              type: 'string',
              enum: ['balanced', 'speed'],
              description: 'Optimization mode: balanced (default) or speed',
              default: 'balanced',
            },
            history: {
              type: 'array',
              items: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 2,
              },
              description:
                'Optional conversation history as array of [role, text] pairs',
            },
          },
          required: ['query'],
        },
      },
    ],
  };
}

async function callTool(name: string, args: any) {
  console.error(`[callTool] Starting tool call: ${name}`);
  if (name !== 'perplexica_search') {
    throw new Error(`Unknown tool: ${name}`);
  }

  const query = typeof args?.query === 'string' ? args.query.trim() : '';

  if (!query) {
    throw new Error('Missing required parameter: query');
  }

  const focusMode =
    typeof args?.focusMode === 'string' && args.focusMode
      ? args.focusMode
      : env.focusMode;

  const optimizationMode =
    typeof args?.optimizationMode === 'string' && args.optimizationMode
      ? args.optimizationMode
      : env.optimizationMode;

  const history = Array.isArray(args?.history) ? args.history : [];

  console.error(`[callTool] Fetching providers...`);
  try {
    const providers = await fetchProviders();
    console.error(`[callTool] Got ${providers.length} providers`);
    const chatProvider = pickProvider(providers, env.providerName);
    const embedProvider = pickProvider(
      providers,
      env.embedProviderName || env.providerName,
    );

    if (!chatProvider || !embedProvider) {
      throw new Error('No configured providers found in Perplexica');
    }

    console.error(`[callTool] Using chat provider: ${chatProvider.id}, embed provider: ${embedProvider.id}`);
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

    console.error(`[callTool] Sending search request to ${searchUrl}`);
    const searchResp = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchBody),
    });

    console.error(`[callTool] Search response status: ${searchResp.status}`);
    if (!searchResp.ok) {
      const text = await searchResp.text();
      throw new Error(`Search failed (${searchResp.status}): ${text}`);
    }

    const result = await searchResp.json();
    console.error(`[callTool] Search completed, result keys:`, Object.keys(result));

    return {
      content: [
        {
          type: 'text',
          text: `Query: ${query}\n\nAnswer:\n${result.message || 'No answer provided'}\n\nSources:\n${JSON.stringify(result.sources || [], null, 2)}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('[callTool] error', error);
    throw new Error(`MCP search error: ${error?.message || 'unknown error'}`);
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return await listTools();
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'perplexica_search') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as {
    query?: string;
    focusMode?: string;
    optimizationMode?: string;
    history?: Array<[string, string]>;
  };

  const query = typeof args?.query === 'string' ? args.query.trim() : '';

  if (!query) {
    throw new Error('Missing required parameter: query');
  }

  const focusMode =
    typeof args?.focusMode === 'string' && args.focusMode
      ? args.focusMode
      : env.focusMode;

  const optimizationMode =
    typeof args?.optimizationMode === 'string' && args.optimizationMode
      ? args.optimizationMode
      : env.optimizationMode;

  const history = Array.isArray(args?.history) ? args.history : [];

  try {
    const providers = await fetchProviders();
    const chatProvider = pickProvider(providers, env.providerName);
    const embedProvider = pickProvider(
      providers,
      env.embedProviderName || env.providerName,
    );

    if (!chatProvider || !embedProvider) {
      throw new Error('No configured providers found in Perplexica');
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

    return {
      content: [
        {
          type: 'text',
          text: `Query: ${query}\n\nAnswer:\n${result.message || 'No answer provided'}\n\nSources:\n${JSON.stringify(result.sources || [], null, 2)}`,
        },
      ],
    };
  } catch (error: any) {
    console.error('[mcp-search] error', error);
    throw new Error(`MCP search error: ${error?.message || 'unknown error'}`);
  }
});

// SSE transport implementation
type Session = {
  sessionId: string;
  write: (data: any) => void;
  pendingResponses?: any[];
};
const sessions = new Map<string, Session>();

async function runSSEServer() {
  const app = express();
  app.use(express.json());

  // CORS middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // SSE endpoint - creates new session
  app.get('/sse', (req, res) => {
    const sessionId = req.query.session_id as string || randomUUID();
    const messagesPath = `/messages?session_id=${sessionId}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // If new session, send endpoint info
    if (!req.query.session_id) {
      res.write(`event: endpoint\n`);
      res.write(`data: ${messagesPath}\n\n`);
    }

    // Create or get session transport
    let sessionTransport: Session | undefined = sessions.get(sessionId);
    
    if (!sessionTransport) {
      console.error(`[mcp-sse] Creating new SSE session ${sessionId}`);
      sessionTransport = {
        sessionId,
        write: (data: any) => {
          try {
            console.error(`[mcp-sse] Writing to SSE stream for session ${sessionId}, data length: ${JSON.stringify(data).length}`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
            console.error(`[mcp-sse] Successfully wrote to SSE stream`);
          } catch (e) {
            console.error(`[mcp-sse] Error writing to SSE stream:`, e);
            // Client disconnected
          }
        },
        pendingResponses: [],
      };
      sessions.set(sessionId, sessionTransport);
    } else {
      console.error(`[mcp-sse] Updating existing SSE session ${sessionId}`);
      // Update existing session's write function to use this SSE connection
      const oldWrite = sessionTransport.write;
      sessionTransport.write = (data: any) => {
        try {
          console.error(`[mcp-sse] Writing to SSE stream (updated) for session ${sessionId}, data length: ${JSON.stringify(data).length}`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
          console.error(`[mcp-sse] Successfully wrote to SSE stream (updated)`);
        } catch (e) {
          console.error(`[mcp-sse] Error writing to SSE stream (updated):`, e);
          // Try old write function if this one fails
          if (oldWrite) {
            try {
              oldWrite(data);
            } catch (e2) {
              console.error(`[mcp-sse] Both write functions failed`);
            }
          }
        }
      };
      
      // Send any pending responses
      if (sessionTransport.pendingResponses && sessionTransport.pendingResponses.length > 0) {
        console.error(`[mcp-sse] Sending ${sessionTransport.pendingResponses.length} pending responses`);
        for (const pending of sessionTransport.pendingResponses) {
          try {
            res.write(`data: ${JSON.stringify(pending)}\n\n`);
          } catch (e) {
            console.error(`[mcp-sse] Failed to send pending response:`, e);
          }
        }
        sessionTransport.pendingResponses = [];
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      // Don't delete session immediately, allow reconnection
      // sessions.delete(sessionId);
      res.end();
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch (e) {
        clearInterval(keepAlive);
        // sessions.delete(sessionId);
      }
    }, 30000);
  });

  // Messages endpoint - handles JSON-RPC requests
  app.post('/messages', async (req, res) => {
    let sessionId = req.query.session_id as string;
    
    // If no session_id provided, create a new one
    if (!sessionId) {
      sessionId = randomUUID();
    }
    
    let session = sessions.get(sessionId);

    // If session doesn't exist, create a dummy one that will store responses
    // The actual SSE connection will be established when client connects to /sse
    if (!session) {
      console.error(`[mcp-sse] Creating new session ${sessionId} for POST request`);
      const pendingResponses: any[] = [];
      session = {
        sessionId,
        write: (data: any) => {
          console.error(`[mcp-sse] Session ${sessionId} write called`);
          // Store response if SSE connection not yet established
          pendingResponses.push(data);
          // Try to find active SSE connection and send
          const activeSession = sessions.get(sessionId);
          if (activeSession && activeSession.write) {
            try {
              console.error(`[mcp-sse] Found active session, writing to SSE stream`);
              activeSession.write(data);
              // Clear pending responses
              pendingResponses.length = 0;
            } catch (e) {
              console.error(`[mcp-sse] Error writing to active session:`, e);
              // SSE connection not ready, keep in pending
            }
          } else {
            console.error(`[mcp-sse] No active SSE connection found for session ${sessionId}, storing in pending (${pendingResponses.length} pending)`);
          }
        },
        pendingResponses,
      };
      sessions.set(sessionId, session);
    } else {
      console.error(`[mcp-sse] Using existing session ${sessionId}`);
    }

    res.status(202).send(); // Accepted

    // Process request through MCP server
    try {
      const request = req.body;
      console.error(`[mcp-sse] Processing ${request.method} request (id: ${request.id})`);
      
      // Handle request by calling the appropriate handler directly
      let result: any;
      
      if (request.method === 'tools/list') {
        // Call the listTools handler
        const toolsResult = await listTools();
        result = toolsResult; // Already has { tools: [...] } structure
      } else if (request.method === 'tools/call') {
        // Call the callTool handler
        console.error(`[mcp-sse] Calling tool: ${request.params.name} with args:`, JSON.stringify(request.params.arguments || {}));
        try {
          const toolResult = await callTool(request.params.name, request.params.arguments || {});
          console.error(`[mcp-sse] Tool call completed successfully`);
          result = toolResult;
        } catch (toolError: any) {
          console.error(`[mcp-sse] Tool call error:`, toolError);
          throw toolError;
        }
      } else if (request.method === 'initialize') {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: server['_capabilities'],
          serverInfo: {
            name: 'perplexica-search',
            version: '0.1.0',
          },
        };
      } else {
        throw new Error(`Unknown method: ${request.method}`);
      }

      if (result !== undefined) {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: result,
        };
        console.error(`[mcp-sse] Sending response for request ${request.id}`);
        console.error(`[mcp-sse] Response:`, JSON.stringify(response).substring(0, 200));
        if (session) {
          try {
            session.write(response);
            console.error(`[mcp-sse] Response written to session`);
          } catch (writeError) {
            console.error(`[mcp-sse] Error writing response:`, writeError);
            // Try to find active session and send
            const activeSession = sessions.get(sessionId);
            if (activeSession && activeSession.write) {
              try {
                activeSession.write(response);
                console.error(`[mcp-sse] Response written to active session`);
              } catch (e2) {
                console.error(`[mcp-sse] Failed to write to active session:`, e2);
              }
            }
          }
        } else {
          console.error(`[mcp-sse] No session found for ${sessionId}`);
        }
      }
    } catch (error: any) {
      console.error(`[mcp-sse] Error processing request:`, error);
      const errorResponse = {
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: error.message || 'Internal error',
        },
      };
      if (session) {
        session.write(errorResponse);
      }
    }
  });

  app.listen(env.port, env.host, () => {
    console.error(
      `[perplexica-mcp] MCP server running on SSE at http://${env.host}:${env.port}/sse`,
    );
  });
}

async function main() {
  if (env.transport === 'sse') {
    await runSSEServer();
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[perplexica-mcp] MCP server running on stdio');
  }
}

main().catch((error) => {
  console.error('[perplexica-mcp] Fatal error:', error);
  process.exit(1);
});
