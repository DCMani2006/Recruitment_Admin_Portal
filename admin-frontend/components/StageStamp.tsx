"use client";

import React from "react";
import { ApplicationStage, STAGE_LABELS } from "@/lib/types";

interface StageStampProps {
  stage: ApplicationStage;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function StageStamp({ stage, className = "", size = "md" }: StageStampProps) {
  const label = STAGE_LABELS[stage] || stage;

  // Slight deterministic rotation angle based on stage string
  const angle = stage === "SELECTED" ? -3 : stage === "REJECTED" ? 4 : stage === "SHORTLISTED" ? -2 : stage === "INTERVIEW" ? 2 : 1;

  const sizeStyles = {
    sm: { fontSize: "0.68rem", padding: "0.15rem 0.45rem", borderWidth: "1.5px" },
    md: { fontSize: "0.78rem", padding: "0.22rem 0.65rem", borderWidth: "2px" },
    lg: { fontSize: "1rem", padding: "0.35rem 0.95rem", borderWidth: "2.5px" },
  }[size];

  // Distinct shapes and fills as specified:
  // Under Review = ink outline
  // Shortlisted = oxblood outline
  // Slot Choosing = ink dashed outline
  // Interview = solid ink fill with paper-coloured text
  // Selected = solid oxblood fill with paper-coloured text
  // Rejected = ink outline with a diagonal strike through the word
  const getStampAppearance = () => {
    switch (stage) {
      case "FORM_FILLING":
        return {
          borderStyle: "solid",
          borderColor: "var(--ink)",
          backgroundColor: "transparent",
          color: "var(--ink)",
          hasStrike: false,
        };
      case "SHORTLISTED":
        return {
          borderStyle: "solid",
          borderColor: "var(--stamp)",
          backgroundColor: "transparent",
          color: "var(--stamp)",
          hasStrike: false,
        };
      case "SLOT_CHOOSING":
        return {
          borderStyle: "dashed",
          borderColor: "var(--ink)",
          backgroundColor: "transparent",
          color: "var(--ink)",
          hasStrike: false,
        };
      case "INTERVIEW":
        return {
          borderStyle: "solid",
          borderColor: "var(--ink)",
          backgroundColor: "var(--ink)",
          color: "var(--paper)",
          hasStrike: false,
        };
      case "SELECTED":
        return {
          borderStyle: "solid",
          borderColor: "var(--stamp)",
          backgroundColor: "var(--stamp)",
          color: "var(--paper)",
          hasStrike: false,
        };
      case "REJECTED":
        return {
          borderStyle: "solid",
          borderColor: "var(--ink)",
          backgroundColor: "rgba(28, 22, 19, 0.02)",
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(28, 22, 19, 0.12) 3px, rgba(28, 22, 19, 0.12) 5px)",
          color: "var(--ink)",
          hasStrike: false,
        };
      default:
        return {
          borderStyle: "solid",
          borderColor: "var(--ink)",
          backgroundColor: "transparent",
          color: "var(--ink)",
          hasStrike: false,
        };
    }
  };

  const appearance = getStampAppearance();

  return (
    <span
      className={`stage-stamp inline-block select-none ${className}`}
      style={{
        ...sizeStyles,
        fontFamily: "var(--font-headline), sans-serif",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        fontWeight: 700,
        borderWidth: sizeStyles.borderWidth,
        borderStyle: appearance.borderStyle,
        borderColor: appearance.borderColor,
        backgroundColor: appearance.backgroundColor,
        backgroundImage: (appearance as any).backgroundImage || "none",
        color: appearance.color,
        transform: `rotate(${angle}deg)`,
        boxShadow: "0 0 0 1px rgba(28, 22, 19, 0.12)",
        borderRadius: "2px",
        whiteSpace: "nowrap",
        opacity: 0.98,
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        {stage === "REJECTED" ? (
          <>
            <span style={{ marginRight: "0.22rem", fontWeight: 900, fontSize: "0.95em" }}>✕</span>
            <span>REJECTED</span>
          </>
        ) : (
          label
        )}
      </span>
    </span>
  );
}
