"use client";

import React from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm Decision",
  cancelLabel = "Return",
  isDestructive = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(20, 16, 14, 0.75)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="paper modal-dialog"
        style={{
          width: "100%",
          maxWidth: "480px",
          padding: "2rem",
          border: "2px solid var(--ink)",
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          position: "relative",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <span
            style={{
              fontFamily: "var(--font-label)",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              fontSize: "0.75rem",
              color: isDestructive ? "var(--stamp)" : "var(--ink-soft)",
              fontWeight: 600,
            }}
          >
            Editorial Notice
          </span>
          <h3
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "1.75rem",
              margin: "0.4rem 0",
              color: isDestructive ? "var(--stamp)" : "var(--ink)",
              letterSpacing: "0.02em",
              lineHeight: 1.1,
            }}
          >
            {title}
          </h3>
          <hr className="rule-double" style={{ margin: "0.75rem 0" }} />
        </div>

        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "1.05rem",
            lineHeight: 1.5,
            color: "var(--ink)",
            marginBottom: "1.25rem",
          }}
        >
          {message}
        </p>

        {children}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.75rem",
            marginTop: "1.5rem",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="ink-btn-secondary"
            style={{
              padding: "0.5rem 1rem",
              fontFamily: "var(--font-label)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: "0.85rem",
              background: "transparent",
              border: "1px solid var(--ink-soft)",
              color: "var(--ink)",
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={isDestructive ? "stamp-btn" : "ink-btn"}
            style={{
              padding: "0.5rem 1.25rem",
              fontFamily: "var(--font-label)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: "0.85rem",
              background: isDestructive ? "var(--stamp)" : "var(--ink)",
              color: "var(--paper)",
              border: `1px solid ${isDestructive ? "var(--stamp)" : "var(--ink)"}`,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
