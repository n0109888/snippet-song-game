"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  w: number;
  h: number;
  color: string;
  life: number;
}

const CONFETTI_COLORS = ["#e9a13b", "#6fbf73", "#ededed", "#d9822b", "#4f9d6b"];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Confetti burst on a correct guess. Canvas rather than DOM nodes so a couple
 * of hundred pieces stay cheap, and the loop stops itself once they are gone.
 */
export function Confetti({ fireKey }: { fireKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || fireKey === 0) return;
    if (prefersReducedMotion()) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const originX = width / 2;
    const originY = height * 0.42;
    const particles: Particle[] = [];

    for (let i = 0; i < 160; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 9;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.35,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? "#e9a13b",
        life: 1,
      });
    }

    let last = performance.now();

    const tick = (now: number) => {
      // Normalised to 60fps so the burst looks the same on any refresh rate.
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, width, height);

      let alive = 0;
      for (const p of particles) {
        p.vy += 0.32 * dt;
        p.vx *= 0.99;
        p.vy *= 0.995;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        p.life -= 0.007 * dt;

        if (p.life <= 0 || p.y > height + 40) continue;
        alive += 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;
        // Flip the width on rotation so the piece reads as a tumbling ribbon.
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.rot)), p.h);
        ctx.restore();
      }

      if (alive > 0) {
        frame.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
        frame.current = null;
      }
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      ctx.clearRect(0, 0, width, height);
    };
  }, [fireKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}

/** Wrong answer: one red wash from the edges that fades out. */
export function MissFlash({ fireKey }: { fireKey: number }) {
  if (fireKey === 0) return null;
  return (
    <div
      key={fireKey}
      aria-hidden
      className="flash-out pointer-events-none fixed inset-0 z-40"
      style={{
        background:
          "radial-gradient(circle at 50% 45%, transparent 38%, color-mix(in srgb, var(--color-bad) 55%, transparent) 100%)",
      }}
    />
  );
}
