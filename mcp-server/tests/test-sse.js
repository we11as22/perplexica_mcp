import { spawn } from 'child_process';

console.log('Testing SSE MCP server...\n');

const server = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    MCP_TRANSPORT: 'sse',
    MCP_PORT: '8001',
    PERPLEXICA_API_URL: 'http://localhost:3000',
    MCP_PROVIDER_NAME: 'OpenAI',
    MCP_EMBED_PROVIDER_NAME: 'Transformers',
    MCP_LLM_MODEL: 'qwen-3-32b',
    MCP_EMBED_MODEL: 'Xenova/all-MiniLM-L6-v2',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let serverReady = false;
let sessionId = null;
let messagesUrl = null;

server.stderr.on('data', (data) => {
  const text = data.toString();
  if (text.includes('MCP server running on SSE')) {
    console.log('✓ SSE server started');
    serverReady = true;
    testSSE();
  }
});

async function testSSE() {
  if (!serverReady) return;

  try {
    // Step 1: Connect to SSE endpoint
    console.log('\n1. Connecting to SSE endpoint...');
    const sseResponse = await fetch('http://localhost:8001/sse');
    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.replace('data: ', '');
          if (data.startsWith('/messages')) {
            messagesUrl = `http://localhost:8001${data}`;
            sessionId = new URL(messagesUrl).searchParams.get('session_id');
            console.log(`✓ Session created: ${sessionId}`);
            console.log(`  Messages URL: ${messagesUrl}`);
            await testMessages();
            return;
          }
        }
      }
    }
  } catch (error) {
    console.error('SSE connection error:', error);
    server.kill();
    process.exit(1);
  }
}

async function testMessages() {
  if (!messagesUrl) return;

  try {
    // Step 2: Initialize
    console.log('\n2. Sending initialize request...');
    const initResponse = await fetch(messagesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        },
      }),
    });

    if (initResponse.status === 202) {
      console.log('✓ Initialize request accepted (202)');
    }

    // Step 3: List tools
    console.log('\n3. Sending tools/list request...');
    const listResponse = await fetch(messagesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    if (listResponse.status === 202) {
      console.log('✓ tools/list request accepted (202)');
    }

    // Wait for responses via SSE
    console.log('\n4. Waiting for responses via SSE...');
    setTimeout(() => {
      console.log('\n✅ SSE test completed');
      console.log('   Note: Full responses come through SSE stream');
      server.kill();
      process.exit(0);
    }, 3000);
  } catch (error) {
    console.error('Messages error:', error);
    server.kill();
    process.exit(1);
  }
}

setTimeout(() => {
  console.log('\n⏱️  Timeout');
  server.kill();
  process.exit(1);
}, 10000);

