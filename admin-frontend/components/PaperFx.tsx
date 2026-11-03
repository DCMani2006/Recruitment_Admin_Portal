"use client";

import React, { useId, useMemo } from "react";

interface PaperFxProps {
  seed?: number;
}

// Mulberry32 deterministic seeded PRNG
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function PaperFx({ seed = 1 }: PaperFxProps) {
  const filterId = useId().replace(/:/g, "");

  const generated = useMemo(() => {
    const prng = mulberry32(seed);

    // Canvas coordinate space: 100 x 138.46 (matching 520:720 aspect ratio)
    const W = 100;
    const H = 138.46;

    // Helper for random in range
    const rand = (min: number, max: number) => min + prng() * (max - min);

    // 1. Fold creases with slight jitter
    const makeHLine = (y: number, numSegments = 10, jitter = 0.35) => {
      const pts: [number, number][] = [];
      const step = W / numSegments;
      for (let i = 0; i <= numSegments; i++) {
        const x = i * step;
        const j = i === 0 || i === numSegments ? 0 : (prng() - 0.5) * jitter * 2;
        pts.push([Number(x.toFixed(2)), Number((y + j).toFixed(2))]);
      }
      return pts.map((p) => `${p[0]},${p[1]}`).join(" ");
    };

    const makeVLine = (x: number, numSegments = 14, jitter = 0.35) => {
      const pts: [number, number][] = [];
      const step = H / numSegments;
      for (let i = 0; i <= numSegments; i++) {
        const y = i * step;
        const j = i === 0 || i === numSegments ? 0 : (prng() - 0.5) * jitter * 2;
        pts.push([Number((x + j).toFixed(2)), Number(y.toFixed(2))]);
      }
      return pts.map((p) => `${p[0]},${p[1]}`).join(" ");
    };

    // Main folds
    const hFold50 = makeHLine(H * 0.5, 12, 0.4);
    const vFold50 = makeVLine(W * 0.5, 14, 0.4);

    // Secondary faint folds (quarter folds)
    const hFold25 = makeHLine(H * 0.25, 10, 0.25);
    const hFold75 = makeHLine(H * 0.75, 10, 0.25);

    // 2. Panel tone brightness delta (+/- 2% to 3%)
    const panelTones = [
      rand(0.015, 0.03),  // Top Left (slightly brighter)
      rand(-0.025, -0.01), // Top Right (slightly darker)
      rand(-0.02, -0.01),  // Bottom Left
      rand(0.015, 0.03),  // Bottom Right
    ];

    // 3. Small creases: 12 short irregular polylines
    // Denser near fold intersections (around x=50, y=69.23, y=34.62, y=103.85)
    const smallCreases: { points: string; opacity: number; strokeWidth: number }[] = [];
    const numCreases = 12;

    for (let i = 0; i < numCreases; i++) {
      // Pick anchor: either near center or scattered
      const nearCenter = prng() < 0.65;
      const originX = nearCenter ? rand(25, 75) : rand(10, 90);
      const originY = nearCenter ? rand(45, 95) : rand(15, 125);
      const length = rand(8, 22);
      const angle = rand(0, Math.PI * 2);

      const segments = 3 + Math.floor(prng() * 3);
      const pts: [number, number][] = [];
      let cx = originX;
      let cy = originY;
      pts.push([Number(cx.toFixed(2)), Number(cy.toFixed(2))]);

      const segLen = length / segments;
      for (let s = 1; s <= segments; s++) {
        const segAngle = angle + (prng() - 0.5) * 0.8;
        cx += Math.cos(segAngle) * segLen;
        cy += Math.sin(segAngle) * segLen;
        pts.push([Number(cx.toFixed(2)), Number(cy.toFixed(2))]);
      }

      smallCreases.push({
        points: pts.map((p) => `${p[0]},${p[1]}`).join(" "),
        opacity: rand(0.12, 0.20),
        strokeWidth: rand(0.08, 0.15),
      });
    }

    // 4. Foxing spots: 4 faint brownish spots at deterministic positions
    const foxingSpots = [
      { cx: rand(12, 28), cy: rand(18, 38), r: rand(2.2, 4.2), opacity: rand(0.06, 0.09) },
      { cx: rand(72, 88), cy: rand(25, 48), r: rand(1.8, 3.5), opacity: rand(0.05, 0.08) },
      { cx: rand(15, 35), cy: rand(95, 125), r: rand(2.5, 4.5), opacity: rand(0.06, 0.09) },
      { cx: rand(68, 85), cy: rand(85, 115), r: rand(2.0, 3.8), opacity: rand(0.05, 0.08) },
    ];

    return {
      W,
      H,
      hFold50,
      vFold50,
      hFold25,
      hFold75,
      panelTones,
      smallCreases,
      foxingSpots,
    };
  }, [seed]);

  return (
    <div
      aria-hidden="true"
      className="paper-fx-root"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 18,
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
    >
      {/* 2. PANEL TONES (Quad overlay) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          opacity: "calc(var(--crinkle, 0.6))",
        }}
      >
        {generated.panelTones.map((tone, idx) => (
          <div
            key={idx}
            style={{
              backgroundColor: tone > 0 ? "rgba(255, 250, 240, 0.03)" : "rgba(35, 25, 15, 0.025)",
              opacity: Math.abs(tone) * 25,
            }}
          />
        ))}
      </div>

      {/* 4. CRUMPLE LIGHTING: Inline SVG Filter (feTurbulence + feDiffuseLighting) */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: "calc(0.32 * var(--crinkle, 0.6))",
          mixBlendMode: "multiply",
        }}
      >
        <defs>
          <filter id={`paper-crumple-${filterId}`} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.016"
              numOctaves="3"
              seed={seed}
              result="noise"
            />
            <feDiffuseLighting
              in="noise"
              lightingColor="#F6EFE6"
              surfaceScale="2"
              result="light"
            >
              <feDistantLight azimuth="225" elevation="55" />
            </feDiffuseLighting>
            <feComponentTransfer in="light">
              <feFuncR type="linear" slope="0.95" />
              <feFuncG type="linear" slope="0.93" />
              <feFuncB type="linear" slope="0.88" />
            </feComponentTransfer>
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#paper-crumple-${filterId})`} />
      </svg>

      {/* 1, 3, 5. SVG CREASES, SHADING & FOXING SPOTS */}
      <svg
        viewBox={`0 0 ${generated.W} ${generated.H}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: "calc(var(--crinkle, 0.6))",
        }}
      >
        <defs>
          {/* Soft 6cqw shading gradients for main folds */}
          <linearGradient id={`h-shade-50-${filterId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(80, 55, 30, 0.07)" />
            <stop offset="100%" stopColor="rgba(80, 55, 30, 0)" />
          </linearGradient>
          <linearGradient id={`v-shade-50-${filterId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(80, 55, 30, 0.07)" />
            <stop offset="100%" stopColor="rgba(80, 55, 30, 0)" />
          </linearGradient>
        </defs>

        {/* Shading Bands along Main Folds (6cqw wide) */}
        <rect
          x="0"
          y={generated.H * 0.5}
          width={generated.W}
          height="6"
          fill={`url(#h-shade-50-${filterId})`}
        />
        <rect
          x={generated.W * 0.5}
          y="0"
          width="6"
          height={generated.H}
          fill={`url(#v-shade-50-${filterId})`}
        />

        {/* 1. FOLD CREASES: polyline with slight jitter */}
        {/* Main Horizontal Fold 50% */}
        <polyline
          points={generated.hFold50}
          fill="none"
          stroke="rgba(60, 40, 20, 0.30)"
          strokeWidth="0.22"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={generated.hFold50}
          fill="none"
          stroke="rgba(255, 248, 230, 0.45)"
          strokeWidth="0.22"
          transform="translate(0, 0.18)"
          vectorEffect="non-scaling-stroke"
        />

        {/* Main Vertical Fold 50% */}
        <polyline
          points={generated.vFold50}
          fill="none"
          stroke="rgba(60, 40, 20, 0.30)"
          strokeWidth="0.22"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={generated.vFold50}
          fill="none"
          stroke="rgba(255, 248, 230, 0.45)"
          strokeWidth="0.22"
          transform="translate(0.18, 0)"
          vectorEffect="non-scaling-stroke"
        />

        {/* Faint Horizontal Folds 25% and 75% (half contrast) */}
        <polyline
          points={generated.hFold25}
          fill="none"
          stroke="rgba(60, 40, 20, 0.15)"
          strokeWidth="0.16"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={generated.hFold25}
          fill="none"
          stroke="rgba(255, 248, 230, 0.22)"
          strokeWidth="0.16"
          transform="translate(0, 0.14)"
          vectorEffect="non-scaling-stroke"
        />

        <polyline
          points={generated.hFold75}
          fill="none"
          stroke="rgba(60, 40, 20, 0.15)"
          strokeWidth="0.16"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={generated.hFold75}
          fill="none"
          stroke="rgba(255, 248, 230, 0.22)"
          strokeWidth="0.16"
          transform="translate(0, 0.14)"
          vectorEffect="non-scaling-stroke"
        />

        {/* 3. SMALL CREASES: 10-14 short polylines */}
        {generated.smallCreases.map((cr, idx) => (
          <g key={idx}>
            <polyline
              points={cr.points}
              fill="none"
              stroke="rgba(60, 40, 20, 0.22)"
              strokeWidth={cr.strokeWidth}
              strokeOpacity={cr.opacity}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={cr.points}
              fill="none"
              stroke="rgba(255, 248, 230, 0.35)"
              strokeWidth={cr.strokeWidth}
              strokeOpacity={cr.opacity * 0.9}
              transform="translate(0.12, 0.12)"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {/* 5b. FOXING SPOTS */}
        {generated.foxingSpots.map((spot, idx) => (
          <circle
            key={idx}
            cx={spot.cx}
            cy={spot.cy}
            r={spot.r}
            fill="rgba(120, 75, 35, 0.12)"
            opacity={spot.opacity * 10}
            filter="blur(1px)"
          />
        ))}
      </svg>

      {/* 5a. AGED EDGES: Inset shadows & corner gradients */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: `
            inset 0 0 4cqw rgba(120, 80, 30, 0.24),
            inset 0 0 1.2cqw rgba(80, 50, 20, 0.32)
          `,
          opacity: "calc(0.9 * var(--crinkle, 0.6))",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
