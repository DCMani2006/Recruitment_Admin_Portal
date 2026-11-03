"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

interface ToastMessage {
  id: string;
  type: "info" | "success" | "error";
  text: string;
}

interface ToastContextType {
  showToast: (text: string, type?: "info" | "success" | "error") => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((text: string, type: "info" | "success" | "error" = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, text }]);

    // Auto-dismiss after exactly 4 seconds (4000ms)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            top: "135px",
            right: "2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            zIndex: 10000,
            maxWidth: "380px",
            width: "calc(100vw - 4rem)",
            pointerEvents: "none",
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="paper slide-up"
              style={{
                pointerEvents: "auto",
                padding: "0.6rem 0.9rem",
                border: `2px solid ${t.type === "error" ? "var(--stamp)" : "var(--ink)"}`,
                boxShadow: "3px 4px 0px rgba(28, 22, 19, 0.4)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem",
                fontSize: "0.82rem",
                color: t.type === "error" ? "var(--stamp)" : "var(--ink)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                <span
                  style={{
                    fontFamily: "var(--font-label)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    fontSize: "0.72rem",
                  }}
                >
                  {t.type === "error" ? "✦ NOTICE:" : t.type === "success" ? "✦ BULLETIN:" : "✦ UPDATE:"}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "0.92rem", lineHeight: 1.3 }}>
                  {t.text}
                </span>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss toast"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: t.type === "error" ? "var(--stamp)" : "var(--ink)",
                  fontSize: "1.1rem",
                  lineHeight: 1,
                  padding: "0 0.2rem",
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
