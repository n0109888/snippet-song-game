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

const CONFETTI_COLORS = ["#e9a13b", "#6fbf73", "#4f9d6b", "#d9822b", "#c8d4dc", "#e2686f"];

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
    // Measure from the element, so the burst is centred on what is on screen.
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles: Particle[] = [];

    // Two angled fountains from the lower corners, the shape party cannons make.
    // A single centre explosion reads as a scatter rather than a celebration.
    const cannons = [
      { x: width * 0.16, y: height * 0.98, angle: -Math.PI / 2.55 },
      { x: width * 0.84, y: height * 0.98, angle: -Math.PI / 1.72 },
    ];

    for (const cannon of cannons) {
      for (let i = 0; i < 90; i += 1) {
        const spread = (Math.random() - 0.5) * 0.5;
        const angle = cannon.angle + spread;
        const speed = 15 + Math.random() * 13;
        particles.push({
          x: cannon.x + (Math.random() - 0.5) * 14,
          y: cannon.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 0.3,
          w: 6 + Math.random() * 5,
          h: 9 + Math.random() * 7,
          color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0] ?? "#e9a13b",
          life: 1,
        });
      }
    }

    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, width, height);

      let alive = 0;
      for (const p of particles) {
        p.vy += 0.42 * dt;
        p.vx *= 0.985;
        p.vy *= 0.992;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        // Hold full colour while it flies, fade only near the end.
        if (p.y > height * 0.55) p.life -= 0.012 * dt;

        if (p.life <= 0 || p.y > height + 60) continue;
        alive += 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;
        // Scale across the short axis so each piece tumbles like real paper.
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
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
