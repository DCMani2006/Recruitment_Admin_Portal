"use client";

import React from "react";
import { ApplicationStage } from "@/lib/types";
import { Num } from "./Num";
import { StageStamp } from "./StageStamp";

interface FiveStepTrackerProps {
  stage: ApplicationStage;
}

const STEPS = [
  { key: "FORM_FILLING", label: "Under Review" },
  { key: "SHORTLISTED", label: "Shortlisted" },
  { key: "SLOT_CHOOSING", label: "Slot Choosing" },
  { key: "INTERVIEW", label: "Interview" },
  { key: "SELECTED", label: "Selected" },
];

export function FiveStepTracker({ stage }: FiveStepTrackerProps) {
  const isRejected = stage === "REJECTED";

  if (isRejected) {
    return (
      <div
        style={{
          border: "1px dashed var(--ink)",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "rgba(28, 22, 19, 0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <StageStamp stage="REJECTED" size="sm" />
          <span style={{ fontFamily: "var(--font-body)", fontSize: "0.95rem", color: "var(--ink-soft)" }}>
            This application was not taken forward for this recruitment cycle.
          </span>
        </div>
      </div>
    );
  }

  // Active step index: 0 to 4
  const stageIndexMap: Record<string, number> = {
    FORM_FILLING: 0,
    SHORTLISTED: 1,
    SLOT_CHOOSING: 2,
    INTERVIEW: 3,
    SELECTED: 4,
  };

  const currentIndex = stageIndexMap[stage] ?? 0;

  return (
    <div
      style={{
        border: "1px solid var(--ink)",
        padding: "0.75rem 1.25rem",
        backgroundColor: "rgba(28, 22, 19, 0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <React.Fragment key={step.key}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.3rem",
                  zIndex: 2,
                }}
              >
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: isCurrent
                      ? "2px solid var(--stamp)"
                      : isCompleted
                      ? "2px solid var(--ink)"
                      : "1px solid var(--ink-soft)",
                    backgroundColor: isCompleted
                      ? "var(--ink)"
                      : isCurrent
                      ? "var(--stamp)"
                      : "var(--paper)",
                    color: isCompleted || isCurrent ? "var(--paper)" : "var(--ink-soft)",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  <Num>{idx + 1}</Num>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: isCurrent ? 700 : isCompleted ? 600 : 400,
                    color: isCurrent ? "var(--stamp)" : isCompleted ? "var(--ink)" : "var(--ink-soft)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {step.label}
                </span>
              </div>

              {idx < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    backgroundColor: idx < currentIndex ? "var(--ink)" : "rgba(28, 22, 19, 0.25)",
                    borderTop: idx >= currentIndex ? "1px dashed var(--ink-soft)" : "none",
                    margin: "0 0.5rem",
                    marginBottom: "1.2rem",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
