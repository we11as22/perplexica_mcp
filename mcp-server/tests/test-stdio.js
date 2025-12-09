import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    PERPLEXICA_API_URL: 'http://localhost:3000',
    MCP_PROVIDER_NAME: 'OpenAI',
    MCP_EMBED_PROVIDER_NAME: 'Transformers',
    MCP_LLM_MODEL: 'qwen-3-32b',
    MCP_EMBED_MODEL: 'Xenova/all-MiniLM-L6-v2',
    MCP_OPTIMIZATION_MODE: 'speed',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let responseCount = 0;

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      responseCount++;
      if (parsed.id === 1 && parsed.result?.tools) {
        console.log('✓ tools/list response received');
        console.log('  Tools:', parsed.result.tools.map(t => t.name).join(', '));
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      // Not JSON
    }
  }
});

server.stderr.on('data', (data) => {
  const text = data.toString();
  if (text.includes('MCP server running')) {
    console.log('✓ stdio server started');
    const listRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };
    server.stdin.write(JSON.stringify(listRequest) + '\n');
  }
});

server.on('close', () => {
  if (responseCount > 0) {
    console.log('\n✅ stdio mode test passed');
  } else {
    console.log('\n❌ No response received');
    process.exit(1);
  }
});

setTimeout(() => {
  server.kill();
  if (responseCount === 0) {
    console.log('\n⏱️  Timeout');
    process.exit(1);
  }
}, 5000);

