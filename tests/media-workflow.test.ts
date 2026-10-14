import { describe, expect, it } from "vitest";
import { lifecycleMail } from "@/lib/workflows/email-copy";
import { followUpDuration, objectKey, parseJob, PermanentWorkflowError, senderAddress, workflowInstanceId, type UploadJob } from "@/lib/workflows/jobs";
import { runMediaLifecycle, vectorsFromModel, type MediaEnv, type StepLike, type VectorRow } from "@/lib/workflows/run";
import { d1MediaStore, type MediaStore } from "@/lib/workflows/store";
import type { D1Like } from "@/lib/chat/store";
import { chunkText, extractUploadText } from "@/lib/workflows/text";
import { startMediaWorkflow, type TriggerEnv } from "@/lib/workflows/trigger";
import { NonRetryableError } from "cloudflare:workers";
import { MediaLifecycleWorkflow } from "@/workflows/media-lifecycle";

const USER = "018f6b2c-7a31-7000-8000-0123456789ab";
const FILE = "018f6b2c-7a31-7000-8000-0123456789ac";

function upload(over: Partial<UploadJob> = {}): UploadJob {
  return {
    kind: "upload",
    userId: USER,
    attachmentId: FILE,
    key: objectKey(USER, FILE),
    mime: "text/plain",
    size: 18,
    ...over,
  };
}

function vec(seed = 0.1): number[] {
  return Array.from({ length: 1024 }, (_, i) => seed + i / 10000);
}

function fakeStep() {
  const names: string[] = [];
  const sleeps: string[] = [];
  const step: StepLike = {
    async do(name, a, b) {
      names.push(name);
      const fn = typeof a === "function" ? a : b;
      if (!fn) throw new Error("missing step body");
      return fn();
    },
    async sleep(name, duration) {
      names.push(name);
      sleeps.push(duration);
    },
  };
  return { step, names, sleeps };
}

function memory(opts?: { email?: string | null; active?: boolean }) {
  const mail = new Map<string, "pending" | "sent">();
  const uploads = new Map<string, { status: string; chunks: number; error: string | null }>();
  const store: MediaStore = {
    async recordUpload(row) {
      uploads.set(row.id, { status: "stored", chunks: 0, error: null });
    },
    async markUpload(id, status, chunkCount, error) {
      uploads.set(id, { status, chunks: chunkCount, error });
    },
    async userEmail() {
      return opts?.email ?? null;
    },
    async claimMail(userId, event) {
      const key = `${userId}:${event}`;
      if (mail.get(key) === "sent") return "sent";
      mail.set(key, "pending");
      return "pending";
    },
    async markMailSent(userId, event) {
      mail.set(`${userId}:${event}`, "sent");
    },
    async activeSince() {
      return opts?.active ?? false;
    },
  };
  return { store, uploads, mail };
}

function runtime(text: string, store: MediaStore, mime = "text/plain") {
  const embedded: string[][] = [];
  const upserts: VectorRow[][] = [];
  const sent: { subject: string; to: string; from: string }[] = [];
  const env: MediaEnv = {
    store,
    LIFECYCLE_FOLLOWUP: "7 days",
    EMAIL_FROM: "DevStack <noreply@devstack.bid>",
    ASSETS_BUCKET: {
      async get(key) {
        if (!key.endsWith(FILE)) return null;
        return { async arrayBuffer() { return new TextEncoder().encode(text).buffer; } };
      },
    },
    AI: {
      async run(_model, input) {
        embedded.push(input.text);
        return { data: input.text.map((_, i) => vec(i + 1)) };
      },
    },
    VECTORIZE: {
      async upsert(rows) {
        upserts.push(rows);
        return { count: rows.length };
      },
    },
    EMAIL: {
      async send(message) {
        sent.push({ subject: message.subject, to: message.to, from: message.from.email });
        return { messageId: `msg-${sent.length}` };
      },
    },
  };
  env.ASSETS_BUCKET = {
    async get(key) {
      if (mime.startsWith("image/") && !key) return null;
      if (!key.includes(`/pending/${FILE}`)) return null;
      return { async arrayBuffer() { return new TextEncoder().encode(text).buffer; } };
    },
  };
  return { env, embedded, upserts, sent };
}

