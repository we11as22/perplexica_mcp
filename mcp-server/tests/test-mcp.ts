import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMCP() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: {
      PERPLEXICA_API_URL: 'http://localhost:3000',
      MCP_PROVIDER_NAME: 'OpenAI',
      MCP_EMBED_PROVIDER_NAME: 'Transformers',
      MCP_LLM_MODEL: 'qwen-3-32b',
      MCP_EMBED_MODEL: 'Xenova/all-MiniLM-L6-v2',
      MCP_FOCUS_MODE: 'webSearch',
      MCP_OPTIMIZATION_MODE: 'balanced',
    },
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '0.1.0',
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);

  console.log('Testing MCP server...');

  // List tools
  const tools = await client.listTools();
  console.log('Available tools:', JSON.stringify(tools, null, 2));

  // Call tool
  const result = await client.callTool({
    name: 'perplexica_search',
    arguments: {
      query: 'test MCP integration',
    },
  });

  console.log('Search result:', JSON.stringify(result, null, 2));

  await client.close();
}

testMCP().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

