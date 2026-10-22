import { useEffect, useRef, useState } from "react";

const W = 640;
const H = 400;

export default function App() {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const keys = {};
    const player = { x: W / 2, y: H / 2, r: 14, speed: 4 };
    const coin = { x: 120, y: 120, r: 8 };
    let points = 0;
    let raf = 0;
    const down = (e) => { keys[e.key] = true; };
    const up = (e) => { keys[e.key] = false; };
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
      ctx.beginPath(); ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2); ctx.fill();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  return (
    <main>
      <h1>__TITLE__</h1>
      <p>Arrow keys or WASD to collect coins. Score: {score}</p>
      <canvas ref={canvasRef} width={W} height={H} aria-label="Game area" />
    </main>
  );
}