describe("media workflow jobs", () => {
  it("rejects a key that does not belong to the user", () => {
    expect(() => parseJob(upload({ key: `u/other/pending/${FILE}` }))).toThrow(PermanentWorkflowError);
    expect(() => parseJob({ kind: "lifecycle", userId: USER, event: "inactive" })).toThrow(/not supported/);
  });

  it("keeps the sender on devstack.bid and the follow-up duration bounded", () => {
    expect(senderAddress("Evil <a@evil.com>").email).toBe("noreply@devstack.bid");
    expect(senderAddress("notes@devstack.bid").email).toBe("notes@devstack.bid");
    expect(followUpDuration("21 days")).toBe("21 days");
    expect(followUpDuration("0 days")).toBe("7 days");
    expect(workflowInstanceId(upload())).toBe(`upload_${FILE}`);
    expect(workflowInstanceId({ kind: "lifecycle", userId: USER, event: "welcome" })).toBe(`life_${USER}_welcome`);
  });
});

describe("upload text", () => {
  it("chunks text and skips images", () => {
    const chunks = chunkText("a".repeat(2500));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBe(1200);
    expect(extractUploadText("image/png", new Uint8Array([1, 2, 3]))).toEqual({ skip: "image" });
  });

  it("reads literal strings from a simple PDF", () => {
    const bytes = new TextEncoder().encode("(Hello from the stack builder) Tj");
    const text = extractUploadText("application/pdf", bytes);
    expect(text).toEqual({ text: "Hello from the stack builder" });
  });
});

describe("runMediaLifecycle", () => {
  it("embeds an uploaded text object into Vectorize", async () => {
    const mem = memory();
    const { step, names } = fakeStep();
    const { env, upserts, embedded } = runtime("hello cloud stack", mem.store);
    const result = await runMediaLifecycle(step, env, upload({ size: 17 }));
    expect(result).toMatchObject({ kind: "upload", status: "indexed", chunks: 1 });
    expect(embedded[0]).toEqual(["hello cloud stack"]);
    expect(upserts[0][0]).toMatchObject({ id: `${FILE}:0`, metadata: { userId: USER, attachmentId: FILE, chunk: 0 } });
    expect(upserts[0][0].values).toHaveLength(1024);
    expect(mem.uploads.get(FILE)).toMatchObject({ status: "indexed", chunks: 1 });
    expect(names).toContain("embed-upsert");
  });

  it("stores an image without calling the embedding model", async () => {
    const mem = memory();
    const { step } = fakeStep();
    const { env, embedded } = runtime("not-text", mem.store);
    const result = await runMediaLifecycle(step, env, upload({ mime: "image/png", size: 8 }));
    expect(result).toEqual({ kind: "upload", status: "skipped", reason: "image" });
    expect(embedded).toEqual([]);
    expect(mem.uploads.get(FILE)?.status).toBe("skipped");
  });

  it("sends a welcome and, after the quiet period, an inactivity note", async () => {
    const mem = memory({ email: "dev@example.com", active: false });
    const { step, sleeps } = fakeStep();
    const { env, sent } = runtime("", mem.store);
    const result = await runMediaLifecycle(step, env, { kind: "lifecycle", userId: USER, event: "welcome" });
    expect(result).toMatchObject({ kind: "lifecycle", status: "sent", welcome: "msg-1", inactive: "msg-2" });
    expect(sleeps).toEqual(["7 days"]);
    expect(sent.map((m) => m.subject)).toEqual([
      "DevStack account is ready / บัญชี DevStack พร้อมแล้ว",
      "Your DevStack workspace is still here / เวิร์กสเปซ DevStack ยังอยู่",
    ]);
    expect(sent.every((m) => m.to === "dev@example.com" && m.from === "noreply@devstack.bid")).toBe(true);
    expect(mem.mail.get(`${USER}:inactive`)).toBe("sent");
  });

  it("skips the inactivity note when the user came back", async () => {
    const mem = memory({ email: "dev@example.com", active: true });
    const { env, sent } = runtime("", mem.store);
    const result = await runMediaLifecycle(fakeStep().step, env, { kind: "lifecycle", userId: USER, event: "welcome" });
    expect(result).toMatchObject({ status: "sent", reason: "active" });
    expect(sent).toHaveLength(1);
  });

  it("does not mail a user who has no address on the account", async () => {
    const mem = memory({ email: null });
    const { env, sent } = runtime("", mem.store);
    const result = await runMediaLifecycle(fakeStep().step, env, { kind: "lifecycle", userId: USER, event: "welcome" });
    expect(result).toEqual({ kind: "lifecycle", status: "skipped", reason: "no_email" });
    expect(sent).toEqual([]);
  });

  it("turns a permanent failure into a non-retryable workflow error", async () => {
    const wf = new MediaLifecycleWorkflow();
    (wf as unknown as { env: MediaEnv }).env = {};
    const { step } = fakeStep();
    await expect(wf.run({ payload: { kind: "nope" }, instanceId: "bad", timestamp: new Date() }, step as never)).rejects.toBeInstanceOf(NonRetryableError);
  });
});

