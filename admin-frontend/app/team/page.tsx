"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { Num } from "@/components/Num";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/TickerToast";
import { api } from "@/lib/client";
import {
  TeamMember,
  DomainEnum,
  DOMAINS,
  DOMAIN_LABELS,
} from "@/lib/types";
import { TEAM_LIST_SUPPORTED } from "@/lib/config";

interface ParsedEmail {
  raw: string;
  clean: string;
  isValid: boolean;
  reason?: string;
  isDuplicate?: boolean;
}

export default function TeamPage() {
  return (
    <AuthGuard requireRoot={true}>
      <AdminShell>
        <TeamWrapper />
      </AdminShell>
    </AuthGuard>
  );
}

function TeamWrapper() {
  const { user } = useAuth();
  const isRoot = user?.role === "ROOT_ADMIN";

  if (!isRoot) {
    return (
      <div style={{ padding: "4rem 1.5rem", textAlign: "center" }}>
        <span className="kicker" style={{ color: "var(--stamp)" }}>✦ 403: CLEARANCE DENIED ✦</span>
        <h1 className="headline" style={{ fontSize: "2.5rem", margin: "0.5rem 0", color: "var(--stamp)" }}>
          The Masthead is Restricted
        </h1>
        <hr className="rule-double" style={{ margin: "1.25rem 0" }} />
        <p className="deck" style={{ maxWidth: "600px", margin: "0 auto 1.5rem auto" }}>
          Only the Root Admin possesses editorial authority to manage and appoint Domain Heads to The Masthead.
        </p>
        <Link href="/" className="ink-btn" style={{ textDecoration: "none" }}>
          ← Return to The Front Page
        </Link>
      </div>
    );
  }

  return <TeamManagementContent />;
}

