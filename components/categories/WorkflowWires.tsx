import { useState } from "react";

interface WiredNode {
  key: string;
  label: string;
  x: number;
  y: number;
  count: number;
}

const STAGES: { key: string; label: string }[] = [
  { key: "discovery", label: "Discovered" },
  { key: "organizer", label: "Contacts" },
  { key: "research", label: "Research" },
  { key: "opportunity", label: "Opportunity" },
  { key: "demo", label: "Demo" },
  { key: "message", label: "Message" },
  { key: "sent", label: "Sent" },
  { key: "done", label: "Done" },
];

/** Serpentine 2x4 grid positions. */
const POS: { x: number; y: number }[] = [
  { x: 120, y: 70 },
  { x: 340, y: 70 },
  { x: 560, y: 70 },
  { x: 780, y: 70 },
  { x: 780, y: 210 },
  { x: 560, y: 210 },
  { x: 340, y: 210 },
  { x: 120, y: 210 },
];

export default function WorkflowWires({ counts }: { counts: Record<string, number> }) {
  const [hover, setHover] = useState<string | null>(null);

  const nodes: WiredNode[] = STAGES.map((s, i) => ({
    ...s,
    ...POS[i],
    count: counts[s.key] ?? 0,
  }));

  // Wires between consecutive nodes (serpentine).
  const wires = nodes.slice(0, -1).map((a, i) => {
    const b = nodes[i + 1];
    const mx = (a.x + b.x) / 2;
    const d = `M ${a.x} ${a.y} L ${mx} ${a.y} Q ${mx} ${(a.y + b.y) / 2} ${b.x} ${(a.y + b.y) / 2} L ${b.x} ${b.y}`;
    return { d, key: `${a.key}->${b.key}`, from: a.key, to: b.key };
  });

  const maxCount = Math.max(1, ...nodes.map((n) => n.count));
  const lastActive = [...nodes].reverse().find((n) => n.count > 0)?.key ?? null;

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-edge bg-panel p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 pb-4">
        <div>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">Wired workflow</h3>
          <p className="mt-0.5 text-[11px] text-faint">Every lead moves along the wires between agents. Hover a stage for its count.</p>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-faint">
          <span className="flow-dash inline-block h-px w-8 bg-white/60" />
          live flow
        </div>
      </div>

      <svg viewBox="0 0 900 270" className="min-w-[840px]" role="img" aria-label="Lead workflow wires">
        <defs>
          <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* wires */}
        {wires.map((w) => {
          const lit = (counts[w.from] ?? 0) > 0;
          return (
            <path
              key={w.key}
              d={w.d}
              fill="none"
              stroke={lit ? "#ffffff" : "#333333"}
              strokeOpacity={lit ? (hover === w.from || hover === w.to ? 1 : 0.55) : 0.4}
              strokeWidth={lit ? 2 : 1}
              className={lit ? "flow-dash" : undefined}
              strokeDasharray="7 7"
            />
          );
        })}

        {/* nodes */}
        {nodes.map((n) => {
          const active = n.count > 0;
          const isLast = n.key === lastActive;
          const isHover = hover === n.key;
          return (
            <g key={n.key} className="cursor-default" onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(null)}>
              <line x1={n.x} y1={n.y - 34} x2={n.x} y2={n.y - 44} stroke={active ? "#fff" : "#2b2b2b"} strokeWidth="1.5" />
              <text x={n.x} y={n.y - 50} textAnchor="middle" className="font-mono" fontSize="12" fill={active ? "#fff" : "#4a4a4a"}>
                {n.count.toLocaleString("en-IN")}
              </text>
              <circle cx={n.x} cy={n.y} r={isHover ? 30 : 26} fill={active ? "#ffffff" : "#000000"} stroke={active ? "#ffffff" : "#333333"} strokeWidth="1.5" />
              {isLast && (
                <circle cx={n.x} cy={n.y} r={30} fill="none" stroke="#ffffff" strokeWidth="1" className="anim-pulse" style={{ opacity: 0.6 }} />
              )}
              <text x={n.x} y={n.y + 5} textAnchor="middle" className="font-mono" fontSize="14" fontWeight="700" fill={active ? "#000000" : "#4a4a4a"}>
                {n.label[0]}
              </text>
              <text x={n.x} y={n.y + 48} textAnchor="middle" className="font-mono" fontSize="11" fill={active ? "#fff" : "#4a4a4a"}>
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-edge pt-3 font-mono text-[10px] text-faint sm:grid-cols-4">
        {nodes.map((n) => (
          <div key={n.key} className="flex items-center justify-between gap-2">
            <span className="uppercase tracking-wide">{n.label}</span>
            <span className={n.count > 0 ? "font-bold text-white" : ""}>{n.count.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-faint">volume scale — dots flow from the lead source to the archive</p>
    </div>
  );
}