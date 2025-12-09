# MCP (Model Context Protocol) Integration

Perplexica предоставляет MCP сервер для интеграции с агентами, поддерживающими Model Context Protocol (например, Claude Desktop, Cursor и др.).

## Что такое MCP?

Model Context Protocol (MCP) — это открытый стандарт от Anthropic, который позволяет LLM-приложениям подключаться к внешним источникам данных и инструментам через стандартизированный интерфейс.

## Быстрый старт

### 1. Сборка MCP сервера

```bash
cd mcp-server
npm install
npm run build
```

### 2. Запуск Perplexica

```bash
docker compose up -d perplexica
```

Убедитесь, что Perplexica доступна на `http://localhost:3000`.

### 3. Настройка переменных окружения

Создайте файл `.env` или экспортируйте переменные:

```bash
export PERPLEXICA_API_URL=http://localhost:3000
export MCP_PROVIDER_NAME=OpenAI
export MCP_EMBED_PROVIDER_NAME=Transformers
export MCP_LLM_MODEL=qwen-3-32b
export MCP_EMBED_MODEL=Xenova/all-MiniLM-L6-v2
export MCP_FOCUS_MODE=webSearch
export MCP_OPTIMIZATION_MODE=speed
export MCP_SYSTEM_INSTRUCTIONS=
export MCP_TRANSPORT=sse  # или stdio для локального использования
export MCP_PORT=8000
export MCP_HOST=0.0.0.0
```

## Режимы работы

MCP сервер поддерживает два режима работы:

### 1. stdio (локальный режим)

Используется для локального подключения через Claude Desktop или другие клиенты через stdin/stdout.

```bash
export MCP_TRANSPORT=stdio
node mcp-server/dist/index.js
```

### 2. SSE (удаленный режим)

Используется для удаленного доступа по HTTP через Server-Sent Events. Позволяет обращаться к MCP серверу по URL.

```bash
export MCP_TRANSPORT=sse
export MCP_PORT=8000
export MCP_HOST=0.0.0.0
node mcp-server/dist/index.js
```

Сервер будет доступен по адресу: `http://your-server:8000/sse`

## Подключение к удаленному MCP серверу через SSE

Если MCP сервер запущен на удаленном сервере с SSE транспортом, вы можете подключиться к нему по URL.

### Пример конфигурации для Claude Desktop (удаленный сервер)

```json
{
  "mcpServers": {
    "perplexica-search-remote": {
      "url": "https://your-server.com:8000/sse"
    }
  }
}
```

**Примечание:** Claude Desktop может не поддерживать прямое подключение через URL. В этом случае используйте локальный клиент или прокси.

### Использование через HTTP клиент

Вы можете обращаться к удаленному MCP серверу напрямую через HTTP:

1. **Получить сессию:**
```bash
curl -N http://your-server:8000/sse
```

Ответ содержит endpoint для отправки сообщений:
```
event: endpoint
data: /messages?session_id=XXXX-XXXX-XXXX
```

2. **Отправить запрос:**
```bash
curl -X POST "http://your-server:8000/messages?session_id=XXXX-XXXX-XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

Ответ придет через SSE поток на `/sse` endpoint.

## Подключение к Claude Desktop

### Шаг 1: Найти конфигурационный файл Claude Desktop

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Шаг 2: Добавить конфигурацию MCP сервера

Откройте файл конфигурации и добавьте один из вариантов:

#### Вариант 1: Использование npx (рекомендуется)

```json
{
  "mcpServers": {
    "perplexica-search": {
      "command": "npx",
      "args": [
        "-y",
        "npm",
        "start"
      ],
      "cwd": "/полный/путь/к/проекту/helpfull_mcp/perplexica_mcp/mcp-server",
      "env": {
        "PERPLEXICA_API_URL": "http://localhost:3000",
        "MCP_PROVIDER_NAME": "OpenAI",
        "MCP_EMBED_PROVIDER_NAME": "Transformers",
        "MCP_LLM_MODEL": "qwen-3-32b",
        "MCP_EMBED_MODEL": "Xenova/all-MiniLM-L6-v2",
        "MCP_FOCUS_MODE": "webSearch",
        "MCP_OPTIMIZATION_MODE": "balanced",
        "MCP_SYSTEM_INSTRUCTIONS": ""
      }
    }
  }
}
```

#### Вариант 2: Прямой запуск через node

```json
{
  "mcpServers": {
    "perplexica-search": {
      "command": "node",
      "args": [
        "/полный/путь/к/проекту/helpfull_mcp/perplexica_mcp/mcp-server/dist/index.js"
      ],
      "env": {
        "PERPLEXICA_API_URL": "http://localhost:3000",
        "MCP_PROVIDER_NAME": "OpenAI",
        "MCP_EMBED_PROVIDER_NAME": "Transformers",
        "MCP_LLM_MODEL": "qwen-3-32b",
        "MCP_EMBED_MODEL": "Xenova/all-MiniLM-L6-v2",
        "MCP_FOCUS_MODE": "webSearch",
        "MCP_OPTIMIZATION_MODE": "balanced",
        "MCP_SYSTEM_INSTRUCTIONS": ""
      }
    }
  }
}
```

**Важно:** Замените `/полный/путь/к/проекту/` на реальный путь к вашему проекту.

**Преимущества варианта с npx:**
- Не требует указывать полный путь к `dist/index.js`
- Автоматически использует `npm start` из `package.json`
- Более гибкий и переносимый вариант

### Шаг 3: Перезапустить Claude Desktop

Закройте и снова откройте Claude Desktop. MCP сервер должен автоматически подключиться.

### Шаг 4: Проверка подключения

В Claude Desktop вы должны увидеть инструмент `perplexica_search` в списке доступных инструментов. Попробуйте задать вопрос, который требует поиска в интернете.

## Доступные инструменты

### `perplexica_search`

Выполняет поиск в интернете через Perplexica и возвращает ответ с цитатами из источников.

**Параметры:**
- `query` (обязательно, string) — поисковый запрос
- `focusMode` (опционально, string) — режим поиска:
  - `webSearch` (по умолчанию) — общий веб-поиск
  - `academicSearch` — академический поиск
  - `writingAssistant` — помощник по написанию
  - `wolframAlphaSearch` — вычисления через Wolfram Alpha
  - `youtubeSearch` — поиск на YouTube
  - `redditSearch` — поиск на Reddit
- `optimizationMode` (опционально, string) — режим оптимизации:
  - `balanced` (по умолчанию) — сбалансированный
  - `speed` — быстрый
- `history` (опционально, array) — история разговора в формате `[["role", "text"], ...]`

**Пример использования в Claude:**

```
Используй perplexica_search чтобы найти информацию о Model Context Protocol
```

## Настройка провайдеров

### Использование OpenAI-совместимого API

```bash
export MCP_PROVIDER_NAME=OpenAI
export MCP_LLM_MODEL=gpt-4o-mini
export MCP_EMBED_MODEL=text-embedding-3-small
```

В `.env` файле Perplexica:
```
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

