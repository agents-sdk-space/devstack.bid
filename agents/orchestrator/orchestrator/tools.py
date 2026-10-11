"""Server-side implementations of the agent's function tools.

- generate_ai_agents_website -> scripts/site-plan.ts (same code as the Worker; Stack Builder planner)
- get_agents_sdk_info        -> scripts/site-plan.ts --docs (local docs index), else devstack.bid/llms-full.txt
- generate_image             -> OpenAI Images API, saved under out/

Every handler returns a JSON-serialisable dict. Errors raise ToolError with a message the agent can use.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import shutil
import uuid

import httpx
from openai import AsyncOpenAI

from .config import OUT_DIR, REPO_ROOT, Settings


class ToolError(Exception):
    pass


async def _run_ts(args: list[str], payload: dict) -> dict:
    npx = shutil.which("npx")
    if not npx or not (REPO_ROOT / "scripts" / "site-plan.ts").exists():
        raise FileNotFoundError("npx or scripts/site-plan.ts not available")
    proc = await asyncio.create_subprocess_exec(
        npx, "tsx", "scripts/site-plan.ts", *args,
        cwd=REPO_ROOT, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, err = await asyncio.wait_for(proc.communicate(json.dumps(payload).encode()), timeout=60)
    if proc.returncode != 0:
        raise ToolError(err.decode(errors="ignore")[:300] or "site-plan failed")
    return json.loads(out)


async def generate_ai_agents_website(args: dict, s: Settings) -> dict:
    return await _run_ts([], args)


_llms_cache: dict[str, str] = {}


async def _docs_from_web(query: str, s: Settings) -> dict:
    url = f"{s.site}/llms-full.txt"
    if url not in _llms_cache:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as http:
            r = await http.get(url)
            r.raise_for_status()
            _llms_cache[url] = r.text
    text = _llms_cache[url]
    terms = [t for t in re.split(r"\s+", query.lower()) if len(t) > 1]
    chunks = re.split(r"\n(?=# )", text)
    scored = sorted(((sum(c.lower().count(t) for t in terms), c) for c in chunks), key=lambda x: -x[0])
    return {
        "query": query,
        "source": url,
        "results": [{"excerpt": c[:1200]} for score, c in scored[:4] if score > 0],
        "index": f"{s.site}/llms.txt",
    }


async def get_agents_sdk_info(args: dict, s: Settings) -> dict:
    query = str(args.get("query", ""))[:300]
    if not query.strip():
        raise ToolError("query must not be empty")
    try:
        return await _run_ts(["--docs"], {"query": query})
    except FileNotFoundError:
        return await _docs_from_web(query, s)


class ImageTool:
    def __init__(self, client: AsyncOpenAI, s: Settings):
        self.client, self.s, self.count = client, s, 0

    async def __call__(self, args: dict, s: Settings) -> dict:
        if self.count >= self.s.max_images:
            raise ToolError(f"Image limit reached ({self.s.max_images} per run). Tell the user and continue without more images.")
        self.count += 1
        size = args.get("size") if args.get("size") in ("1024x1024", "1536x1024", "1024x1536") else "1024x1024"
        result = await self.client.images.generate(
            model=self.s.image_model,
            prompt=str(args.get("prompt", ""))[:4000],
            size=size,
            quality=self.s.image_quality,
            output_format="webp",
            output_compression=80,
            n=1,
        )
        data = base64.b64decode(result.data[0].b64_json)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        path = OUT_DIR / f"img_{uuid.uuid4().hex[:12]}.webp"
        path.write_bytes(data)
        usage = getattr(result, "usage", None)
        return {
            "image_url": path.resolve().as_uri(),
            "caption": str(args.get("caption", ""))[:200],
            "size": size,
            "bytes": len(data),
            "model": self.s.image_model,
            "usage": usage.model_dump() if usage else None,
        }
