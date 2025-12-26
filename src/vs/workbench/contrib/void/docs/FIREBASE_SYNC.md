# RK IDE - Sincronização Firebase

Este documento descreve como o RK IDE se comunica com sites externos através do Firebase Firestore.

## Arquitetura

```
[Site React] <--lê/escreve--> [Firebase Firestore] <--lê/escreve--> [RK IDE local]
```

**Vantagens:**
- Não precisa de conexão direta localhost
- Funciona com qualquer site hospedado (Vercel, Netlify, etc)
- Tempo real via Firestore listeners
- Cada usuário tem dados isolados

## Estrutura do Firestore

```
users/
  {userId}/
    profile                    # Perfil do usuário
      - userId: string
      - createdAt: timestamp
      - lastSeen: timestamp
      - ideConnected: boolean

    status/
      current                  # Status atual do IDE
        - connected: boolean
        - currentModel: string
        - currentProvider: string
        - logsCount: number
        - pendingTasks: number
        - lastUpdate: timestamp

    commands/                  # Comandos do site para o IDE
      {commandId}/
        - type: string
        - payload: object
        - status: "pending" | "processing" | "completed" | "error"
        - createdAt: timestamp
        - processedAt: timestamp
        - result: object
        - error: string

    chat/
      threads/
        {threadId}/
          - id: string
          - title: string
          - createdAt: timestamp
          - lastModified: timestamp
          - messageCount: number

          messages/
            {messageId}/
              - id: string
              - role: "user" | "assistant"
              - content: string
              - timestamp: timestamp

    logs/
      {logId}/
        - id: string
        - action: "read" | "create" | "update" | "delete"
        - file: string
        - reason: string
        - impact: "baixo" | "médio" | "alto"
        - details: string
        - timestamp: timestamp
```

## Configuração do Firebase

### 1. Criar projeto no Firebase Console

1. Acesse [Firebase Console](https://console.firebase.google.com)
2. Crie um novo projeto
3. Ative o Firestore Database
4. Configure as regras de segurança

### 2. Regras do Firestore

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Cada usuário só acessa seus próprios dados
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Ou para desenvolvimento (menos seguro):
    match /users/{userId}/{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 3. Configuração no IDE

O IDE precisa da configuração do Firebase:

```typescript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## Tipos de Comandos

### send_message
Envia mensagem para o chat da IA.

```typescript
{
  type: "send_message",
  payload: {
    message: "Crie um arquivo test.js",
    threadId?: "thread-123",  // opcional
    context?: {
      files: ["/src/app.ts"],
      cwd: "/home/user/project"
    }
  }
}
```

### change_model
Troca o modelo de IA.

```typescript
{
  type: "change_model",
  payload: {
    modelName: "gpt-4",
    providerName: "openai",
    reason?: "Preciso de contexto maior"
  }
}
```

### file_operation
Executa operação de arquivo.

```typescript
{
  type: "file_operation",
  payload: {
    operation: "create" | "read" | "update" | "delete",
    path: "/src/newfile.ts",
    content?: "export const hello = 'world';",
    reason?: "Criando arquivo via site"
  }
}
```

### get_status
Obtém status do IDE.

```typescript
{
  type: "get_status",
  payload: {}
}
```

### get_logs
Obtém logs de ações.

```typescript
{
  type: "get_logs",
  payload: {
    limit?: 50,
    action?: "update",
    impact?: "alto",
    fromDate?: "2025-01-01",
    toDate?: "2025-12-31"
  }
}
```

### get_chat_history
Obtém histórico de threads.

```typescript
{
  type: "get_chat_history",
  payload: {}
}
```

### get_thread
Obtém thread específico.

```typescript
{
  type: "get_thread",
  payload: {
    threadId: "thread-123"
  }
}
```

## Exemplo: Site React

```typescript
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  orderBy
} from 'firebase/firestore';

const firebaseConfig = { /* sua config */ };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ID do usuário (deve ser o mesmo que o IDE usa)
const userId = 'user_abc123';

// Enviar comando para o IDE
async function sendCommand(type: string, payload: any) {
  const commandId = `cmd_${Date.now()}`;
  await setDoc(doc(db, `users/${userId}/commands`, commandId), {
    id: commandId,
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString()
  });
  return commandId;
}

// Escutar status do IDE
function watchStatus(callback: (status: any) => void) {
  return onSnapshot(
    doc(db, `users/${userId}/status`, 'current'),
    (doc) => {
      if (doc.exists()) {
        callback(doc.data());
      }
    }
  );
}

// Escutar logs em tempo real
function watchLogs(callback: (logs: any[]) => void) {
  const q = query(
    collection(db, `users/${userId}/logs`),
    orderBy('timestamp', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => doc.data());
    callback(logs);
  });
}

