#!/usr/bin/env node

/**
 * Test Habr search via MCP
 */

const http = require('http');

async function getSession() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:8000/sse', (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ') && line.includes('/messages')) {
            const match = line.match(/session_id=([^&]+)/);
            if (match) {
              resolve({ sessionId: match[1], sseRes: res });
              return;
            }
          }
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function sendRequest(sessionId, method, params, requestId) {
  return new Promise((resolve, reject) => {
    const requestData = {
      jsonrpc: '2.0',
      id: requestId,
      method: method,
      params: params,
    };

    const postData = JSON.stringify(requestData);
    const options = {
      hostname: '127.0.0.1',
      port: 8000,
      path: `/messages?session_id=${sessionId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 202) {
        resolve({ requestId, method });
      } else {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          reject(new Error(`Status ${res.statusCode}: ${body}`));
        });
      }
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function waitForResponse(sseRes, requestId, timeout = 60000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeoutId = setTimeout(() => {
      sseRes.removeListener('data', dataHandler);
      reject(new Error(`Timeout waiting for response ${requestId}`));
    }, timeout);

    const dataHandler = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();
          if (!data) continue;
          try {
            const response = JSON.parse(data);
            if (response.id === requestId) {
              clearTimeout(timeoutId);
              sseRes.removeListener('data', dataHandler);
              resolve(response);
              return;
            }
          } catch (e) {
            // Not JSON
          }
        }
      }
    };

    sseRes.on('data', dataHandler);
  });
}

async function testHabrSearch() {
  console.log('=== Testing Habr Search ===\n');

  // Get session
  const { sessionId, sseRes } = await getSession();
  console.log(`✓ Session ID: ${sessionId}\n`);

  // Initialize
  console.log('1. Initializing...');
  await sendRequest(sessionId, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  }, 1);
  await waitForResponse(sseRes, 1, 5000);
  console.log('   ✓ Initialized\n');

  // Test Habr search
  console.log('2. Testing Habr search...');
  console.log('   Query: "TypeScript best practices"');
  console.log('   Focus mode: habrSearch\n');
  
  await sendRequest(sessionId, 'tools/call', {
    name: 'perplexica_search',
    arguments: {
      query: 'TypeScript best practices',
      focusMode: 'habrSearch',
      optimizationMode: 'speed'
    }
  }, 2);

  console.log('   ✓ Request sent, waiting for response...\n');
  
  const response = await waitForResponse(sseRes, 2, 120000);
  
  if (response.error) {
    console.error('   ✗ Error:', response.error);
    process.exit(1);
  }

  console.log('   ✓ Response received!\n');
  console.log('=== Search Results ===\n');
  
  if (response.result && response.result.content) {
    const text = response.result.content[0]?.text || '';
    console.log(text.substring(0, 2000));
    if (text.length > 2000) {
      console.log(`\n... (truncated, total length: ${text.length} chars)`);
    }
  } else {
    console.log(JSON.stringify(response.result, null, 2));
  }

  console.log('\n✅ Habr search test completed!');
  sseRes.destroy();
}

testHabrSearch().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});

