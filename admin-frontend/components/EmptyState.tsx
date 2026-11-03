import React from "react";

export function EmptyState({
  title = "No applications match these filters.",
  description = "Try selecting another stage or clearing your search query.",
  onClear,
  actionLabel = "Clear filters",
}: {
  title?: string;
  description?: string;
  onClear?: () => void;
  actionLabel?: string;
}) {
  return (
    <div
      style={{
        padding: "3.5rem 1.5rem",
        textAlign: "center",
        border: "1px dashed var(--ink)",
        backgroundColor: "rgba(28, 22, 19, 0.02)",
        margin: "1.5rem 0",
      }}
    >
      <span className="kicker" style={{ marginBottom: "0.4rem" }}>
        ✦ CLASSIFIED NOTICE ✦
      </span>
      <h3
        style={{
          fontFamily: "var(--font-headline)",
          fontSize: "1.6rem",
          margin: "0.25rem 0 0.5rem 0",
          color: "var(--ink)",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "1.05rem",
          color: "var(--ink-soft)",
          maxWidth: "480px",
          margin: "0 auto 1.25rem auto",
        }}
      >
        {description}
      </p>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ink-btn-secondary"
          style={{ fontSize: "0.82rem", padding: "0.45rem 1rem" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
