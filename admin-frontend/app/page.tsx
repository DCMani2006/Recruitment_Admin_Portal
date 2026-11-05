"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { StageStamp } from "@/components/StageStamp";
import { Num } from "@/components/Num";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client";
import { Application, Slot, DOMAIN_LABELS, ApplicationStage, getDisplayStage } from "@/lib/types";
import { formatDate, formatTime, formatDateTime } from "@/lib/config";

export default function OverviewPage() {
  return (
    <AuthGuard>
      <AdminShell>
        <OverviewContent />
      </AdminShell>
    </AuthGuard>
  );
}

function OverviewContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isRoot = user?.role === "ROOT_ADMIN";
  const domainFilter = isRoot ? "ALL" : user?.domain || "ALL";

  useEffect(() => {
    document.title = "Editorial Overview · The TAM Times Admin";
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [appsData, slotsData] = await Promise.all([
          api.getApplicants(domainFilter),
          api.getSchedule("ALL", false, domainFilter === "ALL" ? undefined : domainFilter),
        ]);
        if (mounted) {
          setApplications(appsData);
          setSlots(slotsData);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load overview data.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [domainFilter, user?.id, user?.domain, user?.role]);

  // Stage counts
  const stageCounts: Record<ApplicationStage, number> = {
    FORM_FILLING: 0,
    SHORTLISTED: 0,
    SLOT_CHOOSING: 0,
    INTERVIEW: 0,
    SELECTED: 0,
    REJECTED: 0,
  };

  applications.forEach((app) => {
    const effectiveStage = getDisplayStage(app);
    if (stageCounts[effectiveStage] !== undefined) {
      stageCounts[effectiveStage]++;
    }
  });

  // True count of applications waiting for review (undecided)
  const waitingForReviewCount = applications.filter(
    (a) => a.stage === "FORM_FILLING" && !a.round1Decision
  ).length;

  // Emails to send (marked to shortlist or reject, not yet sent)
  const emailsToSendCount = applications.filter(
    (a) => a.stage === "FORM_FILLING" && (a.round1Decision === "SHORTLIST" || a.round1Decision === "REJECT") && !a.round1EmailSentAt
  ).length;

  // Open slots count
  const openSlotsCount = slots.reduce((acc, s) => {
    const booked = s.bookedCount !== undefined ? s.bookedCount : (s.bookings?.length || 0);
    const capacity = s.capacity || 1;
    return acc + Math.max(0, capacity - booked);
  }, 0);

  // Oldest unreviewed submissions (showing the oldest 5)
  const oldestUnreviewed = [...applications]
    .filter((a) => a.stage === "FORM_FILLING" && !a.round1Decision)
    .sort((a, b) => new Date(a.submittedAt || 0).getTime() - new Date(b.submittedAt || 0).getTime())
    .slice(0, 5);

  // Today's scheduled interviews in Asia/Kolkata
  const todayFormattedKolkata = formatDate(new Date(), false);
  const todayInterviews: {
    slot: Slot;
    booking: any;
    startTime: string;
  }[] = [];

  slots.forEach((s) => {
    if (s.bookings && s.bookings.length > 0) {
      const slotDateFormatted = formatDate(s.startTime, false);
      if (slotDateFormatted === todayFormattedKolkata) {
        s.bookings.forEach((b) => {
          todayInterviews.push({
            slot: s,
            booking: b,
            startTime: s.startTime,
          });
        });
      }
    }
  });

  // Sort today's interviews chronologically
  todayInterviews.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const divisionHeaderLabel = isRoot
    ? "ALL DIVISIONS"
    : user?.domain ? DOMAIN_LABELS[user.domain].toUpperCase() : "GENERAL";

  const deckText = isRoot
    ? "Submitted applications, review progress and interviews across all divisions."
    : "Submitted applications, review progress and interviews for your division.";

  const todayDateString = formatDate(new Date(), false);

  const pipelineStages: { stage: ApplicationStage; label: string; count: number; color: string }[] = [
    { stage: "FORM_FILLING", label: "Waiting for review", count: stageCounts.FORM_FILLING, color: "#1C1613" },
    { stage: "SHORTLISTED", label: "Shortlisted", count: stageCounts.SHORTLISTED, color: "#8B1E1E" },
    { stage: "SLOT_CHOOSING", label: "Slot choosing", count: stageCounts.SLOT_CHOOSING, color: "#A65D24" },
    { stage: "INTERVIEW", label: "Interview", count: stageCounts.INTERVIEW, color: "#3C4A5A" },
    { stage: "SELECTED", label: "Selected", count: stageCounts.SELECTED, color: "#2C5E3B" },
    { stage: "REJECTED", label: "Not taken forward", count: stageCounts.REJECTED, color: "#70685E" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Quiet Header */}
      <section style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <span className="kicker" style={{ fontSize: "0.72rem", letterSpacing: "0.15em", color: "var(--stamp)" }}>
              ✦ EDITORIAL OVERVIEW ✦
            </span>
            <h1
              className="headline"
              style={{
                fontSize: "clamp(1.8rem, 3vw, 2.5rem)",
                margin: "0.2rem 0 0 0",
                lineHeight: 1.1,
              }}
            >
              {divisionHeaderLabel}
            </h1>
          </div>
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--ink-soft)" }}>
            <Num>{todayDateString}</Num> · IST
          </div>
        </div>
      </section>

      {error && (
        <div style={{ padding: "0.75rem 1rem", border: "2px solid var(--stamp)", backgroundColor: "rgba(139, 30, 30, 0.08)", color: "var(--stamp)", fontSize: "0.85rem" }}>
          <strong>✦ Notice:</strong> {error}
        </div>
      )}

      {/* Slim Row of 4 Key Numbers */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "0.85rem",
        }}
      >
        <Link
          href="/applicants?stage=FORM_FILLING"
          className="paper"
          style={{
            border: "1.5px solid var(--ink)",
            padding: "0.9rem 1.1rem",
            textDecoration: "none",
            color: "var(--ink)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "background-color 0.15s ease",
          }}
        >
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-soft)", fontWeight: 700 }}>
            Waiting for Review
          </div>
          <div style={{ fontFamily: "var(--font-headline)", fontSize: "2.2rem", lineHeight: 1, margin: "0.4rem 0 0.1rem 0", color: "var(--ink)" }}>
            <Num>{loading ? "..." : waitingForReviewCount}</Num>
          </div>
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--stamp)", fontWeight: 600 }}>
            Round 1 dossier →
          </div>
        </Link>

        <Link
          href="/applicants"
          className="paper"
          style={{
            border: "1.5px solid var(--ink)",
            padding: "0.9rem 1.1rem",
            textDecoration: "none",
            color: "var(--ink)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "background-color 0.15s ease",
          }}
        >
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-soft)", fontWeight: 700 }}>
            Emails to Send
          </div>
          <div style={{ fontFamily: "var(--font-headline)", fontSize: "2.2rem", lineHeight: 1, margin: "0.4rem 0 0.1rem 0", color: emailsToSendCount > 0 ? "var(--stamp)" : "var(--ink)" }}>
            <Num>{loading ? "..." : emailsToSendCount}</Num>
          </div>
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--stamp)", fontWeight: 600 }}>
            Dispatch panel →
          </div>
        </Link>

        <Link
          href="/interviews"
          className="paper"
          style={{
            border: "1.5px solid var(--ink)",
            padding: "0.9rem 1.1rem",
            textDecoration: "none",
            color: "var(--ink)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "background-color 0.15s ease",
          }}
        >
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-soft)", fontWeight: 700 }}>
            Interviews Today
          </div>
          <div style={{ fontFamily: "var(--font-headline)", fontSize: "2.2rem", lineHeight: 1, margin: "0.4rem 0 0.1rem 0", color: "var(--ink)" }}>
            <Num>{loading ? "..." : todayInterviews.length}</Num>
          </div>
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 600 }}>
            Interview ledger →
          </div>
        </Link>

        <Link
          href="/slots"
          className="paper"
          style={{
            border: "1.5px solid var(--ink)",
            padding: "0.9rem 1.1rem",
            textDecoration: "none",
            color: "var(--ink)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transition: "background-color 0.15s ease",
          }}
        >
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-soft)", fontWeight: 700 }}>
            Open Slots
          </div>
          <div style={{ fontFamily: "var(--font-headline)", fontSize: "2.2rem", lineHeight: 1, margin: "0.4rem 0 0.1rem 0", color: "var(--ink)" }}>
            <Num>{loading ? "..." : openSlotsCount}</Num>
          </div>
          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 600 }}>
            Slot planner →
          </div>
        </Link>
      </section>

      {/* Compact Pipeline Strip */}
      <section
        className="paper"
        style={{
          border: "1.5px solid var(--ink)",
          padding: "1rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
            Recruitment Pipeline · <Num>{applications.length}</Num> Total
          </span>
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.7rem", color: "var(--ink-soft)" }}>
            Select stage to filter dispatches
          </span>
        </div>

        {/* Multi-segment thin bar */}
        <div
          style={{
            height: "8px",
            width: "100%",
            display: "flex",
            backgroundColor: "rgba(28, 22, 19, 0.08)",
            border: "1px solid var(--ink)",
            overflow: "hidden",
          }}
        >
          {applications.length > 0 ? (
            pipelineStages.map((ps) => {
              const pct = (ps.count / applications.length) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={ps.stage}
                  title={`${ps.label}: ${ps.count}`}
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    backgroundColor: ps.color,
                  }}
                />
              );
            })
          ) : (
            <div style={{ width: "100%", height: "100%", backgroundColor: "rgba(28, 22, 19, 0.1)" }} />
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.65rem 1.25rem",
            paddingTop: "0.25rem",
          }}
        >
          {pipelineStages.map((ps) => (
            <Link
              key={ps.stage}
              href={`/applicants?stage=${ps.stage}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                textDecoration: "none",
                color: "var(--ink)",
                fontFamily: "var(--font-label)",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  backgroundColor: ps.color,
                  display: "inline-block",
                  borderRadius: "1px",
                }}
              />
              <span>{ps.label}:</span>
              <strong><Num>{ps.count}</Num></strong>
            </Link>
          ))}
        </div>
      </section>

      {/* Two Plain Lists: Waiting for Review & Today's Schedule */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {/* List 1: Waiting for your review */}
        <div className="paper" style={{ border: "1.5px solid var(--ink)", padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--ink)", paddingBottom: "0.5rem", marginBottom: "0.75rem" }}>
            <h2 style={{ fontFamily: "var(--font-headline)", fontSize: "1.25rem", textTransform: "uppercase", letterSpacing: "0.02em", margin: 0 }}>
              Waiting for Your Review
            </h2>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.76rem", color: "var(--stamp)", fontWeight: 700 }}>
              <Num>{waitingForReviewCount}</Num> waiting
            </span>
          </div>

          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.88rem", color: "var(--ink-soft)", marginBottom: "0.75rem", margin: 0 }}>
            Oldest unreviewed submissions first. Showing {Math.min(5, oldestUnreviewed.length)} of <Num>{waitingForReviewCount}</Num>.
          </p>

          {loading ? (
            <p style={{ fontStyle: "italic", color: "var(--ink-soft)", marginTop: "0.75rem" }}>Loading applications...</p>
          ) : oldestUnreviewed.length === 0 ? (
            <div style={{ padding: "1.5rem 0", textAlign: "center", fontStyle: "italic", color: "var(--ink-soft)" }}>
              ✦ No pending applications waiting for review.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.75rem" }}>
              {oldestUnreviewed.map((app) => (
                <div
                  key={app.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0",
                    borderBottom: "1px solid rgba(28, 22, 19, 0.12)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--ink)" }}>
                      {app.user.name}{" "}
                      <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", fontWeight: 600, color: "var(--ink-soft)" }}>
                        (<Num>{app.user.regNumber}</Num>)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", fontFamily: "var(--font-label)", textTransform: "uppercase", marginTop: "0.15rem" }}>
                      {DOMAIN_LABELS[app.domain]} · Submitted: <Num>{formatDate(app.submittedAt || "", true)}</Num>
                    </div>
                  </div>
                  <Link
                    href={`/applicants/${app.id}`}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem", textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    Open Review →
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "auto", paddingTop: "0.85rem", textAlign: "right" }}>
            <Link
              href="/applicants?stage=FORM_FILLING"
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.76rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--ink)",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              View all <Num>{waitingForReviewCount}</Num> →
            </Link>
          </div>
        </div>

        {/* List 2: Interviews today */}
        <div className="paper" style={{ border: "1.5px solid var(--ink)", padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--ink)", paddingBottom: "0.5rem", marginBottom: "0.75rem" }}>
            <h2 style={{ fontFamily: "var(--font-headline)", fontSize: "1.25rem", textTransform: "uppercase", letterSpacing: "0.02em", margin: 0 }}>
              Interviews Today
            </h2>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.76rem", color: "var(--ink-soft)", fontWeight: 600 }}>
              <Num>{todayInterviews.length}</Num> Scheduled
            </span>
          </div>

          {loading ? (
            <p style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>Checking interview schedule...</p>
          ) : todayInterviews.length === 0 ? (
            <p style={{ fontStyle: "italic", color: "var(--ink-soft)", fontSize: "0.92rem", padding: "1.5rem 0", textAlign: "center" }}>
              ✦ No candidate interviews scheduled for today.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.75rem" }}>
              {todayInterviews.slice(0, 5).map((item, idx) => {
                const timeFormatted = formatTime(item.startTime);
                return (
                  <div
                    key={idx}
                    style={{
                      padding: "0.6rem 0",
                      borderBottom: "1px solid rgba(28, 22, 19, 0.12)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <strong style={{ fontFamily: "var(--font-body)", fontSize: "0.92rem" }}><Num>{timeFormatted}</Num></strong> —{" "}
                      <span style={{ fontWeight: 600 }}>{item.booking?.application?.user?.name || "Candidate"}</span>
                      {isRoot && item.slot.domain && (
                        <span style={{ fontSize: "0.7rem", color: "var(--ink-soft)", marginLeft: "0.35rem", fontFamily: "var(--font-label)" }}>
                          [{DOMAIN_LABELS[item.slot.domain]}]
                        </span>
                      )}
                    </div>
                    {item.slot.meetingLink ? (
                      <a
                        href={item.slot.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ink-btn"
                        style={{ fontSize: "0.68rem", padding: "0.2rem 0.5rem", textDecoration: "none", whiteSpace: "nowrap" }}
                      >
                        Join Call
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.68rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                        Online
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: "auto", paddingTop: "0.85rem", textAlign: "right" }}>
            <Link
              href="/interviews"
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.76rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--ink)",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              Open Interview Ledger →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
