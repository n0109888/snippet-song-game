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
 * `gold` turns it into the max win version: more paper, sparkles mixed in, and
 * a second wave so the card keeps raining for the length of the reveal.
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

    const count = max ? 560 : 380;
    for (let i = 0; i < count; i += 1) {
      // A full circle, squashed upward: gravity brings the top half back down
      // through the middle, which is what fills the card.
      const angle = Math.random() * Math.PI * 2;
      const speed = 7 + Math.random() * (max ? 32 : 26);
      // Half of the gold pieces are held back, so the fall lasts as long as the
      // banner it is celebrating.
      const wave = max && i > count * 0.5 ? 18 + Math.random() * 46 : 0;
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
        delay: Math.random() * 5 + wave,
        star: max && Math.random() < 0.22,
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
 * The max win backdrop: a gold wash with a wheel of light turning slowly behind
 * the reveal. The rays are masked to a disc so they fade out well before the
 * edges of the card and never fight the text on top of them.
 */
export function GoldWash() {
  const fade = "radial-gradient(circle, #000 0%, #000 32%, transparent 68%)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className="wash-in absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-gold) 26%, transparent) 0%, color-mix(in srgb, var(--color-gold) 12%, transparent) 40%, transparent 78%)",
        }}
      />
      <div
        className="gold-rays absolute left-1/2 top-[42%] aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--color-gold) 22%, transparent) 0deg 6deg, transparent 6deg 18deg)",
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
      />
    </div>
  );
}

/**
 * A hyped face for the max win, drawn here rather than pulled in as an image so
 * it inherits the gold tokens and stays sharp at any size. Star eyes and a wide
 * open mouth, the shape every celebration emote settles on.
 */
export function HypeEmote({ className = "" }: { className?: string }) {
  return (
    <span className={`emote-pop relative grid place-items-center ${className}`}>
      {/* A ring of light thrown off as it lands. */}
      <span className="shock-ring absolute inset-0 rounded-full border-2 border-[var(--color-gold)]" />
      <svg viewBox="0 0 100 100" className="emote-wiggle relative h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="hype-face" cx="38%" cy="30%" r="78%">
            <stop offset="0%" stopColor="#fff3bf" />
            <stop offset="55%" stopColor="#ffd23f" />
            <stop offset="100%" stopColor="#e08c1f" />
          </radialGradient>
        </defs>

        {/* Energy thrown off the head, longer at the top corners. */}
        <g
          stroke="var(--color-gold)"
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.9}
        >
          <path d="M50 4v9" />
          <path d="M18 14l6 7" />
          <path d="M82 14l-6 7" />
          <path d="M4 46h8" />
          <path d="M96 46h-8" />
        </g>

        <circle cx="50" cy="52" r="38" fill="url(#hype-face)" />
        <circle
          cx="50"
          cy="52"
          r="38"
          fill="none"
          stroke="#8a5a00"
          strokeWidth={3}
          opacity={0.55}
        />

        {/* Star eyes: the same sparkle the confetti drops. */}
        <g fill="#5a3600">
          <path d="M36 44l3.6 7.4L47 55l-7.4 3.6L36 66l-3.6-7.4L25 55l7.4-3.6z" />
          <path d="M64 44l3.6 7.4L75 55l-7.4 3.6L64 66l-3.6-7.4L53 55l7.4-3.6z" />
        </g>

        {/* Mouth wide open, with a tongue so it reads at emote size. */}
        <path
          d="M33 68c5.5 12 27.5 12 34 0z"
          fill="#5a3600"
          stroke="#5a3600"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <path d="M44 76c2.5 5 9.5 5 12 0z" fill="#e0576b" />
      </svg>
    </span>
  );
}
