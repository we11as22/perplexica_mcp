import { spawn } from 'child_process';

const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    PERPLEXICA_API_URL: 'http://localhost:3000',
    MCP_PROVIDER_NAME: 'OpenAI',
    MCP_EMBED_PROVIDER_NAME: 'Transformers',
    MCP_LLM_MODEL: 'qwen-3-32b',
    MCP_EMBED_MODEL: 'Xenova/all-MiniLM-L6-v2',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';

server.stdout.on('data', (data) => {
  output += data.toString();
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      console.log('Response:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Output:', line);
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

server.on('close', (code) => {
  console.log(`\nServer exited with code ${code}`);
  process.exit(code || 0);
});

// Send list tools request
const listRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
};

console.log('1. Sending list tools request...');
server.stdin.write(JSON.stringify(listRequest) + '\n');

// Wait then send call tool request
setTimeout(() => {
  const callRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'perplexica_search',
      arguments: {
        query: 'what is MCP protocol',
      },
    },
  };
  console.log('2. Sending call tool request...');
  server.stdin.write(JSON.stringify(callRequest) + '\n');
}, 1000);

// Close after 60 seconds
setTimeout(() => {
  console.log('3. Closing server...');
  server.kill();
}, 60000);