### Использование Anthropic Claude

```bash
export MCP_PROVIDER_NAME=Anthropic
export MCP_LLM_MODEL=claude-3-5-sonnet-20241022
export MCP_EMBED_PROVIDER_NAME=Transformers
export MCP_EMBED_MODEL=Xenova/all-MiniLM-L6-v2
```

В `.env` файле Perplexica:
```
ANTHROPIC_API_KEY=your-api-key
```

### Использование локальных эмбеддингов (Transformers)

Для эмбеддингов можно использовать локальные модели через провайдер Transformers:

```bash
export MCP_EMBED_PROVIDER_NAME=Transformers
export MCP_EMBED_MODEL=Xenova/all-MiniLM-L6-v2
```

Это не требует API ключей и работает полностью локально.

## Тестирование MCP сервера

### Тест через простой скрипт

```bash
cd mcp-server
node test-simple.js
```

Скрипт отправит запросы на список инструментов и выполнит тестовый поиск.

### Тест через MCP Inspector

Установите MCP Inspector:

```bash
npm install -g @modelcontextprotocol/inspector
```

Запустите инспектор:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Это откроет веб-интерфейс для тестирования MCP сервера.

## Устранение неполадок

### MCP сервер не подключается

1. Убедитесь, что Perplexica запущена и доступна на `http://localhost:3000`
2. Проверьте, что путь к `dist/index.js` в конфигурации Claude Desktop правильный
3. Проверьте логи Claude Desktop на наличие ошибок

### Ошибка "No configured providers found"

1. Убедитесь, что в Perplexica настроены провайдеры (откройте `http://localhost:3000` и проверьте настройки)
2. Проверьте, что переменные `MCP_PROVIDER_NAME` и `MCP_EMBED_PROVIDER_NAME` соответствуют именам провайдеров в Perplexica

### Ошибка подключения к Perplexica

1. Проверьте, что `PERPLEXICA_API_URL` указывает на правильный адрес
2. Если Perplexica запущена в Docker, используйте `http://localhost:3000` для локального подключения
3. Убедитесь, что порт 3000 не заблокирован файрволом

## Дополнительные ресурсы

- [Официальная документация MCP](https://modelcontextprotocol.io/)
- [Документация Perplexica API](docs/API/SEARCH.md)
- [Примеры использования MCP](https://github.com/modelcontextprotocol/servers)

## Запуск через Docker Compose с SSE

Для запуска MCP сервера в режиме SSE через Docker Compose:

```bash
# В .env файле установите:
MCP_TRANSPORT=sse
MCP_PORT=8000
MCP_HOST=0.0.0.0

# Запустите сервисы:
docker compose up -d mcp-search perplexica
```

MCP сервер будет доступен по адресу: `http://your-server:8000/sse`

### Пример использования удаленного MCP сервера

Если MCP сервер запущен на `https://mcp.example.com:8000`, вы можете обращаться к нему:

```bash
# 1. Получить сессию
curl -N https://mcp.example.com:8000/sse

# Ответ:
# event: endpoint
# data: /messages?session_id=XXXX-XXXX-XXXX

# 2. Отправить запрос на список инструментов
curl -X POST "https://mcp.example.com:8000/messages?session_id=XXXX-XXXX-XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'

# 3. Вызвать инструмент поиска
curl -X POST "https://mcp.example.com:8000/messages?session_id=XXXX-XXXX-XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "perplexica_search",
      "arguments": {
        "query": "test search"
      }
    }
  }'
```

Ответы приходят через SSE поток на `/sse` endpoint.
