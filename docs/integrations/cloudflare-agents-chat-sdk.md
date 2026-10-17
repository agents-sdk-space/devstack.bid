# Cloudflare Agents chat client SDK · คู่มือ Chat client SDK

This page explains how a browser or server talks to a chat agent built with the Cloudflare Agents SDK. It is a short guide written by devstack.bid. The source of truth is the Cloudflare documentation: [Client SDK](https://developers.cloudflare.com/agents/communication-channels/chat/client-sdk/) and [Chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/). APIs change, so check those pages before you ship.

คู่มือนี้สรุปวิธีเชื่อมเว็บหรือเซิร์ฟเวอร์เข้ากับ chat agent ที่สร้างด้วย Cloudflare Agents SDK (useAgent, useAgentChat, AgentClient, agentFetch, tools, การอนุมัติ, stream ที่ต่อได้ และการเก็บประวัติ) เขียนใหม่ด้วยคำของ devstack.bid โดยอ้างอิงเอกสารของ Cloudflare ถามเพิ่มได้ที่ DevStack Chat (`/chat`) ซึ่งใช้สรุปนี้ช่วยตอบคำถามเรื่อง SDK ทั้งภาษาไทยและอังกฤษ

## Overview

An agent is a Durable Object class that keeps its own state and SQLite storage. Clients connect to one *instance* of it, named by you (a room id, a user id). There are three ways in:

| Client | Package | Use it when |
| --- | --- | --- |
| `useAgent` | `agents/react` | React app, live connection, state sync, reconnects for you |
| `AgentClient` | `agents/client` | Any JS runtime (Vue, Svelte, Node, Bun, Deno) over WebSocket |
| `agentFetch` | `agents/client` | One HTTP request, no open connection (server to server, cron) |

For chat UIs there is one more layer: `useAgentChat` from `@cloudflare/ai-chat/react`. It sits on top of `useAgent` and gives you the AI SDK `useChat` shape (messages, `sendMessage`, `status`) over the agent's WebSocket.

All WebSocket clients share the same features: two-way state sync, RPC calls to agent methods, streamed replies, and automatic reconnect with backoff.

## Install

```bash
npm i agents @cloudflare/ai-chat ai @ai-sdk/react workers-ai-provider
```

The agent needs a Durable Object binding and a SQLite migration in `wrangler.jsonc`, because chat history and stream buffers live in SQLite:

```jsonc
{
  "ai": { "binding": "AI" },
  "durable_objects": { "bindings": [{ "name": "ChatAgent", "class_name": "ChatAgent" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["ChatAgent"] }]
}
```

## Connecting with useAgent

`agent` is the class name. It becomes kebab-case in the URL (`ChatAgent` → `/agents/chat-agent/<name>`). `name` picks the instance and defaults to `"default"`.

```tsx
import { useAgent } from "agents/react";

const agent = useAgent({
  agent: "ChatAgent",
  name: roomId,
  onStateUpdate: (state, source) => setState(state), // source: "server" | "client"
});
```

Useful options:

- `host` and `path`: connect to another Worker or a custom route. Default is the current origin.
- `query`: values sent when the socket opens. It can be an async function, for example to fetch an auth token. The result is cached (`cacheTtl`, default 5 minutes), refreshed when `queryDeps` change, and dropped on every disconnect, so a reconnect gets a fresh token.
- `onOpen`, `onClose`, `onError`, `onMessage`, `onMcpUpdate` (state of the agent's MCP servers).

The hook returns `state`, `setState()`, `call()`, a typed `stub`, `send()`, `close()` and `reconnect()`. React closes the socket on unmount.

### State sync

`agent.state` is `undefined` until the first message from the server. `agent.setState(next)` sends the state to the agent, the agent runs `onStateChanged()` and broadcasts it to every connected client, and your `onStateUpdate` fires with `source: "client"`.

### Calling agent methods (RPC)

Methods marked `@callable()` on the agent can be called from the client. Pass the agent class as a type parameter to get typed calls:

```ts
import type { ChatAgent } from "./server";

const agent = useAgent<ChatAgent>({ agent: "ChatAgent", name: roomId });
const stats = await agent.stub.getStats();       // same as agent.call("getStats")
```

A method marked `@callable({ streaming: true })` receives a stream object as its first argument (`stream.send(chunk)`, `stream.end()`). The client reads it with `onChunk`, `onDone` and `onError` options on `call()`. Errors thrown in the method reject the client's promise.

### Without React: AgentClient and agentFetch

```ts
import { AgentClient, agentFetch } from "agents/client";

const client = new AgentClient({ agent: "ChatAgent", name: "room-1", host: "my-worker.example.workers.dev" });
await client.call("sendMessage", ["hi"]);
client.close(); // close it yourself when done

const res = await agentFetch({ agent: "ChatAgent", name: "room-1", host: "my-worker.example.workers.dev" });
```

To drive an AI SDK chat UI in Vue or another framework, wrap the client in `WebSocketChatTransport` from `agents/chat/transport` and pass it to that framework's `useChat`.

## useAgentChat

```tsx
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";

export function Chat() {
  const agent = useAgent({ agent: "ChatAgent", name: userId });
  const { messages, sendMessage, status, stop, clearHistory } = useAgentChat({ agent });
  // render messages, call sendMessage({ text }) from your form
}
```

Besides `messages`, `sendMessage` and `status`, it returns `clearHistory`, `setMessages`, `addToolOutput`, `addToolApprovalResponse`, `stop`, and flags such as `isStreaming`, `isServerStreaming` and `isRecovering`.

On the server, extend `AIChatAgent` and return a streaming `Response` from `onChatMessage`:

```ts
import { AIChatAgent } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages } from "ai";

export class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage(_onFinish, options) {
    const ai = createWorkersAI({ binding: this.env.AI });
    return streamText({
      model: ai("@cf/zai-org/glm-4.7-flash"),
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal,
    }).toUIMessageStreamResponse();
  }
}
```

## Message handling

- Messages are AI SDK `UIMessage` objects. Render `msg.parts`: `text` parts, tool parts, and your own `data-*` parts.
- Extra data per request: pass `body` to `useAgentChat` (an object or a function). The server reads it as `options.body` in `onChatMessage`. `prepareSendMessagesRequest` can add headers too.
- Data parts: on the server, write `{ type: "data-sources", id, data }` into a `createUIMessageStream` writer. Writing the same type and id again updates the part in place. Mark a part `transient: true` to send it without storing it, and read it on the client with `onData`.
- Overlapping sends: `messageConcurrency` on the agent decides what happens (`"queue"` by default; also `"latest"`, `"merge"`, `"drop"` or a debounce).
- Every client connected to the same instance gets the updated message list, so two tabs stay in sync.

## Tools and human-in-the-loop

Three kinds of tools, all defined with the AI SDK `tool()` helper:

1. **Server tools** have an `execute` function and run inside the agent.
2. **Client tools** have no `execute`. The browser handles them in `onToolCall` and answers with `addToolOutput({ toolCallId, output })`.
3. **Approval tools** add `needsApproval` (a boolean or a function of the input). The turn pauses until the user answers.

```ts
// server
processRefund: tool({
  description: "Refund an order",
  inputSchema: z.object({ orderId: z.string(), amount: z.number() }),
  needsApproval: async ({ amount }) => amount > 50,
  execute: async ({ orderId, amount }) => refund(orderId, amount),
}),
```

```tsx
// client: find parts waiting for approval and answer them
import { getToolApproval, getToolPartState } from "@cloudflare/ai-chat/react";

if (getToolPartState(part) === "waiting-approval") {
  const a = getToolApproval(part);
  if (a) addToolApprovalResponse({ id: a.id, approved: true });
}
```

To reject with a reason the model can read, call `addToolOutput` with `state: "output-error"` and an `errorText`. Cap tool loops with `stopWhen: stepCountIs(n)`.

## Resumable streams

Nothing to configure. While a reply streams, the agent buffers chunks in SQLite. If the browser drops, the agent keeps generating; when the client reconnects it replays the buffer and continues live. Closing a tab does not cancel the server turn; calling `stop()` does. Set `cancelOnClientAbort: true` if the browser should own the turn, or `resume: false` to turn resuming off. If the agent itself restarts mid-turn, `chatRecovery` settings control how many times it retries and when it gives up.

## Persistence

- `this.messages` holds the history, loaded from SQLite and saved after every turn.
- `maxPersistedMessages` limits how many messages are stored. It does not limit what the model sees; use the AI SDK `pruneMessages()` for that.
- `persistMessages(msgs)` stores and broadcasts without starting a reply. `saveMessages(msgs)` stores and starts a reply, after any running turn finishes. Both are handy for scheduled or server-started messages.
- Rows have a 2 MB limit. Very large tool outputs are compacted automatically, and `sanitizeMessageForPersistence()` lets you redact parts before they are saved.

## Examples

Small, copy-ready snippets.

### Minimal React chat

```tsx
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";

export function Chat({ userId }: { userId: string }) {
  const agent = useAgent({ agent: "ChatAgent", name: userId });
  const { messages, sendMessage, status, stop } = useAgentChat({ agent });
  return (
    <>
      {messages.map((m) => (
        <p key={m.id}><b>{m.role}:</b> {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</p>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); const i = e.currentTarget.q; sendMessage({ text: i.value }); i.value = ""; }}>
        <input name="q" />
        {status === "streaming" ? <button type="button" onClick={stop}>Stop</button> : <button disabled={status !== "ready"}>Send</button>}
      </form>
    </>
  );
}
```

### Auth token on connect

```ts
const agent = useAgent({
  agent: "ChatAgent",
  name: userId,
  query: async () => ({ token: await getToken() }),
  queryDeps: [userId],
  cacheTtl: 55 * 60 * 1000, // refresh before a 1-hour token expires
});
```

Check the token in the agent's `onConnect` (or in your Worker before routing) and close the connection if it is invalid.

### Vue (no React)

```ts
import { useChat } from "@ai-sdk/vue";
import { AgentClient } from "agents/client";
import { WebSocketChatTransport } from "agents/chat/transport";

const agent = new AgentClient({ agent: "ChatAgent", name: userId, host: location.host });
const { messages, sendMessage, status } = useChat({ transport: new WebSocketChatTransport({ agent }) });
```

### Client-side tool (browser location)

```ts
useAgentChat({
  agent,
  onToolCall: async ({ toolCall, addToolOutput }) => {
    if (toolCall.toolName !== "getLocation") return;
    const pos = await new Promise<GeolocationPosition>((ok, no) => navigator.geolocation.getCurrentPosition(ok, no));
    addToolOutput({ toolCallId: toolCall.toolCallId, output: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
  },
});
```

### Approve or reject a tool call

```tsx
import { getToolApproval, getToolPartState } from "@cloudflare/ai-chat/react";

function Approval({ part, respond }) {
  const a = getToolApproval(part);
  if (getToolPartState(part) !== "waiting-approval" || !a) return null;
  return (
    <>
      <button onClick={() => respond({ id: a.id, approved: true })}>Approve</button>
      <button onClick={() => respond({ id: a.id, approved: false })}>Reject</button>
    </>
  );
}
// <Approval part={part} respond={addToolApprovalResponse} />
```

### Extra data per message

```ts
// client
useAgentChat({ agent, body: () => ({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });

// server, inside onChatMessage(_onFinish, options)
const { timezone } = options?.body ?? {};
```

### One-off HTTP call

```ts
import { agentFetch } from "agents/client";

const res = await agentFetch(
  { agent: "ReportAgent", name: "daily", host: "my-worker.example.workers.dev" },
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run: true }) },
);
```

## Next

- Cloudflare: [Client SDK](https://developers.cloudflare.com/agents/communication-channels/chat/client-sdk/), [Chat agents](https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/), [Human-in-the-loop](https://developers.cloudflare.com/agents/concepts/agentic-patterns/human-in-the-loop/).
- The same guide on implemented.stream: [implemented.stream/guide/chat-client-sdk](https://implemented.stream/guide/chat-client-sdk/).
- How DevStack Chat uses this page: the notes in `src/lib/chat/knowledge/agents-chat-sdk.json` are matched by keyword (`src/lib/chat/knowledge/retrieve.ts`) and added to the system prompt only for questions about this SDK.

Source: Cloudflare Agents documentation (developers.cloudflare.com), summarized in our own words by devstack.bid. Last checked 2026-10-17.
