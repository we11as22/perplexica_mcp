# MCP Server Tests

Тестовые скрипты для проверки работы MCP сервера.

## Тесты

- **test-simple.js** - Простой тест stdio режима
- **test-stdio.js** - Полный тест stdio режима (tools/list, tools/call)
- **test-sse.js** - Базовый тест SSE режима
- **test-sse-full.js** - Полный тест SSE режима с полным циклом запросов
- **test-sse-direct.cjs** - Тест SSE режима с прямой конфигурацией (как в Cursor/Claude Desktop)
- **test-concurrent.cjs** - Тест параллельных запросов
- **test-npx.js** - Тест работы через npx
- **test-npx-final.js** - Финальный тест npx
- **test-mcp.ts** - TypeScript тест MCP клиента

## Запуск тестов

```bash
# SSE режим (требует запущенный Docker контейнер)
node tests/test-sse-direct.cjs

# Параллельные запросы
node tests/test-concurrent.cjs

# stdio режим
node tests/test-stdio.js
```

## Требования

- Запущенный Docker контейнер с MCP сервером (для SSE тестов)
- Node.js 20+

