import fetch from 'node-fetch';

async function testSSE() {
  console.log('Testing SSE MCP server...\n');

  // Step 1: Connect to SSE and get session
  console.log('1. Connecting to SSE endpoint...');
  const sseResponse = await fetch('http://localhost:8000/sse');
  const reader = sseResponse.body;
  
  let sessionId = null;
  let buffer = '';
  
  // Read first few lines to get session
  for await (const chunk of reader) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.replace('data: ', '').trim();
        if (data.startsWith('/messages')) {
          const url = new URL(data, 'http://localhost:8000');
          sessionId = url.searchParams.get('session_id');
          console.log(`✓ Session ID: ${sessionId}`);
          break;
        }
      }
    }
    
    if (sessionId) break;
  }

  if (!sessionId) {
    console.error('Failed to get session ID');
    process.exit(1);
  }

  // Step 2: Send tools/list request
  console.log('\n2. Sending tools/list request...');
  const listResponse = await fetch(`http://localhost:8000/messages?session_id=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
  });

  console.log(`   Status: ${listResponse.status}`);
  if (listResponse.status === 202) {
    console.log('✓ Request accepted (202)');
  }

  // Step 3: Keep reading SSE for response
  console.log('\n3. Waiting for response via SSE...');
  let responseReceived = false;
  
  for await (const chunk of reader) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.replace('data: ', ''));
          if (data.id === 1 && data.result) {
            console.log('✓ Response received:');
            console.log(JSON.stringify(data, null, 2));
            responseReceived = true;
            process.exit(0);
          }
        } catch (e) {
          // Not JSON
        }
      }
    }
    
    if (responseReceived) break;
  }

  setTimeout(() => {
    console.log('\n⏱️  Timeout waiting for response');
    process.exit(1);
  }, 10000);
}

testSSE().catch(console.error);
