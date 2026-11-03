"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Editorial Boundary Error:", error);
  }, [error]);

  return (
    <AdminShell>
      <div
        style={{
          padding: "4rem 2rem",
          textAlign: "center",
          maxWidth: "600px",
          margin: "0 auto",
        }}
      >
        <span className="kicker" style={{ color: "var(--stamp)", marginBottom: "0.5rem" }}>
          ✦ PRESS BREAKDOWN · EDITORIAL ERROR ✦
        </span>
        <h1 className="headline" style={{ fontSize: "2.75rem", margin: "0.5rem 0", color: "var(--stamp)" }}>
          An Issue Arose in Publication
        </h1>
        <hr className="rule-double" style={{ margin: "1.25rem 0" }} />
        <p className="deck" style={{ marginBottom: "1.5rem" }}>
          {error.message || "A disturbance occurred while typesetting the requested ledger."}
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <button type="button" onClick={reset} className="ink-btn">
            Retry Dispatch
          </button>
          <Link href="/" className="ink-btn-secondary" style={{ textDecoration: "none" }}>
            Return to Front Page
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
