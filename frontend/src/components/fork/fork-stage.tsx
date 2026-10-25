"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MutableRefObject, type PointerEvent } from "react";
import type { CaseCard } from "@/lib/contracts/advice";
import type { OpenSources } from "../results/case-detail";
import { gsap, MOTION_OK, useGSAP } from "./gsap";
import { Odometer } from "./odometer";
import { fractionOf, isHighlighted, opacityFor, stageNameAt, type Focus, type ForkPath, type Stop } from "./model";

/* Timeline units (scrubbed, so only the ratios matter). */
const T_TRUNK = 1;
const T_FORK = 0.3;
const T_BRANCH = 5;
const T_HOLD = 1.2;
const BRANCH_START = T_TRUNK + T_FORK;
const RAIL = 56;

export interface StageApi {
  scrollTo: (pathId: string) => void;
}

interface Props {
  paths: ForkPath[];
  focus: Focus | null;
  handleT: number;
  onHover: (f: Focus | null) => void;
  onHandle: (t: number) => void;
  onReveal: (counts: number[]) => void;
  onOpenSources: OpenSources;
  onShowDetails: (pathId: string) => void;
  apiRef: MutableRefObject<StageApi | null>;
}

interface Dot {
  x: number;
  y: number;
  above: boolean;
  frac: number;
}

interface Layout {
  W: number;
  H: number;
  midY: number;
  cx: number;
  forkX: number;
  r: number;
  first: number;
  last: number;
  cardW: number;
  lines: number;
  chips: boolean;
  railY: number;
  trunk: string;
  branches: { y: number; d: string; dots: Dot[] }[];
}

function computeLayout(W: number, H: number, paths: ForkPath[]): Layout {
  const drawH = H - RAIL;
  const midY = drawH / 2;
  const n = paths.length;
  const band = drawH / n;
  const forkX = Math.round(W * 0.2);
  const r = 9;
  const branchX0 = forkX + Math.max(110, W * 0.11);
  const cx = (forkX + branchX0) / 2;
  const endX = W - 2;
  const maxStops = Math.max(...paths.map((p) => p.stops.length), 2);

  // Same-side neighbours are two stops apart, so a card may be ~2 spacings wide.
  // The first card starts right of the curves, so no card ever covers a bend.
  let cardW = 280;
  for (let k = 0; k < 4; k++) {
    const f = branchX0 + cardW / 2 + 10;
    const l = W - cardW / 2 - 4;
    cardW = Math.min(280, Math.max(170, (2 * (l - f)) / (maxStops - 1) - 20));
  }
  const first = branchX0 + cardW / 2 + 10;
  const last = W - cardW / 2 - 4;

  // Room between a line and the edge of its band; decides how much a card shows.
  const zone = band / 2 - 22;
  const chips = zone >= 120;
  const lines = Math.max(1, Math.min(4, Math.floor((zone - (chips ? 70 : 42)) / 18)));

  const branches = paths.map((p, k) => {
    const y = band * (k + 0.5);
    // Approximate the cubic's length by sampling; it only sets reveal timing.
    let bez = 0;
    let px = forkX + r;
    let py = midY;
    for (let s = 1; s <= 24; s++) {
      const t = s / 24;
      const u = 1 - t;
      const x = u * u * u * (forkX + r) + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * branchX0;
      const yy = u * u * u * midY + 3 * u * u * t * midY + 3 * u * t * t * y + t * t * t * y;
      bez += Math.hypot(x - px, yy - py);
      px = x;
      py = yy;
    }
    const total = bez + (endX - branchX0);
    const dots = p.stops.map((_, i) => {
      const x = first + fractionOf(p, i) * (last - first);
      // Mirror-image alternation so neighbouring paths' first cards face away from each other.
      return { x, y, above: (i + k) % 2 === 0, frac: (bez + (x - branchX0)) / total };
    });
    return { y, dots, d: `M ${forkX + r} ${midY} C ${cx} ${midY}, ${cx} ${y}, ${branchX0} ${y} L ${endX} ${y}` };
  });

  return { W, H, midY, cx, forkX, r, first, last, cardW, lines, chips, railY: H - RAIL / 2, trunk: `M 0 ${midY} L ${forkX - r} ${midY}`, branches };
}

