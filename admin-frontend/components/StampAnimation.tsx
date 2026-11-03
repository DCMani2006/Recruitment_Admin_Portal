"use client";

import React, { useEffect, useState } from "react";
import { ApplicationStage } from "@/lib/types";

interface StampAnimationProps {
  stage: ApplicationStage | null;
  onComplete?: () => void;
}

export function StampAnimation({ stage, onComplete }: StampAnimationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (stage) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        if (onComplete) onComplete();
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [stage, onComplete]);

  if (!visible || !stage) return null;

  const isSelected = stage === "SELECTED";
  const isShortlisted = stage === "SHORTLISTED";
  const text = isSelected
    ? "SELECTED"
    : isShortlisted
    ? "SHORTLISTED"
    : stage === "REJECTED"
    ? "NOT TAKEN FORWARD"
    : stage === "SLOT_CHOOSING"
    ? "SLOT CHOOSING"
    : stage;

  const isOxblood = isSelected || isShortlisted;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(20, 16, 14, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
        pointerEvents: "none",
      }}
    >
      <div
        className="stamp-slam"
        style={{
          fontFamily: "var(--font-headline)",
          fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: isOxblood ? "var(--stamp)" : "var(--ink)",
          border: `6px solid ${isOxblood ? "var(--stamp)" : "var(--ink)"}`,
          padding: "1rem 2.5rem",
          transform: "rotate(-8deg) scale(1)",
          boxShadow: isOxblood
            ? "0 0 0 3px rgba(139, 30, 30, 0.3), inset 0 0 10px rgba(139, 30, 30, 0.2)"
            : "0 0 0 3px rgba(28, 22, 19, 0.3), inset 0 0 10px rgba(28, 22, 19, 0.2)",
          backgroundColor: "rgba(232, 220, 192, 0.95)",
          borderRadius: "4px",
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
}
