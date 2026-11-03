import React from "react";

export function Skeleton({
  height = "1.5rem",
  width = "100%",
  className = "",
  style = {},
}: {
  height?: string;
  width?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`skeleton-box ${className}`}
      style={{
        height,
        width,
        backgroundColor: "rgba(28, 22, 19, 0.08)",
        border: "1px dashed rgba(28, 22, 19, 0.2)",
        animation: "pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: "0.75rem",
            padding: "0.75rem",
            borderBottom: "1px solid rgba(28, 22, 19, 0.15)",
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height="1.1rem" width={c === 0 ? "80%" : "90%"} />
          ))}
        </div>
      ))}
    </div>
  );
}