const dotTime = (frac: number) => BRANCH_START + T_BRANCH * frac;

/**
 * The pinned fork: scrolling draws "you, now" to the fork, then one branch per
 * historical case. Each stop pops in as its line arrives. A stage handle on
 * the rail below moves along every branch at once.
 */
export function ForkStage({ paths, focus, handleT, onHover, onHandle, onReveal, onOpenSources, onShowDetails, apiRef }: Props) {
  const section = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ W: number; H: number } | null>(null);
  const revealed = useRef("");
  const [handleOn, setHandleOn] = useState(false);

  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize((s) => (s && Math.abs(s.W - width) < 1 && Math.abs(s.H - height) < 1 ? s : { W: width, H: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const L = useMemo(() => (size ? computeLayout(size.W, size.H, paths) : null), [size, paths]);

  useGSAP(
    () => {
      if (!L) return;
      const report = (counts: number[]) => {
        const key = counts.join(",");
        if (key !== revealed.current) {
          revealed.current = key;
          onReveal(counts);
        }
      };
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const q = gsap.utils.selector(section);
        const times = L.branches.map((b) => b.dots.map((d) => dotTime(d.frac)));
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: section.current,
            start: "top top",
            end: () => `+=${Math.round(window.innerHeight * (2.4 + paths.length * 0.5))}`,
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          onUpdate: () => {
            const now = tl.time() + 0.05;
            report(times.map((ts) => ts.filter((t) => t <= now).length));
            setHandleOn(now >= BRANCH_START + T_BRANCH);
          },
        });

        const trunk = q<SVGPathElement>("[data-trunk]")[0]!;
        const tLen = trunk.getTotalLength();
        tl.fromTo(trunk, { strokeDasharray: tLen, strokeDashoffset: tLen }, { strokeDashoffset: 0, duration: T_TRUNK }, 0);
        tl.fromTo("[data-you]", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
        tl.fromTo("[data-fork-node]", { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: T_FORK, ease: "back.out(3)" }, T_TRUNK);
        tl.fromTo("[data-fork-label]", { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: T_FORK }, T_TRUNK);
        q<SVGPathElement>("[data-branch]").forEach((p) => {
          const len = p.getTotalLength();
          tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: T_BRANCH }, BRANCH_START);
        });
        tl.fromTo("[data-figure]", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", stagger: 0.1 }, BRANCH_START);

        L.branches.forEach((b, k) => {
          b.dots.forEach((d, i) => {
            const at = dotTime(d.frac);
            const key = `[data-key="${k}-${i}"]`;
            tl.fromTo(`[data-dot]${key}`, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.22, ease: "back.out(4)" }, at);
            tl.fromTo(`[data-stem]${key}`, { scaleY: 0, transformOrigin: d.above ? "50% 100%" : "50% 0%" }, { scaleY: 1, duration: 0.15 }, at + 0.05);
            tl.fromTo(`[data-card-inner]${key}`, { opacity: 0, y: d.above ? 18 : -18 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at + 0.1);
            tl.fromTo(
              q(`${key} .odo-strip`),
              { y: 0, yPercent: 0 },
              { yPercent: (_i: number, el: HTMLElement) => -10 * Number(el.dataset.digit), duration: 0.55, ease: "power2.out", stagger: 0.09 },
              at + 0.12,
            );
          });
        });
        tl.fromTo("[data-end-label]", { opacity: 0 }, { opacity: 1, duration: 0.3 }, BRANCH_START + T_BRANCH - 0.2);
        tl.fromTo("[data-rail]", { opacity: 0 }, { opacity: 1, duration: 0.4 }, BRANCH_START + T_BRANCH - 0.3);
        tl.to({}, { duration: T_HOLD });

        apiRef.current = {
          scrollTo: (pathId) => {
            const k = paths.findIndex((p) => p.id === pathId);
            const d = L.branches[k]?.dots[0];
            const st = tl.scrollTrigger;
            if (!d || !st) return;
            const at = Math.min(dotTime(d.frac) + 0.7, tl.duration());
            window.scrollTo({ top: st.start + (at / tl.duration()) * (st.end - st.start), behavior: "smooth" });
          },
        };
        return () => {
          apiRef.current = null;
        };
      });

      mm.add("(prefers-reduced-motion: reduce)", () => {
        report(L.branches.map((b) => b.dots.length));
        setHandleOn(true);
        apiRef.current = { scrollTo: () => section.current?.scrollIntoView({ block: "start" }) };
      });
    },
    { scope: section, dependencies: [L], revertOnUpdate: true },
  );

  /* ---- stage handle (pointer + keyboard) ---- */
  const steps = Math.max(...paths.map((p) => p.stops.length)) - 1;
  const tToX = (t: number) => (L ? L.first + t * (L.last - L.first) : 0);
  const xToT = (clientX: number) => {
    if (!L || !box.current) return 0;
    const x = clientX - box.current.getBoundingClientRect().left;
    return Math.min(1, Math.max(0, (x - L.first) / (L.last - L.first)));
  };
  const tweenTo = (to: number) => {
    const proxy = { t: handleT };
    gsap.to(proxy, { t: to, duration: 0.35, ease: "power3.out", onUpdate: () => onHandle(proxy.t) });
  };
  const dragging = useRef(false);
  const onDown = (e: PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onHandle(xToT(e.clientX));
  };
  const onMove = (e: PointerEvent) => {
    if (dragging.current) onHandle(xToT(e.clientX));
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    tweenTo(Math.round(xToT(e.clientX) * steps) / steps);
  };
  const onKey = (e: KeyboardEvent) => {
    const i = Math.round(handleT * steps);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? steps : null;
    if (next === null) return;
    e.preventDefault();
    tweenTo(Math.min(steps, Math.max(0, next)) / steps);
  };
  const stageName = stageNameAt(paths, handleT);
  const longest = paths.reduce((a, b) => (b.stops.length > a.stops.length ? b : a), paths[0]!);

  return (
    <section ref={section} aria-labelledby="fork-stage-title" className="relative h-svh overflow-hidden bg-paper pt-[104px] pb-5">
      <h2 id="fork-stage-title" className="sr-only">
        The fork: one path per historical case, stage by stage
      </h2>
      <div className="h-full">
        <div ref={box} className="relative h-full w-full">
          {L ? (
            <>
              <svg width={L.W} height={L.H} className="absolute inset-0 overflow-visible" aria-hidden="true">
                <path data-trunk d={L.trunk} fill="none" stroke="#14120F" strokeWidth={1.5} />
                <circle data-fork-node cx={L.forkX} cy={L.midY} r={L.r} fill="#F2EDE4" stroke="#14120F" strokeWidth={1.5} />
                {L.branches.map((b, k) => (
                  <g key={paths[k]!.id} style={{ opacity: opacityFor(focus, paths[k]!), transition: "opacity .35s" }}>
                    <path data-branch d={b.d} fill="none" stroke={paths[k]!.color} strokeWidth={2} strokeLinecap="round" />
                  </g>
                ))}
                {L.branches.map((b, k) => {
                  const p = paths[k]!;
                  return b.dots.map((d, i) => {
                    const hi = isHighlighted(focus, p, i);
                    const lesson = p.stops[i]!.key === "lesson";
                    return (
                      <g key={`${p.id}-${i}`} style={{ opacity: opacityFor(focus, p, i), transition: "opacity .35s" }}>
                        <line data-stem data-key={`${k}-${i}`} x1={d.x} x2={d.x} y1={d.above ? d.y - 6 : d.y + 6} y2={d.above ? d.y - 16 : d.y + 16} stroke={p.color} strokeWidth={1} />
                        {lesson ? (
                          <rect
                            data-dot
                            data-key={`${k}-${i}`}
                            x={d.x - (hi ? 7 : 5.5)}
                            y={d.y - (hi ? 7 : 5.5)}
                            width={hi ? 14 : 11}
                            height={hi ? 14 : 11}
                            transform={`rotate(45 ${d.x} ${d.y})`}
                            fill={hi ? p.color : "#F2EDE4"}
                            stroke={p.color}
                            strokeWidth={2}
                          />
                        ) : (
                          <circle data-dot data-key={`${k}-${i}`} cx={d.x} cy={d.y} r={hi ? 8 : 6} fill={hi ? p.color : "#F2EDE4"} stroke={p.color} strokeWidth={2} />
                        )}
                      </g>
                    );
                  });
                })}
              </svg>

              <p data-you className="label absolute left-0 text-ink" style={{ top: L.midY + 10 }}>
                You, now
              </p>
              <p data-fork-label className="label absolute text-right text-ink" style={{ top: L.midY + 14, left: L.forkX - 120, width: 120 + L.r }}>
                The fork
              </p>

              {paths.map((p, k) => {
                const b = L.branches[k]!;
                const onTrunk = Math.abs(b.y - L.midY) < 1;
                const lastDot = b.dots.at(-1);
                return (
                  <div key={p.id} style={{ opacity: opacityFor(focus, p), transition: "opacity .35s" }}>
                    <div className="absolute left-0" style={{ top: onTrunk ? b.y - 14 : b.y, width: L.cx - 16, transform: onTrunk ? "translateY(-100%)" : "translateY(-50%)" }}>
                    <button type="button" data-figure onClick={() => onShowDetails(p.id)} className="flex items-center gap-3 text-left">
                      <Avatar initials={p.initials} color={p.color} size={46} />
                      <span className="min-w-0">
                        <span className="label block" style={{ color: p.color }}>
                          {p.roleLabel}
                        </span>
                        <span className="block font-serif text-[21px] leading-tight text-ink">{p.short}</span>
                        <span className="label block text-muted">
                          {p.card.display_date}
                          {p.rating ? ` · fit ${p.rating.analogy_fit}` : ""}
                        </span>
                      </span>
                    </button>
                    </div>
                    <p data-end-label className="label absolute right-0 text-right" style={{ top: lastDot?.above === false ? b.y - 26 : b.y + 12, color: p.color }}>
                      {p.rating ? `${p.rating.analogy_fit}/100 fit` : p.roleLabel}
                    </p>
                  </div>
                );
              })}

              {paths.map((p, k) =>
                p.stops.map((s, i) => {
                  const d = L.branches[k]!.dots[i]!;
                  const left = Math.min(Math.max(d.x - L.cardW / 2, 0), L.W - L.cardW);
                  return (
                    <StopCard
                      key={`${p.id}-${i}`}
                      path={p}
                      stop={s}
                      first={i === 0}
                      dataKey={`${k}-${i}`}
                      above={d.above}
                      lines={L.lines}
                      chips={L.chips}
                      highlighted={isHighlighted(focus, p, i)}
                      style={{
                        left,
                        top: d.above ? d.y - 16 : d.y + 16,
                        width: L.cardW,
                        transform: d.above ? "translateY(-100%)" : undefined,
                        opacity: opacityFor(focus, p, i),
                      }}
                      onHover={(on) => onHover(on ? { source: p.id, t: fractionOf(p, i) } : null)}
                      onOpen={() => onShowDetails(p.id)}
                      onSources={(card, claimId) => onOpenSources(card, claimId, p.refs)}
                    />
                  );
                }),
              )}

              {/* stage rail + handle: one hairline that rides every branch */}
              <div data-rail className="absolute inset-x-0" style={{ top: L.railY }}>
                <span aria-hidden="true" className="absolute h-px bg-ink/30" style={{ left: L.first, width: L.last - L.first }} />
                {longest.stops.map((s, i) => (
                  <span
                    key={s.key}
                    aria-hidden="true"
                    className="label absolute -translate-x-1/2 pt-3 whitespace-nowrap text-muted transition-opacity"
                    style={{ left: tToX(fractionOf(longest, i)), opacity: handleOn && Math.round(handleT * steps) === i ? 0 : 1 }}
                  >
                    <span className="absolute top-[-3px] left-1/2 h-[7px] w-px bg-ink/40" />
                    {s.label}
                  </span>
                ))}
              </div>
              <div
                aria-hidden={!handleOn}
                className="pointer-events-none absolute top-0 transition-opacity duration-500"
                style={{ left: tToX(handleT), height: L.H, opacity: handleOn ? 1 : 0, visibility: handleOn ? "visible" : "hidden" }}
              >
                <div className="absolute -translate-x-1/2 border-l border-dashed border-ink/50" style={{ top: L.branches[0]!.y - 24, height: L.railY - L.branches[0]!.y + 24 }} />
                {L.branches.map((b, k) => (
                  <span
                    key={k}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    className="pointer-events-auto absolute z-20 size-[18px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border-2 bg-paper"
                    style={{ top: b.y, borderColor: paths[k]!.color }}
                  />
                ))}
                <div
                  role="slider"
                  tabIndex={handleOn ? 0 : -1}
                  aria-label="Stage, on every path"
                  aria-valuemin={0}
                  aria-valuemax={steps}
                  aria-valuenow={Math.round(handleT * steps)}
                  aria-valuetext={stageName}
                  onKeyDown={onKey}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  className="label pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center gap-2 rounded-full bg-ink px-3 py-1.5 whitespace-nowrap text-paper shadow-[0_4px_16px_rgba(20,18,15,.25)] select-none"
                  style={{ top: L.railY }}
                >
                  <span aria-hidden="true">⟵</span>
                  {stageName}
                  <span aria-hidden="true">⟶</span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function Avatar({ initials, color, size = 44 }: { initials: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full font-serif text-white italic"
      style={{ width: size, height: size, background: color, fontSize: size * (initials.length > 2 ? 0.34 : 0.42) }}
    >
      {initials}
    </span>
  );
}

function StopCard({
  path,
  stop,
  first,
  dataKey,
  above,
  lines,
  chips,
  highlighted,
  style,
  onHover,
  onOpen,
  onSources,
}: {
  path: ForkPath;
  stop: Stop;
  first: boolean;
  dataKey: string;
  above: boolean;
  lines: number;
  chips: boolean;
  highlighted: boolean;
  style: CSSProperties;
  onHover: (on: boolean) => void;
  onOpen: () => void;
  onSources: (card: CaseCard, claimId?: string) => void;
}) {
  return (
    <article
      tabIndex={0}
      aria-label={`${path.short}, ${stop.label}: ${stop.text}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      className="group absolute z-10 cursor-pointer outline-none"
      style={{ ...style, transition: "opacity .35s" }}
    >
      <div
        data-card-inner
        data-key={dataKey}
        className="border bg-paper p-3 transition-[border-color,box-shadow,translate] duration-300 group-focus-visible:outline-2 group-focus-visible:outline-offset-2"
        style={{
          borderColor: highlighted ? path.color : "rgba(20,18,15,.16)",
          boxShadow: highlighted ? `0 10px 28px -12px ${path.color}aa, inset 3px 0 0 ${path.color}` : "none",
          translate: highlighted ? `0 ${above ? -4 : 4}px` : "0 0",
          outlineColor: path.color,
        }}
      >
        <p className="label flex items-baseline justify-between gap-2" style={{ color: path.color }}>
          <span>{stop.label}</span>
          {first ? <Odometer value={path.card.display_date} className="text-muted" /> : null}
        </p>
        <p
          className={`mt-1 overflow-hidden text-ink ${stop.key === "lesson" ? "font-serif text-[15px] leading-[18px] italic" : "text-[13px] leading-[18px]"}`}
          style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }}
          title={stop.text}
        >
          {stop.text}
        </p>
        {chips ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Evidence">
            <li>
              <span
                className={`inline-flex items-center gap-1 rounded-full border border-ink/25 px-2 py-[3px] font-mono text-[9.5px] leading-none tracking-[1px] text-ink/70 uppercase ${stop.type === "interpretation" ? "border-dashed" : ""}`}
              >
                <span aria-hidden="true">{stop.type === "interpretation" ? "◇" : "●"}</span>
                {stop.type}
              </span>
            </li>
            {stop.claimIds.length ? (
              <li>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSources(path.card, stop.claimIds[0]);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-ink/25 px-2 py-[3px] font-mono text-[9.5px] leading-none tracking-[1px] text-ink/70 uppercase hover:bg-ink hover:text-paper"
                >
                  {stop.claimIds.map((id) => `[${path.refs[id] ?? "?"}]`).join("")} src ↗
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
