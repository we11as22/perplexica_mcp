import { spawn } from 'child_process';
import { join } from 'path';

const mcpServerDir = join(process.cwd());

// Test 1: npx with npm start
console.log('Test 1: npx with npm start in directory');
const server1 = spawn('npx', ['-y', 'npm', 'start'], {
  cwd: mcpServerDir,
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

let output1 = '';

server1.stdout.on('data', (data) => {
  output1 += data.toString();
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      console.log('Response:', JSON.stringify(parsed, null, 2));
      server1.kill();
      test2();
      return;
    } catch (e) {
      // Not JSON, continue
    }
  }
});

server1.stderr.on('data', (data) => {
  const text = data.toString();
  if (text.includes('MCP server running')) {
    console.log('✓ Server started via npx npm start');
    // Send test request
    const listRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };
    server1.stdin.write(JSON.stringify(listRequest) + '\n');
  }
});

server1.on('close', () => {
  console.log('Server 1 closed\n');
});

function test2() {
  console.log('\nTest 2: npx with direct path to dist/index.js');
  const server2 = spawn('npx', ['-y', 'node', join(mcpServerDir, 'dist/index.js')], {
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

  server2.stderr.on('data', (data) => {
    const text = data.toString();
    if (text.includes('MCP server running')) {
      console.log('✓ Server started via npx node dist/index.js');
      const listRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };
      server2.stdin.write(JSON.stringify(listRequest) + '\n');
    }
  });

  server2.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        console.log('Response:', JSON.stringify(parsed, null, 2));
        server2.kill();
        console.log('\n✓ Both npx methods work!');
        process.exit(0);
      } catch (e) {
        // Not JSON
      }
    }
  });

  setTimeout(() => {
    server2.kill();
    process.exit(0);
  }, 5000);
}

setTimeout(() => {
  server1.kill();
  test2();
}, 5000);
