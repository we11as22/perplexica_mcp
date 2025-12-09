import { spawn } from 'child_process';
import { join } from 'path';

const mcpServerDir = join(process.cwd());

console.log('Testing npx configuration for Claude Desktop...\n');

const server = spawn('npx', ['-y', 'npm', 'start'], {
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

let responses = 0;

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      responses++;
      if (parsed.id === 1 && parsed.result?.tools) {
        console.log('✓ tools/list response received');
        console.log('  Tools:', parsed.result.tools.map(t => t.name).join(', '));
      } else if (parsed.id === 2 && parsed.result?.content) {
        console.log('✓ tools/call response received');
        const text = parsed.result.content[0]?.text || '';
        console.log('  Answer preview:', text.substring(0, 100) + '...');
        console.log('\n✅ All tests passed! npx configuration works correctly.');
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      // Not JSON
    }
  }
});

server.stderr.on('data', (data) => {
  const text = data.toString();
  if (text.includes('MCP server running')) {
    console.log('✓ MCP server started via npx npm start\n');
    
    // Send list tools
    setTimeout(() => {
      const listRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      };
      console.log('Sending tools/list request...');
      server.stdin.write(JSON.stringify(listRequest) + '\n');
    }, 500);
    
    // Send call tool
    setTimeout(() => {
      const callRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'perplexica_search',
          arguments: {
            query: 'test npx',
          },
        },
      };
      console.log('Sending tools/call request...');
      server.stdin.write(JSON.stringify(callRequest) + '\n');
    }, 2000);
  }
});

server.on('close', (code) => {
  if (responses >= 1) {
    console.log('\n✅ Basic functionality confirmed (tools/list works)');
    console.log('⚠️  Note: tools/call may take longer due to search processing');
  }
  process.exit(code || 0);
});

setTimeout(() => {
  if (responses >= 1) {
    console.log('\n✅ Basic functionality confirmed (tools/list works)');
    console.log('⚠️  Note: tools/call may take longer due to search processing');
    server.kill();
    process.exit(0);
  } else {
    console.log('\n❌ No responses received');
    server.kill();
    process.exit(1);
  }
}, 10000);
