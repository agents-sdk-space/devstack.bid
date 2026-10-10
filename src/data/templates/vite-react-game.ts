import type { StackTemplate } from "@/lib/types";
import { cdProject, createViteApp, pmInstall } from "../common-steps";

// ⟨...⟩ marks TypeScript-only syntax; it is removed for JavaScript projects.
const app = `import { useEffect, useRef, useState } from "react";

const W = 640;
const H = 400;

export default function App() {
  const canvasRef = useRef⟨<HTMLCanvasElement>⟩(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;
    const ctx⟨: CanvasRenderingContext2D⟩ = context;
    const keys⟨: Record<string, boolean>⟩ = {};
    const player = { x: W / 2, y: H / 2, r: 14, speed: 4 };
    const coin = { x: 120, y: 120, r: 8 };
    let points = 0;
    let raf = 0;

    const down = (e⟨: KeyboardEvent⟩) => { keys[e.key] = true; };
    const up = (e⟨: KeyboardEvent⟩) => { keys[e.key] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    const loop = () => {
      if (keys.ArrowLeft || keys.a) player.x -= player.speed;
      if (keys.ArrowRight || keys.d) player.x += player.speed;
      if (keys.ArrowUp || keys.w) player.y -= player.speed;
      if (keys.ArrowDown || keys.s) player.y += player.speed;
      player.x = Math.max(player.r, Math.min(W - player.r, player.x));
      player.y = Math.max(player.r, Math.min(H - player.r, player.y));

      if (Math.hypot(player.x - coin.x, player.y - coin.y) < player.r + coin.r) {
        points += 1;
        setScore(points);
        coin.x = 20 + Math.random() * (W - 40);
        coin.y = 20 + Math.random() * (H - 40);
      }

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return (
    <main className="game">
      <h1>{{name}}</h1>
      <p aria-live="polite">Score: {score}</p>
      <canvas ref={canvasRef} width={W} height={H} aria-label="Game canvas: move with arrow keys or WASD" />
      <p>Move with arrow keys or WASD. Collect the coins!</p>
    </main>
  );
}
`;

const css = `:root { color-scheme: dark; font-family: system-ui, sans-serif; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #020617; color: #e2e8f0; }
.game { text-align: center; }
canvas { border: 2px solid #334155; border-radius: 12px; max-width: 100%; }
`;

const template: StackTemplate = {
  id: "vite-react-game",
  name: { en: "Vite + React Canvas Game", th: "เกม Canvas ด้วย Vite + React" },
  summary: {
    en: "A tiny 2D coin-collector game on <canvas> with a requestAnimationFrame loop and keyboard input.",
    th: "เกม 2D เก็บเหรียญบน <canvas> ใช้ requestAnimationFrame และรับปุ่มคีย์บอร์ด",
  },
  category: "game",
  runtimes: ["node"],
  tags: ["Vite", "React", "Canvas", "Game"],
  supportedAddons: ["typescript", "tailwind", "eslint", "testing", "docker", "ci"],
  defaultAddons: ["typescript"],
  defaultName: "nvx-game",
  keywords: ["game", "canvas", "arcade", "play", "phaser", "2d", "เกม", "เล่น", "แคนวาส"],
  fileTree: ["{{name}}/", "  index.html", "  src/App.{{jsx}}", "  src/index.css", "  src/main.{{jsx}}", "  vite.config.{{ext}}", "  package.json"],
  steps: [
    createViteApp,
    cdProject,
    pmInstall,
    {
      id: "game-code",
      title: { en: "Write the game loop", th: "เขียน game loop" },
      explanation: {
        en: "Replace App with a canvas game: keyboard input, collision detection and a score counter.",
        th: "แทนที่ App ด้วยเกมบน canvas: รับปุ่มกด ตรวจการชน และนับคะแนน",
      },
      commands: [],
      files: [
        { path: "src/App.{{jsx}}", content: app },
        { path: "src/index.css", content: css },
      ],
      expected: { en: "src/App contains the game.", th: "ไฟล์ src/App มีโค้ดเกม" },
    },
    {
      id: "dev-server",
      title: { en: "Play it in the dev server", th: "เปิด dev server แล้วลองเล่น" },
      explanation: { en: "Vite serves the game with instant hot module reload.", th: "Vite เสิร์ฟเกมพร้อม hot reload ทันที" },
      commands: ["{{run}} dev"],
      kind: "longRunning",
      expected: { en: "http://localhost:5173 shows the canvas; arrow keys move the ball.", th: "http://localhost:5173 แสดง canvas และปุ่มลูกศรขยับลูกบอลได้" },
      verify: "curl -I http://localhost:5173",
    },
    {
      id: "prod-build",
      title: { en: "Build static files", th: "build เป็นไฟล์ static" },
      explanation: { en: "Outputs an optimized static site in dist/ that any static host can serve.", th: "ได้เว็บ static ที่ปรับแต่งแล้วในโฟลเดอร์ dist/ นำไปวางบน static host ใดก็ได้" },
      commands: ["{{run}} build"],
      expected: { en: "dist/index.html and hashed assets.", th: "ได้ dist/index.html และไฟล์ assets" },
      verify: "ls dist",
      verifyWindows: "Get-ChildItem dist",
    },
  ],
  nextSteps: [
    { en: "Add levels, enemies and sound with the Web Audio API.", th: "เพิ่มด่าน ศัตรู และเสียงด้วย Web Audio API" },
    { en: "For bigger games consider Phaser or PixiJS.", th: "ถ้าเกมใหญ่ขึ้น ลองใช้ Phaser หรือ PixiJS" },
    { en: "Deploy dist/ to Cloudflare Pages, Vercel or GitHub Pages.", th: "Deploy โฟลเดอร์ dist/ ไปที่ Cloudflare Pages, Vercel หรือ GitHub Pages" },
  ],
  docs: [
    { label: "Vite guide", url: "https://vite.dev/guide/" },
    { label: "Canvas API (MDN)", url: "https://developer.mozilla.org/docs/Web/API/Canvas_API" },
  ],
  docker: { kind: "static", port: 80, cmd: [] },
  ci: ["{{run}} build"],
};

export default template;
