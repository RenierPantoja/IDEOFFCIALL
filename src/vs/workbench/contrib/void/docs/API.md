# RK IDE - API de Comunicação Externa

Esta documentação descreve a API HTTP/WebSocket do RK IDE para comunicação com aplicações externas.

## Visão Geral

O RK IDE expõe uma API REST e WebSocket que permite:
- Enviar mensagens para o chat da IA
- Trocar o modelo de IA dinamicamente
- Executar operações de arquivo
- Obter logs de ações da IA
- Receber eventos em tempo real

## Configuração

### Porta Padrão
- **HTTP/REST**: `http://localhost:23119`
- **WebSocket**: `ws://localhost:23119/api/void/realtime`

### CORS
A API aceita requisições de qualquer origem por padrão.

---

## Endpoints REST

### Status do IDE

```http
GET /api/void/status
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "currentModel": "claude-3-5-sonnet",
    "currentProvider": "anthropic",
    "logsCount": 42,
    "pendingTasks": 0
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### Obter Logs

```http
GET /api/void/logs?limit=50&action=update&impact=alto
```

**Parâmetros de Query:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| limit | number | Número máximo de logs (padrão: 100) |
| action | string | Filtrar por ação: read, create, update, delete |
| impact | string | Filtrar por impacto: baixo, médio, alto |
| filePattern | string | Regex para filtrar por arquivo |
| fromDate | string | Data inicial (ISO 8601) |
| toDate | string | Data final (ISO 8601) |

**Resposta:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "type": "ai_action_log",
        "id": "log_123456789_abc",
        "action": "update",
        "file": "/src/app.ts",
        "reason": "LLM editou arquivo",
        "impact": "médio",
        "details": "Arquivo editado com search/replace blocks",
        "timestamp": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 42,
    "hasMore": false
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### Histórico do Chat

```http
GET /api/void/chat/history
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "threads": [
      {
        "id": "thread-123",
        "title": "Criar componente React",
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-01T01:00:00.000Z",
        "messageCount": 10
      }
    ]
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### Obter Thread Específico

```http
GET /api/void/chat/thread/:threadId
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "id": "thread-123",
    "title": "Criar componente React",
    "messages": [
      {
        "id": "msg-1",
        "role": "user",
        "content": "Crie um componente Button",
        "timestamp": "2025-01-01T00:00:00.000Z"
      },
      {
        "id": "msg-2",
        "role": "assistant",
        "content": "Vou criar o componente...",
        "timestamp": "2025-01-01T00:00:01.000Z"
      }
    ]
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### Enviar Mensagem para o Chat

```http
POST /api/void/chat/send
Content-Type: application/json
```

**Body:**
```json
{
  "message": "Crie um arquivo test.js com uma função de soma",
  "threadId": "thread-123",
  "context": {
    "files": ["/src/utils.ts"],
    "cwd": "/home/user/project"
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "threadId": "thread-123",
    "messageId": "msg-456",
    "status": "queued"
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### Trocar Modelo de IA

```http
POST /api/void/model/change
Content-Type: application/json
```

**Body:**
```json
{
  "modelName": "gpt-4",
  "providerName": "openai",
  "reason": "Preciso de contexto maior"
}
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "previousModel": "claude-3-5-sonnet",
    "newModel": "gpt-4",
    "success": true
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

### Operação de Arquivo

```http
POST /api/void/file/operation
Content-Type: application/json
```

**Body:**
```json
{
  "operation": "create",
  "path": "/src/newfile.ts",
  "content": "export const hello = () => 'world';",
  "reason": "Criando arquivo via API"
}
```

**Operações disponíveis:**
- `read` - Ler arquivo
- `create` - Criar arquivo
- `update` - Atualizar arquivo
- `delete` - Deletar arquivo

**Resposta:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "path": "/src/newfile.ts",
    "checkpointId": "checkpoint_abc123"
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## WebSocket

### Conectar

```javascript
const ws = new WebSocket('ws://localhost:23119/api/void/realtime');

ws.onopen = () => {
  console.log('Conectado ao RK IDE');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Mensagem recebida:', message);
};
```

### Tipos de Mensagens

#### ai_action_log
Emitido quando a IA executa uma ação.

```json
{
  "type": "ai_action_log",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "payload": {
    "type": "ai_action_log",
    "id": "log_123",
    "action": "update",
    "file": "/src/app.ts",
    "reason": "LLM editou arquivo",
    "impact": "médio",
    "details": "..."
  }
}
```

#### chat_message
Emitido quando há uma nova mensagem no chat.

```json
{
  "type": "chat_message",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "payload": {
    "threadId": "thread-123",
    "messageId": "msg-456",
    "role": "assistant",
    "content": "Arquivo criado com sucesso!",
    "isStreaming": false,
    "isComplete": true
  }
}
```

#### model_changed
Emitido quando o modelo de IA é trocado.

```json
{
  "type": "model_changed",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "payload": {
    "oldModel": "claude-3-5-sonnet",
    "newModel": "gpt-4"
  }
}
```

#### task_update
Emitido quando uma tarefa assíncrona é atualizada.

```json
{
  "type": "task_update",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "payload": {
    "taskId": "task-123",
    "status": "completed",
    "progress": 100,
    "result": { ... }
  }
}
```

### Ping/Pong

Para manter a conexão ativa:

```javascript
// Enviar ping
ws.send(JSON.stringify({ type: 'ping' }));

// Receber pong
// { "type": "pong", "timestamp": "..." }
```

---

## Exemplos de Uso

### JavaScript/Node.js

```javascript
// Enviar mensagem para o chat
async function sendMessage(message) {
  const response = await fetch('http://localhost:23119/api/void/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  return response.json();
}

// Escutar eventos em tempo real
const ws = new WebSocket('ws://localhost:23119/api/void/realtime');
ws.onmessage = (e) => {
  const { type, payload } = JSON.parse(e.data);

  if (type === 'ai_action_log') {
    console.log(`[${payload.impact}] ${payload.action}: ${payload.file}`);
  }
};
```

### Python

```python
import requests
import websocket
import json

# Enviar mensagem
def send_message(message):
    response = requests.post(
        'http://localhost:23119/api/void/chat/send',
        json={'message': message}
    )
    return response.json()

# WebSocket
def on_message(ws, message):
    data = json.loads(message)
    print(f"Received: {data['type']}")

ws = websocket.WebSocketApp(
    'ws://localhost:23119/api/void/realtime',
    on_message=on_message
)
ws.run_forever()
```

### cURL

```bash
# Status
curl http://localhost:23119/api/void/status

# Enviar mensagem
curl -X POST http://localhost:23119/api/void/chat/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Olá, crie um arquivo test.js"}'

# Obter logs
curl "http://localhost:23119/api/void/logs?limit=10&action=update"
```

---

## Códigos de Erro

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso |
| 400 | Requisição inválida |
| 404 | Recurso não encontrado |
| 500 | Erro interno do servidor |

---

## Segurança

⚠️ **Atenção**: A API é exposta localmente e não possui autenticação por padrão. Para uso em produção, considere:

1. Usar apenas em localhost
2. Implementar autenticação via token
3. Configurar CORS adequadamente
4. Usar HTTPS se expor externamente
