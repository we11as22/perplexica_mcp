#!/usr/bin/env node

/**
 * Simple test for query variations - checks logs
 */

const http = require('http');

async function test() {
  console.log('=== Testing Query Variations ===\n');
  
  // Get session
  const sessionId = await new Promise((resolve, reject) => {
    const req = http.get('http://localhost:8000/sse', (res) => {
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.includes('session_id=')) {
            const match = line.match(/session_id=([^&\s]+)/);
            if (match) {
              req.destroy();
              resolve(match[1]);
              return;
            }
          }
        }
      });
    });
    req.setTimeout(5000, () => reject(new Error('Timeout')));
  });

  console.log(`✓ Session ID: ${sessionId}\n`);

  // Test with variations = 3
  console.log('Testing with queryVariationsCount = 3...');
  const req = http.request({
    hostname: 'localhost',
    port: 8000,
    path: `/messages?session_id=${sessionId}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    console.log(`Status: ${res.statusCode}`);
    if (res.statusCode === 202) {
      console.log('✓ Request accepted - check logs for query variations generation');
      console.log('✓ Look for: "Generated X query variations" in mcp-search logs');
    }
  });

  req.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'perplexica_search',
      arguments: {
        query: 'TypeScript best practices',
        focusMode: 'webSearch',
        optimizationMode: 'balanced',
        lastTwoMessages: [
          ['human', 'What is TypeScript?'],
          ['ai', 'TypeScript is a typed superset of JavaScript.']
        ],
        queryVariationsCount: 3,
        history: []
      }
    }
  }));
  req.end();

  setTimeout(() => {
    console.log('\n✓ Test request sent');
    console.log('Check logs: docker compose logs mcp-search | grep -i variation');
    process.exit(0);
  }, 2000);
}

test().catch(console.error);

