import React from "react";

export function Num({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`num ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}
