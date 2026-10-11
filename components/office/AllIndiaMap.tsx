"use client";
import { useEffect, useRef } from "react";
import type { AgencyState } from "@/lib/client/state";

const INDIA_BOUNDS = { west: 68, east: 97, north: 37, south: 6.5 };

function project(lat: number, lng: number, w: number, h: number): [number, number] {
  const x = ((lng - INDIA_BOUNDS.west) / (INDIA_BOUNDS.east - INDIA_BOUNDS.west)) * w;
  const y = ((INDIA_BOUNDS.north - lat) / (INDIA_BOUNDS.north - INDIA_BOUNDS.south)) * h;
  return [x, y];
}

export default function AllIndiaMap({ state }: { state: AgencyState | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const institutions = state?.institutions ?? [];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const grid = "rgba(148,163,184,0.07)";
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let lng = 70; lng <= 95; lng += 5) {
      const [x] = project(20, lng, w, h);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let lat = 10; lat <= 35; lat += 5) {
      const [, y] = project(lat, 80, w, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    for (const inc of institutions) {
      const lat = Number(inc.latitude);
      const lng = Number(inc.longitude);
      if (!lat || !lng) continue;
      const [x, y] = project(lat, lng, w, h);
      const r = inc.latest_demo_at ? 5 : inc.latest_sent_at ? 4 : 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = inc.latest_demo_at ? "#22c55e" : inc.latest_sent_at ? "#38bdf8" : "#64748b";
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const count = institutions.filter((i) => i.latitude && i.longitude).length;
    ctx.font = "10px Fira Code, monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`● ${count} schools mapped`, 10, h - 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, institutions.length]);

  return (
    <canvas
      ref={ref}
      className="h-64 w-full rounded-xl border border-edge bg-panel lg:h-80"
      aria-label="Live map of discovered schools across India"
    />
  );
}