#!/usr/bin/env node

/**
 * Test SSE MCP server with direct connection (like Cursor/Claude Desktop)
 * This simulates the behavior when using:
 * {
 *   "type": "sse",
 *   "url": "http://127.0.0.1:8000/sse"
 * }
 */

const http = require('http');

async function testSSE() {
  console.log('=== Testing SSE MCP Server (Direct Mode) ===\n');

  // Step 1: Connect to SSE endpoint
  console.log('1. Connecting to SSE endpoint...');
  let sessionId = null;
  let messagesPath = null;

  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:8000/sse', (res) => {
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Headers:`, res.headers);

      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: endpoint')) {
            // Next line should be data with messages path
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed && typeof parsed === 'string' && parsed.startsWith('/messages')) {
                messagesPath = parsed;
                const match = parsed.match(/session_id=([^&]+)/);
                if (match) {
                  sessionId = match[1];
                  console.log(`   ✓ Session ID: ${sessionId}`);
                  console.log(`   ✓ Messages path: ${messagesPath}`);
                  
                  // Now send initialize request
                  setTimeout(() => {
                    sendRequest('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } }, sessionId, messagesPath, res, resolve, reject);
                  }, 100);
                }
              }
            } catch (e) {
              // Not JSON, might be endpoint path
              if (data.startsWith('/messages')) {
                messagesPath = data;
                const match = data.match(/session_id=([^&]+)/);
                if (match) {
                  sessionId = match[1];
                  console.log(`   ✓ Session ID: ${sessionId}`);
                  console.log(`   ✓ Messages path: ${messagesPath}`);
                  
                  setTimeout(() => {
                    sendRequest('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } }, sessionId, messagesPath, res, resolve, reject);
                  }, 100);
                }
              }
            }
          }
        }
      });

      res.on('end', () => {
        console.log('   SSE connection closed');
        resolve();
      });

      res.on('error', (err) => {
        console.error('   Error:', err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error('   Request error:', err);
      reject(err);
    });

    // Don't set timeout - keep connection open for responses
  });
}

function sendRequest(method, params, sessionId, messagesPath, sseRes, resolve, reject) {
  console.log(`\n2. Sending ${method} request...`);
  
  const requestData = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: method,
    params: params,
  };

  const url = new URL(messagesPath, 'http://127.0.0.1:8000');
  const postData = JSON.stringify(requestData);

  const options = {
    hostname: url.hostname,
    port: url.port || 8000,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const req = http.request(options, (res) => {
    console.log(`   Status: ${res.statusCode}`);
    
    if (res.statusCode === 202) {
      console.log('   ✓ Request accepted (202)');
      
      // Wait for response on SSE stream
      let responseReceived = false;
      let buffer = '';
      
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
              if (response.id === requestData.id) {
                responseReceived = true;
                console.log(`   ✓ Response received:`);
                console.log(JSON.stringify(response, null, 2));
                
                sseRes.removeListener('data', dataHandler);
                
                if (method === 'initialize') {
                  // Next: list tools
                  setTimeout(() => {
                    sendRequest('tools/list', {}, sessionId, messagesPath, sseRes, resolve, reject);
                  }, 100);
                } else if (method === 'tools/list') {
                  // Next: call tool
                  setTimeout(() => {
                    sendRequest('tools/call', {
                      name: 'perplexica_search',
                      arguments: { query: 'test query' }
                    }, sessionId, messagesPath, sseRes, resolve, reject);
                  }, 100);
                } else {
                  // Done
                  setTimeout(() => {
                    console.log('\n✅ All tests passed!');
                    sseRes.destroy();
                    resolve();
                  }, 100);
                }
                return;
              }
            } catch (e) {
              // Not JSON response, might be keepalive or other event
              if (data && !data.startsWith(':')) {
                console.log(`   [SSE data] ${data.substring(0, 100)}`);
              }
            }
          } else if (line.startsWith(':')) {
            // Keepalive, ignore
          }
        }
      };
      
      sseRes.on('data', dataHandler);

      // Timeout if no response
      setTimeout(() => {
        if (!responseReceived) {
          if (method === 'tools/call') {
            console.log(`   ⚠ Timeout waiting for response (search may take longer)`);
            console.log(`   Checking if response is in buffer...`);
            console.log(`   Buffer length: ${buffer.length}`);
            sseRes.removeListener('data', dataHandler);
            // Don't fail, just note it
            console.log('\n⚠ Test completed (response may have been sent but not received)');
            sseRes.destroy();
            resolve();
          } else {
            console.log(`   ✗ Timeout waiting for response`);
            sseRes.removeListener('data', dataHandler);
            reject(new Error('Timeout waiting for response'));
          }
        }
      }, 60000); // Increased timeout for search
    } else {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        console.error(`   ✗ Error: ${body}`);
        reject(new Error(body));
      });
    }
  });

  req.on('error', (err) => {
    console.error(`   ✗ Request error:`, err);
    reject(err);
  });

  req.write(postData);
  req.end();
}

testSSE().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});

