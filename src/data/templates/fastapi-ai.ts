import type { StackTemplate } from "@/lib/types";
import { mkdirAndCd, pyFreeze, pyVenv } from "../common-steps";

const main = `import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from openai import APIError, OpenAI
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="{{name}}")


class Ask(BaseModel):
    prompt: str


@app.get("/health")
def health():
    return {"ok": True, "service": "{{name}}"}


@app.post("/ask")
def ask(body: Ask):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="Set OPENAI_API_KEY in .env")
    client = OpenAI()
    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-6.1-sol"),
            input=body.prompt,
        )
    except APIError as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI error: {exc.__class__.__name__}") from exc
    return {"answer": response.output_text}
`;

const template: StackTemplate = {
  id: "fastapi-ai",
  name: { en: "FastAPI + Python AI App", th: "แอป AI ด้วย FastAPI + Python" },
  summary: {
    en: "FastAPI service with a /ask endpoint that calls the OpenAI Responses API; secrets loaded from .env.",
    th: "บริการ FastAPI ที่มี endpoint /ask เรียก OpenAI Responses API โดยโหลด secret จากไฟล์ .env",
  },
  category: "ai",
  runtimes: ["python"],
  tags: ["Python", "FastAPI", "OpenAI", "AI", "uvicorn"],
  supportedAddons: ["eslint", "testing", "docker", "ci"],
  defaultAddons: [],
  defaultName: "nvx-ai-api",
  keywords: ["ai", "llm", "gpt", "openai", "chatbot", "fastapi", "python api", "machine learning", "ปัญญาประดิษฐ์", "เอไอ", "แชทบอท", "บอท"],
  fileTree: ["{{name}}/", "  .venv/", "  main.py", "  .env.example", "  .env", "  requirements.txt"],
  steps: [
    mkdirAndCd,
    pyVenv,
    {
      id: "fastapi-deps",
      title: { en: "Install FastAPI, OpenAI SDK and dotenv", th: "ติดตั้ง FastAPI, OpenAI SDK และ dotenv" },
      explanation: {
        en: "fastapi[standard] includes uvicorn and the `fastapi` CLI. Quotes stop the shell from expanding the brackets.",
        th: "fastapi[standard] มาพร้อม uvicorn และคำสั่ง `fastapi` ต้องใส่เครื่องหมายคำพูดเพื่อไม่ให้ shell ตีความวงเล็บ",
      },
      commands: ["{{pip}} \"fastapi[standard]\" openai python-dotenv"],
      expected: { en: "Packages installed into .venv.", th: "ติดตั้งแพ็กเกจลงใน .venv แล้ว" },
      verify: "python -c \"import fastapi, openai; print(fastapi.__version__)\"",
    },
    pyFreeze,
    {
      id: "fastapi-code",
      title: { en: "Write the API and env template", th: "เขียน API และไฟล์ตัวอย่าง env" },
      explanation: {
        en: "main.py exposes /health and /ask. .env.example documents required variables — never commit the real .env.",
        th: "main.py มี /health และ /ask ส่วน .env.example บอกตัวแปรที่ต้องใช้ — ห้าม commit ไฟล์ .env จริง",
      },
      commands: ["cp .env.example .env"],
      windows: ["Copy-Item .env.example .env"],
      files: [
        { path: "main.py", content: main },
        { path: ".env.example", content: "OPENAI_API_KEY=\nOPENAI_MODEL=gpt-6.1-sol\n" },
        { path: ".gitignore", content: ".venv/\n__pycache__/\n.env\n" },
      ],
      expected: { en: "main.py and .env exist. Put your key in .env.", th: "มี main.py และ .env แล้ว ใส่ key ของคุณใน .env" },
      verify: "python -m py_compile main.py",
    },
    {
      id: "dev-server",
      title: { en: "Run the dev server", th: "รัน dev server" },
      explanation: { en: "`fastapi dev` runs uvicorn with auto-reload. Interactive docs live at /docs.", th: "`fastapi dev` รัน uvicorn แบบ auto-reload และมีเอกสารแบบโต้ตอบที่ /docs" },
      commands: ["fastapi dev main.py"],
      kind: "longRunning",
      expected: { en: "http://127.0.0.1:8000/docs shows Swagger UI.", th: "http://127.0.0.1:8000/docs แสดง Swagger UI" },
      verify: "curl http://127.0.0.1:8000/health",
    },
  ],
  nextSteps: [
    { en: "Stream responses with StreamingResponse for a chat UI.", th: "ส่งคำตอบแบบ stream ด้วย StreamingResponse สำหรับหน้าแชท" },
    { en: "Add a vector store / RAG for your own documents.", th: "เพิ่ม vector store / RAG เพื่อค้นหาเอกสารของคุณเอง" },
    { en: "Production: `fastapi run main.py` behind a reverse proxy.", th: "Production: ใช้ `fastapi run main.py` หลัง reverse proxy" },
  ],
  docs: [
    { label: "FastAPI", url: "https://fastapi.tiangolo.com" },
    { label: "OpenAI Responses API", url: "https://platform.openai.com/docs/api-reference/responses" },
  ],
  docker: { kind: "python", port: 8000, cmd: ["fastapi", "run", "main.py", "--port", "8000"] },
  ci: ["python -m py_compile main.py"],
};

export default template;
