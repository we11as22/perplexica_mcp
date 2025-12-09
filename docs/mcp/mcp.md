# MCP usage (perplexica_mcp)

## Quick start
1) `cp .env.template .env`  
2) В `.env` задайте:
   - `OPENAI_API_KEY` — ключ к OpenAI-совместимому API (например, copilot `sk-...`)
   - `OPENAI_BASE_URL` — базовый URL API (для copilot: `https://api.copilot.vk.team/`)
   - `MCP_LLM_MODEL` — LLM (пример: `qwen-3-32b`)
   - `MCP_EMBED_MODEL` — эмбеддинги (пример: `Xenova/all-MiniLM-L6-v2`)
   - `MCP_PROVIDER_NAME` — провайдер для LLM (например, `OpenAI`)
   - `MCP_EMBED_PROVIDER_NAME` — провайдер для эмбеддингов (например, `Transformers`)
3) Запуск: `docker compose up --build mcp-search perplexica`

## HTTP-интерфейс MCP
- Endpoint: `POST http://localhost:${MCP_PORT:-8000}/tools/perplexica_search`
- Тело запроса (JSON):
  - `query` (string, обязательно)
  - опционально: `focusMode` (`webSearch` | `academicSearch` | `writingAssistant` | `wolframAlphaSearch` | `youtubeSearch` | `redditSearch`)
  - опционально: `optimizationMode` (`balanced` | `speed`)
  - опционально: `history` (массив пар `[role, text]`)

Пример:
```bash
curl -s -X POST http://localhost:8000/tools/perplexica_search \
  -H 'Content-Type: application/json' \
  -d '{ "query": "hello world" }'
```

## Примечания
- Провайдеры для LLM и эмбеддингов выбираются независимо по `MCP_PROVIDER_NAME` и `MCP_EMBED_PROVIDER_NAME`.
- По умолчанию MCP бьётся в сервис Perplexica по `PERPLEXICA_API_URL` (в docker-compose это `http://perplexica:3000`).

## Пример: подключение к Claude (Anthropic)
Если нужно использовать Claude через Anthropic API:
1) В `.env` укажите:
   - `MCP_PROVIDER_NAME=Anthropic`
   - `OPENAI_API_KEY=<ваш антропик ключ>` (переменная общая для OpenAI-подобного клиента)
   - `OPENAI_BASE_URL=https://api.anthropic.com/v1`
   - `MCP_LLM_MODEL=claude-3-5-sonnet-20241022` (или нужную модель из `/v1/models`)
   - `MCP_EMBED_PROVIDER_NAME=Transformers`
   - `MCP_EMBED_MODEL=Xenova/all-MiniLM-L6-v2` (локальные эмбеддинги)
2) Запустить: `docker compose up --build mcp-search perplexica`
3) Проверка:
   ```bash
   curl -s -X POST http://localhost:8000/tools/perplexica_search \
     -H 'Content-Type: application/json' \
     -d '{ "query": "hello from claude" }'
   ```

