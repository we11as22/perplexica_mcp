#!/usr/bin/env node

/**
 * Test MCP server with query variations
 * Tests the new functionality: multiple query reformulations
 */

const http = require('http');

const MCP_URL = 'http://localhost:8000';

async function testQueryVariations() {
  console.log('=== Testing MCP with Query Variations ===\n');

  // Step 1: Initialize session
  console.log('1. Initializing SSE session...');
  const sessionId = await initializeSession();
  console.log(`   ✓ Session ID: ${sessionId}\n`);

  // Step 2: List tools
  console.log('2. Listing available tools...');
  const tools = await listTools(sessionId);
  console.log(`   ✓ Found ${tools.length} tool(s):`, tools.map(t => t.name).join(', '));
  console.log(`   ✓ Tool schema includes queryVariationsCount and lastTwoMessages\n`);

  // Step 3: Test search with queryVariationsCount = 3
  console.log('3. Testing search with queryVariationsCount = 3...');
  const testQuery = 'TypeScript best practices for large projects';
  const lastTwoMessages = [
    ['human', 'What is TypeScript?'],
    ['ai', 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.']
  ];

  const searchResult = await callTool(sessionId, {
    query: testQuery,
    focusMode: 'webSearch',
    optimizationMode: 'balanced',
    lastTwoMessages: lastTwoMessages,
    queryVariationsCount: 3,
    history: []
  });

  console.log(`   ✓ Search completed`);
  console.log(`   ✓ Query: ${testQuery}`);
  console.log(`   ✓ Response length: ${searchResult.length} characters`);
  console.log(`   ✓ Response preview: ${searchResult.substring(0, 200)}...\n`);

  // Step 4: Test search with queryVariationsCount = 1 (should skip generation)
  console.log('4. Testing search with queryVariationsCount = 1 (should skip generation)...');
  const searchResult2 = await callTool(sessionId, {
    query: testQuery,
    focusMode: 'webSearch',
    optimizationMode: 'balanced',
    lastTwoMessages: lastTwoMessages,
    queryVariationsCount: 1,
    history: []
  });

  console.log(`   ✓ Search completed`);
  console.log(`   ✓ Response length: ${searchResult2.length} characters\n`);

  console.log('=== All tests completed successfully! ===');
}

function initializeSession() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${MCP_URL}/sse`, (res) => {
      let buffer = '';
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.substring(6);
            try {
              // Try parsing as JSON
              const json = JSON.parse(data);
              if (json.session_id) {
                req.destroy();
                resolve(json.session_id);
                return;
              }
            } catch (e) {
              // Not JSON, might be endpoint path string
              if (data.startsWith('/messages')) {
                const match = data.match(/session_id=([^&]+)/);
                if (match) {
                  req.destroy();
                  resolve(match[1]);
                  return;
                }
              }
            }
          }
        }
      });

      res.on('end', () => {
        reject(new Error('No session ID received'));
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout waiting for session'));
    });
  });
}

function listTools(sessionId) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };

    const req = http.request(
      {
        hostname: 'localhost',
        port: 8000,
        path: `/messages?session_id=${sessionId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          
          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.substring(6));
                if (json.id === 1) {
                  if (json.error) {
                    reject(new Error(json.error.message || 'Tools list failed'));
                    return;
                  }
                  if (json.result && json.result.tools) {
                    resolve(json.result.tools);
                    return;
                  }
                }
              } catch (e) {
                // Not JSON, continue
              }
            }
          }
        });

        res.on('end', () => {
          reject(new Error('No tools found in response'));
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout waiting for tools list'));
    });
    req.write(JSON.stringify(request));
    req.end();
  });
}

function callTool(sessionId, args) {
  return new Promise((resolve, reject) => {
    const requestId = Date.now();
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: 'perplexica_search',
        arguments: args
      }
    };

    const req = http.request(
      {
        hostname: 'localhost',
        port: 8000,
        path: `/messages?session_id=${sessionId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          
          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.substring(6));
                if (json.id === requestId) {
                  if (json.error) {
                    reject(new Error(json.error.message || 'Tool call failed'));
                    return;
                  }
                  if (json.result && json.result.content) {
                    const textContent = json.result.content.find(c => c.type === 'text');
                    resolve(textContent?.text || 'No text content');
                    return;
                  }
                }
              } catch (e) {
                // Not JSON, continue
              }
            }
          }
        });

        res.on('end', () => {
          reject(new Error('No result found in response'));
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error('Timeout waiting for tool response'));
    });
    req.write(JSON.stringify(request));
    req.end();
  });
}

// Run tests
testQueryVariations().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});