function TeamManagementContent() {
  const { showToast } = useToast();

  useEffect(() => {
    document.title = "The Masthead · The TAM Times Admin";
  }, []);

  const [rawEmails, setRawEmails] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<DomainEnum>("TECHNICAL");
  const [submitting, setSubmitting] = useState(false);

  // Result panel state
  const [assignResult, setAssignResult] = useState<{
    success: boolean;
    message: string;
    assignedEmails: string[];
    alreadyExisting?: string[];
  } | null>(null);

  // Team roster state
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Live Email Parsing
  const parsedEmailList: ParsedEmail[] = useMemo(() => {
    if (!rawEmails.trim()) return [];
    const tokens = rawEmails
      .split(/[,;\n]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const seen = new Set<string>();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return tokens.map((token) => {
      const lower = token.toLowerCase();
      if (seen.has(lower)) {
        return {
          raw: token,
          clean: lower,
          isValid: false,
          isDuplicate: true,
          reason: "Duplicate email address",
        };
      }
      seen.add(lower);

      if (!lower.includes("@")) {
        return {
          raw: token,
          clean: lower,
          isValid: false,
          reason: "Missing '@' symbol",
        };
      }

      if (!emailRegex.test(lower)) {
        return {
          raw: token,
          clean: lower,
          isValid: false,
          reason: "Invalid email structure",
        };
      }

      return {
        raw: token,
        clean: lower,
        isValid: true,
      };
    });
  }, [rawEmails]);

  const validEmails = useMemo(() => {
    return parsedEmailList.filter((e) => e.isValid).map((e) => e.clean);
  }, [parsedEmailList]);

  const invalidEmails = useMemo(() => {
    return parsedEmailList.filter((e) => !e.isValid);
  }, [parsedEmailList]);

  // Load team roster
  const loadMembers = useCallback(async () => {
    if (!TEAM_LIST_SUPPORTED) {
      setLoadingMembers(false);
      return;
    }
    setLoadingMembers(true);
    try {
      const list = await api.getDomainHeads();
      setMembers(list || []);
    } catch {
      showToast("Failed to load masthead roster.", "error");
    } finally {
      setLoadingMembers(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Submit Domain Heads
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validEmails.length === 0) {
      showToast("Please enter at least one valid email address.", "error");
      return;
    }

    setSubmitting(true);
    setAssignResult(null);

    try {
      const result = await api.addDomainHeads(validEmails, selectedDomain);
      setAssignResult({
        success: true,
        message: result.message,
        assignedEmails: result.assignedEmails || [],
        alreadyExisting: (result as any).alreadyExisting || [],
      });
      showToast(result.message || "Domain heads assigned successfully.", "success");
      setRawEmails("");
      loadMembers();
    } catch (err: any) {
      setAssignResult({
        success: false,
        message: err.message || "Failed to assign domain heads.",
        assignedEmails: [],
        alreadyExisting: err.alreadyExisting || [],
      });
      showToast(err.message || "Assignment error.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header section */}
      <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "1rem" }}>
        <span className="kicker">✦ EDITORIAL HIERARCHY · ROOT ADMIN AUTHORITY ✦</span>
        <h1 className="headline" style={{ fontSize: "2.4rem", margin: "0.25rem 0 0.4rem 0" }}>
          The Masthead
        </h1>
        <p className="deck" style={{ margin: 0, maxWidth: "700px" }}>
          Appoint Domain Heads, issue editorial credentials, and oversee division leadership.
        </p>
      </div>

      {/* Appointment Section */}
      <div>
        {/* ADD DOMAIN HEADS FORM */}
        <form
          onSubmit={handleAssignSubmit}
          className="paper"
          style={{
            border: "2px solid var(--ink)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          <div style={{ borderBottom: "1px solid var(--ink)", paddingBottom: "0.4rem" }}>
            <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.4rem", margin: 0, textTransform: "uppercase" }}>
              Appoint Domain Heads
            </h3>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              Authorize candidate dossier review clearances
            </span>
          </div>

          {/* Division Selector */}
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
              Target Division
            </label>
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value as DomainEnum)}
              className="newspaper-select"
              style={{ width: "100%", padding: "0.45rem 0.6rem" }}
            >
              {DOMAINS.map((dom) => (
                <option key={dom} value={dom}>
                  {DOMAIN_LABELS[dom]}
                </option>
              ))}
            </select>
          </div>

          {/* Textarea */}
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.2rem" }}>
              Email Addresses
            </label>
            <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginBottom: "0.3rem" }}>
              Separate multiple email addresses with commas, semicolons, or new lines.
            </div>
            <textarea
              rows={4}
              value={rawEmails}
              onChange={(e) => setRawEmails(e.target.value)}
              className="newspaper-textarea"
              style={{ width: "100%", padding: "0.5rem 0.6rem" }}
            />
          </div>

          {/* Live Parsed Email Chips */}
          {parsedEmailList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", backgroundColor: "rgba(28, 22, 19, 0.02)", padding: "0.75rem", border: "1px dashed var(--ink)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontFamily: "var(--font-label)" }}>
                <span>
                  <strong><Num>{validEmails.length}</Num> valid</strong> {validEmails.length === 1 ? "address" : "addresses"} parsed
                </span>
                {invalidEmails.length > 0 && (
                  <span style={{ color: "var(--stamp)", fontWeight: 700 }}>
                    <Num>{invalidEmails.length}</Num> invalid or duplicate
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", maxHeight: "150px", overflowY: "auto" }}>
                {parsedEmailList.map((item, idx) => (
                  <span
                    key={`${item.clean}-${idx}`}
                    title={item.reason || "Valid email"}
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.72rem",
                      padding: "0.15rem 0.45rem",
                      border: item.isValid ? "1px solid var(--ink)" : "1px dashed var(--stamp)",
                      backgroundColor: item.isValid ? "var(--paper)" : "rgba(139, 30, 30, 0.08)",
                      color: item.isValid ? "var(--ink)" : "var(--stamp)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    {!item.isValid && <span>✕</span>}
                    {item.raw}
                    {item.reason && <span style={{ fontSize: "0.65rem", opacity: 0.85 }}>({item.reason})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || validEmails.length === 0}
            className="stamp-btn"
            style={{ width: "100%", padding: "0.65rem 1rem", fontSize: "0.85rem" }}
          >
            {submitting ? "Appointing..." : `Appoint ${validEmails.length} Head(s) to ${DOMAIN_LABELS[selectedDomain]}`}
          </button>

          {/* Result Panel */}
          {assignResult && (
            <div
              style={{
                border: `2px solid ${assignResult.success ? "var(--ink)" : "var(--stamp)"}`,
                padding: "0.85rem 1rem",
                backgroundColor: assignResult.success ? "rgba(28, 22, 19, 0.02)" : "rgba(139, 30, 30, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: assignResult.success ? "var(--ink)" : "var(--stamp)" }}>
                ✦ {assignResult.message}
              </div>

              {assignResult.assignedEmails.length > 0 && (
                <div style={{ fontSize: "0.78rem", fontFamily: "var(--font-label)" }}>
                  <strong>Assigned:</strong> {assignResult.assignedEmails.join(", ")}
                </div>
              )}

              {assignResult.alreadyExisting && assignResult.alreadyExisting.length > 0 && (
                <div style={{ fontSize: "0.78rem", color: "var(--stamp)", fontFamily: "var(--font-label)" }}>
                  <strong>Already have accounts:</strong> {assignResult.alreadyExisting.join(", ")}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* THE MASTHEAD ROSTER */}
      <div
        className="paper"
        style={{
          border: "2px solid var(--ink)",
          padding: "1.25rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--ink)", paddingBottom: "0.4rem" }}>
          <div>
            <span className="kicker" style={{ marginBottom: "0.15rem" }}>✦ EDITORIAL ROSTER ✦</span>
            <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.5rem", margin: 0, textTransform: "uppercase" }}>
              The Masthead Directory
            </h3>
          </div>
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", color: "var(--ink-soft)" }}>
            <Num>{members.length}</Num> Registered Administrators
          </span>
        </div>

        {!TEAM_LIST_SUPPORTED ? (
          <div style={{ padding: "1.5rem", textAlign: "center", border: "1px dashed var(--ink)", backgroundColor: "rgba(28, 22, 19, 0.02)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "1rem", color: "var(--ink-soft)", margin: 0 }}>
              The team member directory endpoint is not yet supported by the server.
            </p>
          </div>
        ) : loadingMembers ? (
          <Skeleton height="150px" />
        ) : members.length === 0 ? (
          <EmptyState
            title="No domain heads found"
            description="No domain head credentials have been registered in the system."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--ink)", fontFamily: "var(--font-label)", textTransform: "uppercase" }}>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Name</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Email Address</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Division</th>
                  <th style={{ padding: "0.5rem 0.6rem" }}>Role</th>
                  <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const domLabel = m.domain ? DOMAIN_LABELS[m.domain] : "All Divisions (Root)";
                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: "1px solid rgba(28, 22, 19, 0.15)",
                        backgroundColor: "rgba(28, 22, 19, 0.01)",
                      }}
                    >
                      <td style={{ padding: "0.6rem", fontWeight: 700, fontFamily: "var(--font-headline)", fontSize: "1.05rem" }}>
                        {m.name}
                      </td>
                      <td style={{ padding: "0.6rem", fontFamily: "var(--font-label)" }}>
                        {m.email}
                      </td>
                      <td style={{ padding: "0.6rem", fontFamily: "var(--font-label)", textTransform: "uppercase" }}>
                        {domLabel}
                      </td>
                      <td style={{ padding: "0.6rem", fontFamily: "var(--font-label)" }}>
                        {m.role === "ROOT_ADMIN" ? "Root Admin" : "Domain Head"}
                      </td>
                      <td style={{ padding: "0.6rem", textAlign: "right" }}>
                        {m.claimed ? (
                          <span
                            style={{
                              fontFamily: "var(--font-label)",
                              fontSize: "0.7rem",
                              textTransform: "uppercase",
                              padding: "0.15rem 0.5rem",
                              border: "1.5px solid var(--ink)",
                              color: "var(--ink)",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                            }}
                          >
                            Claimed
                          </span>
                        ) : (
                          <span
                            style={{
                              fontFamily: "var(--font-label)",
                              fontSize: "0.7rem",
                              textTransform: "uppercase",
                              padding: "0.15rem 0.5rem",
                              border: "1.5px dashed var(--stamp)",
                              color: "var(--stamp)",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                            }}
                          >
                            Waiting for Claim
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
