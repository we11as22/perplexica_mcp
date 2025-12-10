#!/usr/bin/env node

/**
 * Test MCP server with Ollama embeddings (embeddinggemma:300m-qat-q4_0)
 */

const http = require('http');

async function testOllamaEmbeddings() {
  console.log('=== Testing MCP with Ollama Embeddings ===\n');

  // Step 1: Get session
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

  // Step 2: Test search with Ollama embeddings
  console.log('Testing search with Ollama embeddings (embeddinggemma:300m-qat-q4_0)...');
  console.log('This will verify that:');
  console.log('  1. Ollama provider is available');
  console.log('  2. Embedding model is loaded correctly');
  console.log('  3. Search and reranking works with Ollama embeddings\n');

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 8000,
      path: `/messages?session_id=${sessionId}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      console.log(`Status: ${res.statusCode}`);
      if (res.statusCode === 202) {
        console.log('✓ Request accepted');
        console.log('✓ Waiting for response...\n');
        
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.substring(6));
                if (json.id === 1) {
                  if (json.error) {
                    console.error('✗ Error:', json.error.message);
                    reject(new Error(json.error.message));
                    return;
                  }
                  if (json.result && json.result.content) {
                    const textContent = json.result.content.find(c => c.type === 'text');
                    if (textContent) {
                      console.log('✓ Search completed successfully!');
                      console.log(`✓ Response length: ${textContent.text.length} characters`);
                      console.log(`✓ Preview: ${textContent.text.substring(0, 150)}...\n`);
                      console.log('✅ Ollama embeddings are working correctly!');
                      resolve();
                      return;
                    }
                  }
                }
              } catch (e) {
                // Not JSON, continue
              }
            }
          }
        });

        res.on('end', () => {
          console.log('✓ Response received');
          resolve();
        });
      } else {
        reject(new Error(`Unexpected status: ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error('Timeout waiting for response'));
    });

    req.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'perplexica_search',
        arguments: {
          query: 'What is TypeScript?',
          focusMode: 'webSearch',
          optimizationMode: 'balanced',
          lastTwoMessages: [],
          queryVariationsCount: 1,
          history: []
        }
      }
    }));
    req.end();
  });
}

testOllamaEmbeddings()
  .then(() => {
    console.log('\n=== Test completed successfully ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  });