// Escutar resultado de comando
function watchCommandResult(commandId: string, callback: (result: any) => void) {
  return onSnapshot(
    doc(db, `users/${userId}/commands`, commandId),
    (doc) => {
      const data = doc.data();
      if (data?.status === 'completed' || data?.status === 'error') {
        callback(data);
      }
    }
  );
}

// Exemplo de uso
async function sendMessageToIDE(message: string) {
  const commandId = await sendCommand('send_message', { message });

  // Aguardar resultado
  watchCommandResult(commandId, (result) => {
    if (result.status === 'completed') {
      console.log('Mensagem processada:', result.result);
    } else {
      console.error('Erro:', result.error);
    }
  });
}
```

## Fluxo de Comunicação

### Site → IDE

1. Site escreve comando em `users/{userId}/commands/{commandId}`
2. IDE detecta novo comando (polling a cada 2s)
3. IDE processa comando
4. IDE atualiza status do comando para `completed` ou `error`
5. IDE escreve resultado no documento do comando
6. Site recebe atualização via listener

### IDE → Site

1. IDE executa ação (log, mensagem, etc)
2. IDE escreve em `users/{userId}/logs/` ou `users/{userId}/chat/`
3. Site recebe atualização via listener em tempo real

## Segurança

### Isolamento de Usuários

Cada usuário tem um `userId` único gerado pelo IDE:
- Formato: `user_{uuid}`
- Armazenado localmente no IDE
- Todos os dados ficam em `users/{userId}/`

### Autenticação (Recomendado)

Para produção, use Firebase Authentication:

1. Usuário faz login no site
2. Site obtém `uid` do Firebase Auth
3. IDE usa o mesmo `uid` como `userId`
4. Regras do Firestore validam `request.auth.uid == userId`

## Hooks React

```typescript
// useFirebaseSync.ts
import { useState, useEffect } from 'react';
import { onSnapshot, doc, collection, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export function useIDEStatus(userId: string) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    return onSnapshot(
      doc(db, `users/${userId}/status`, 'current'),
      (doc) => setStatus(doc.data())
    );
  }, [userId]);

  return status;
}

export function useLogs(userId: string) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, `users/${userId}/logs`),
      orderBy('timestamp', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(d => d.data()));
    });
  }, [userId]);

  return logs;
}

export function useChatThreads(userId: string) {
  const [threads, setThreads] = useState([]);

  useEffect(() => {
    return onSnapshot(
      collection(db, `users/${userId}/chat/threads`),
      (snapshot) => {
        setThreads(snapshot.docs.map(d => d.data()));
      }
    );
  }, [userId]);

  return threads;
}
```

## Troubleshooting

### IDE não conecta ao Firebase
- Verifique se a configuração está correta
- Verifique as regras do Firestore
- Verifique a conexão com internet

### Comandos não são processados
- Verifique se o IDE está conectado (status.connected = true)
- Verifique se o userId é o mesmo no site e no IDE
- Verifique o console do IDE para erros

### Dados não aparecem no site
- Verifique os listeners do Firestore
- Verifique as permissões de leitura
- Use o Firebase Console para debug
