import React from "react";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";

export default function NotFound() {
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
        <span className="kicker" style={{ marginBottom: "0.5rem" }}>
          ✦ ERRATUM · PAGE RETRACTED ✦
        </span>
        <h1 className="headline" style={{ fontSize: "3rem", margin: "0.5rem 0" }}>
          404: Story Not Found
        </h1>
        <hr className="rule-double" style={{ margin: "1.25rem 0" }} />
        <p className="deck" style={{ marginBottom: "1.5rem" }}>
          The requested column, dossier, or editorial desk cannot be located in the current publication archive.
        </p>
        <Link href="/" className="ink-btn" style={{ textDecoration: "none" }}>
          Return to The Front Page
        </Link>
      </div>
    </AdminShell>
  );
}