describe("startMediaWorkflow", () => {
  it("does nothing until the bindings exist", async () => {
    const env: TriggerEnv = {};
    await expect(startMediaWorkflow(env, upload())).resolves.toEqual({ started: false, reason: "workflow_unbound" });
    const created: string[] = [];
    const partial: TriggerEnv = {
      MEDIA_WORKFLOW: { async create(opts) { created.push(opts.id); return { id: opts.id }; } },
      DB: {},
    };
    await expect(startMediaWorkflow(partial, upload())).resolves.toEqual({ started: false, reason: "index_unbound" });
    await expect(startMediaWorkflow(partial, { kind: "lifecycle", userId: USER, event: "welcome" })).resolves.toEqual({ started: false, reason: "email_unbound" });
    expect(created).toEqual([]);
  });

  it("uses a stable instance id and treats a duplicate as already started", async () => {
    const env: TriggerEnv = {
      MEDIA_WORKFLOW: {
        async create() {
          throw new Error("instance already exists");
        },
      },
      ASSETS_BUCKET: {},
      VECTORIZE: {},
      AI: {},
      DB: {},
      EMAIL: {},
    };
    await expect(startMediaWorkflow(env, upload())).resolves.toEqual({ started: false, id: `upload_${FILE}`, reason: "duplicate" });
  });
});

describe("d1MediaStore", () => {
  it("claims a mail row once, then reads it back", async () => {
    const sql: string[] = [];
    const statuses = ["pending", "sent"];
    const db = {
      prepare(statement: string) {
        sql.push(statement);
        const stmt = {
          bind() {
            return stmt;
          },
          async first() {
            return { status: statuses.shift(), email: "dev@example.com", hit: 1 };
          },
          async all() {
            return { results: [] };
          },
          async run() {
            return { meta: { changes: 1 } };
          },
        };
        return stmt;
      },
      async batch() {
        return [];
      },
    };
    const store = d1MediaStore(db as unknown as D1Like);
    await expect(store.claimMail(USER, "welcome")).resolves.toBe("pending");
    await expect(store.claimMail(USER, "welcome")).resolves.toBe("sent");
    expect(sql.some((q) => q.includes("INSERT INTO lifecycle_mail"))).toBe(true);
    expect(sql.some((q) => q.includes("SELECT status FROM lifecycle_mail"))).toBe(true);
  });
});

describe("embedding shape", () => {
  it("accepts a matrix or a flat buffer of the index width", () => {
    expect(vectorsFromModel({ data: [vec()] }, 1024)).toHaveLength(1);
    expect(vectorsFromModel({ data: vec().concat(vec(2)) }, 1024)).toHaveLength(2);
    expect(() => vectorsFromModel({ data: [1, 2, 3] }, 1024)).toThrow(/width/);
  });

  it("builds a bilingual text and html body", () => {
    const mail = lifecycleMail("welcome", "dev@example.com", { email: "noreply@devstack.bid", name: "DevStack" });
    expect(mail.text).toContain("บัญชี DevStack");
    expect(mail.html).toContain("devstack.bid");
    expect(mail.html).not.toContain("dev@example.com");
  });
});
