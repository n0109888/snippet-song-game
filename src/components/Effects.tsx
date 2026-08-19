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
  /** Frames to wait before launching, so the burst streams instead of clumping. */
  delay: number;
  /** Sparkles are reserved for the gold burst, where the glint is the point. */
  star: boolean;
}

/** Correct means green, so the paper is green too, in a few shades for depth. */
const CONFETTI_COLORS = [
  "#3ddc6a",
  "#22c55e",
  "#16a34a",
  "#7cf5a5",
  "#b6ffcf",
  "#0e9f4a",
];

/** The best win in the game, so the paper is leaf, coin and highlight gold. */
const GOLD_COLORS = [
  "#ffd23f",
  "#ffb302",
  "#f6e27a",
  "#e8a317",
  "#fff3bf",
  "#c8860a",
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A four point sparkle, drawn around the origin so it can be rotated freely. */
function fillStar(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI / 4) * i;
    // Deep waists between the points, which is what makes it read as a glint
    // rather than an octagon.
    const r = i % 2 === 0 ? radius : radius * 0.3;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Confetti burst on a correct guess. Canvas rather than DOM nodes so a few
 * hundred pieces stay cheap, and the loop stops itself once they are gone.
 * Absolutely placed, so it fills whichever panel it is mounted in.
 *
 * `gold` turns it into the max win version: half again as much paper, in gold,
 * with sparkles mixed through it. Still one burst, because paper that keeps
 * arriving reads as weather rather than as a celebration.
 */
export function Confetti({ fireKey, gold = false }: { fireKey: number; gold?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef<number | null>(null);
  // Read at fire time only. As state it would restart the burst whenever the
  // reveal cleared, which is the one moment the paper should be left alone.
  const goldRef = useRef(gold);
  goldRef.current = gold;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || fireKey === 0) return;
    if (prefersReducedMotion()) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const max = goldRef.current;
    const palette = max ? GOLD_COLORS : CONFETTI_COLORS;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Measure from the element, so the burst is centred on what is on screen.
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles: Particle[] = [];

    // One explosion from the middle of the card, so the paper covers the art
    // and the player rather than climbing past them from the corners.
    const originX = width * 0.5;
    const originY = height * 0.42;

    const count = max ? 620 : 380;
    for (let i = 0; i < count; i += 1) {
      // A full circle, squashed upward: gravity brings the top half back down
      // through the middle, which is what fills the card.
      const angle = Math.random() * Math.PI * 2;
      const speed = 7 + Math.random() * (max ? 30 : 26);
      particles.push({
        x: originX + (Math.random() - 0.5) * 30,
        y: originY + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.9 - 6,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.34,
        w: 6 + Math.random() * 6,
        h: 9 + Math.random() * 8,
        color: palette[(Math.random() * palette.length) | 0] ?? palette[0] ?? "#3ddc6a",
        life: 1,
        delay: Math.random() * 5,
        star: max && Math.random() < 0.24,
      });
    }

    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      ctx.clearRect(0, 0, width, height);

      let alive = 0;
      for (const p of particles) {
        if (p.delay > 0) {
          p.delay -= dt;
          alive += 1;
          continue;
        }
        p.vy += 0.4 * dt;
        p.vx *= 0.982;
        p.vy *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        // Hold full colour while it flies, fade only near the end.
        if (p.y > height * 0.6) p.life -= 0.011 * dt;

        if (p.life <= 0 || p.y > height + 60) continue;
        alive += 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;
        if (p.star) {
          // Only the sparkles carry a glow; per piece shadows are the expensive
          // part of the frame and there are a fifth as many of these.
          ctx.shadowBlur = 12;
          ctx.shadowColor = p.color;
          fillStar(ctx, p.w * 0.8);
        } else {
          // Scale across the short axis so each piece tumbles like real paper.
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
        }
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
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    />
  );
}

/**
 * Wrong answer: the whole card fades to red and stays there for the reveal, so
 * the miss is the screen rather than a flicker over it.
 */
export function MissWash() {
  return (
    <div
      aria-hidden
      className="wash-in pointer-events-none absolute inset-0 z-0"
      style={{
        background:
          "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-bad) 8%, transparent) 0%, color-mix(in srgb, var(--color-bad) 20%, transparent) 45%, color-mix(in srgb, var(--color-bad) 46%, transparent) 100%)",
      }}
    />
  );
}

/**
 * The max win: the card takes a hit of gold light. A flash on the frame it
 * lands, a bloom that stays for the rest of the reveal, and two rings thrown
 * out from the middle. Each plays once, so nothing is left turning behind the
 * text.
 */
export function GoldWash() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className="wash-in absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-gold) 30%, transparent) 0%, color-mix(in srgb, var(--color-gold) 13%, transparent) 42%, transparent 76%)",
        }}
      />
      <div className="gold-flash absolute inset-0 bg-[var(--color-gold)]" />
      <div className="shock-ring absolute left-1/2 top-[42%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--color-gold)]" />
      <div className="shock-ring shock-ring-late absolute left-1/2 top-[42%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-gold)]" />
    </div>
  );
}
