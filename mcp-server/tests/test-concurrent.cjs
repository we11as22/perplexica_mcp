#!/usr/bin/env node

/**
 * Test concurrent requests to MCP server
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

async function waitForResponse(sseRes, requestId, timeout = 30000) {
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

async function testConcurrent() {
  console.log('=== Testing Concurrent Requests ===\n');

  // Get session
  const { sessionId, sseRes } = await getSession();
  console.log(`✓ Session ID: ${sessionId}\n`);

  // Send multiple requests concurrently
  console.log('Sending 5 concurrent requests...\n');
  const startTime = Date.now();
  
  const requests = [
    sendRequest(sessionId, 'tools/list', {}, 1),
    sendRequest(sessionId, 'tools/list', {}, 2),
    sendRequest(sessionId, 'tools/list', {}, 3),
    sendRequest(sessionId, 'tools/call', {
      name: 'perplexica_search',
      arguments: { query: 'test 1', optimizationMode: 'speed' }
    }, 4),
    sendRequest(sessionId, 'tools/call', {
      name: 'perplexica_search',
      arguments: { query: 'test 2', optimizationMode: 'speed' }
    }, 5),
  ];

  // Wait for all requests to be accepted
  const accepted = await Promise.all(requests);
  const acceptTime = Date.now() - startTime;
  console.log(`✓ All requests accepted in ${acceptTime}ms`);
  accepted.forEach(({ requestId, method }) => {
    console.log(`  - Request ${requestId} (${method}) accepted`);
  });

  // Wait for all responses
  console.log('\nWaiting for responses...\n');
  const responseStart = Date.now();
  
  const responses = await Promise.all([
    waitForResponse(sseRes, 1, 10000),
    waitForResponse(sseRes, 2, 10000),
    waitForResponse(sseRes, 3, 10000),
    waitForResponse(sseRes, 4, 60000),
    waitForResponse(sseRes, 5, 60000),
  ]);

  const responseTime = Date.now() - responseStart;
  const totalTime = Date.now() - startTime;

  console.log(`✓ All responses received in ${responseTime}ms (total: ${totalTime}ms)\n`);
  
  responses.forEach((response, index) => {
    if (response.error) {
      console.log(`  ✗ Request ${response.id}: Error - ${response.error.message}`);
    } else {
      const method = index < 3 ? 'tools/list' : 'tools/call';
      console.log(`  ✓ Request ${response.id} (${method}): Success`);
      if (response.result && response.result.tools) {
        console.log(`    - Tools count: ${response.result.tools.length}`);
      }
      if (response.result && response.result.content) {
        const text = response.result.content[0]?.text || '';
        console.log(`    - Response length: ${text.length} chars`);
      }
    }
  });

  console.log('\n✅ Concurrent requests test completed!');
  sseRes.destroy();
}

testConcurrent().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});

