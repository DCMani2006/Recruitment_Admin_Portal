"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { StageStamp } from "@/components/StageStamp";
import { Num } from "@/components/Num";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client";
import { Application, Slot, DOMAIN_LABELS, ApplicationStage } from "@/lib/types";
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
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [appsData, slotsData] = await Promise.all([
          api.getApplicants(domainFilter),
          api.getSchedule("ALL", false, domainFilter === "ALL" ? undefined : domainFilter),
        ]);
        if (mounted) {
          setApplications(appsData);
          setSlots(slotsData);
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
  }, [domainFilter]);

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
    if (stageCounts[app.stage] !== undefined) {
      stageCounts[app.stage]++;
    }
  });

  // True count of applications waiting for review
  const underReviewCount = stageCounts.FORM_FILLING;

  // Oldest unreviewed submissions (showing the oldest 5)
  const oldestUnreviewed = [...applications]
    .filter((a) => a.stage === "FORM_FILLING")
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

  const tilesConfig = [
    {
      stage: "FORM_FILLING" as ApplicationStage,
      label: "Under Review",
      count: stageCounts.FORM_FILLING,
      caption: "Waiting for Round 1 review",
    },
    {
      stage: "SHORTLISTED" as ApplicationStage,
      label: "Shortlisted",
      count: stageCounts.SHORTLISTED,
      caption: "Passed Round 1",
    },
    {
      stage: "SLOT_CHOOSING" as ApplicationStage,
      label: "Slot Choosing",
      count: stageCounts.SLOT_CHOOSING,
      caption: "Choosing an interview slot",
    },
    {
      stage: "INTERVIEW" as ApplicationStage,
      label: "Interview",
      count: stageCounts.INTERVIEW,
      caption: "Interview booked",
    },
    {
      stage: "SELECTED" as ApplicationStage,
      label: "Selected",
      count: stageCounts.SELECTED,
      caption: "Selected",
    },
    {
      stage: "REJECTED" as ApplicationStage,
      label: "Rejected",
      count: stageCounts.REJECTED,
      caption: "Not taken forward",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {/* Front Page Headline */}
      <section style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "1.1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
          <span className="kicker">
            ✦ TODAY AT A GLANCE ✦
          </span>
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--ink-soft)" }}>
            <Num>{todayDateString}</Num> · IST
          </span>
        </div>

        <h1
          className="headline"
          style={{
            fontSize: "clamp(2rem, 3.4vw, 3rem)",
            margin: "0.25rem 0",
            letterSpacing: "-0.01em",
          }}
        >
          {divisionHeaderLabel}: <Num>{applications.length}</Num> APPLICATIONS
        </h1>

        <p className="deck" style={{ maxWidth: "850px", marginTop: "0.4rem" }}>
          {deckText}
        </p>
      </section>

      {error && (
        <div style={{ padding: "0.75rem 1rem", border: "2px solid var(--stamp)", backgroundColor: "rgba(139, 30, 30, 0.08)", color: "var(--stamp)" }}>
          <strong>✦ Notice:</strong> {error}
        </div>
      )}

      {/* Stage Stat Tiles Grid */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 style={{ fontFamily: "var(--font-label)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--ink)" }}>
            APPLICATIONS BY STAGE
          </h2>
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", color: "var(--ink-soft)" }}>
            <Num>{applications.length}</Num> in total
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {tilesConfig.map((tile) => (
            <Link
              key={tile.stage}
              href={`/applicants?stage=${tile.stage}`}
              className="stat-tile-link"
            >
              <div>
                <div style={{ marginBottom: "0.5rem" }}>
                  <StageStamp stage={tile.stage} size="sm" />
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-headline)",
                    fontSize: "2.4rem",
                    lineHeight: 1,
                    color: "var(--ink)",
                    margin: "0.25rem 0",
                  }}
                >
                  <Num>{loading ? "..." : tile.count}</Num>
                </div>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--ink-soft)",
                  marginTop: "0.5rem",
                  borderTop: "1px dotted var(--ink-soft)",
                  paddingTop: "0.35rem",
                }}
              >
                {tile.caption}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Two-Column Midsection: Waiting for Review & Today's Schedule */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "1.5rem",
          marginTop: "0.25rem",
        }}
      >
        {/* Column 1: Waiting for Review */}
        <div style={{ border: "1px solid var(--ink)", padding: "1.25rem", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--ink)", paddingBottom: "0.5rem", marginBottom: "0.75rem" }}>
            <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.35rem", textTransform: "uppercase", letterSpacing: "0.02em" }}>
              WAITING FOR YOUR REVIEW
            </h3>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.8rem", color: "var(--stamp)", fontWeight: 700 }}>
              <Num>{underReviewCount}</Num> waiting
            </span>
          </div>

          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.92rem", color: "var(--ink-soft)", marginBottom: "0.75rem" }}>
            Oldest applications first. Showing the oldest <Num>{Math.min(5, oldestUnreviewed.length)}</Num>.
          </p>

          {loading ? (
            <p style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>Loading applications...</p>
          ) : oldestUnreviewed.length === 0 ? (
            <div style={{ padding: "1.5rem 0", textAlign: "center", fontStyle: "italic", color: "var(--ink-soft)" }}>
              ✦ No pending applications waiting for review.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {oldestUnreviewed.map((app) => (
                <div
                  key={app.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0.65rem",
                    border: "1px solid rgba(28, 22, 19, 0.2)",
                    backgroundColor: "rgba(28, 22, 19, 0.02)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>
                      {app.user.name}{" "}
                      <span style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", fontWeight: 600, color: "var(--ink-soft)" }}>
                        (<Num>{app.user.regNumber}</Num>)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-soft)", fontFamily: "var(--font-label)", textTransform: "uppercase" }}>
                      {DOMAIN_LABELS[app.domain]} · Submitted: <Num>{formatDate(app.submittedAt || "", true)}</Num>
                    </div>
                  </div>
                  <Link
                    href={`/applicants/${app.id}`}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem", textDecoration: "none" }}
                  >
                    Open Review →
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "auto", paddingTop: "1rem", textAlign: "right" }}>
            <Link
              href="/applicants?stage=FORM_FILLING"
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--ink)",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              View all <Num>{underReviewCount}</Num> →
            </Link>
          </div>
        </div>

        {/* Column 2: Today's Schedule & Quick Links */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Today's Interviews */}
          <div style={{ border: "1px solid var(--ink)", padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--ink)", paddingBottom: "0.5rem", marginBottom: "0.75rem" }}>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.35rem", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                INTERVIEWS TODAY
              </h3>
              <span style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", color: "var(--ink-soft)", fontWeight: 600 }}>
                <Num>{todayInterviews.length}</Num> Scheduled
              </span>
            </div>

            {loading ? (
              <p style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>Checking interview schedule...</p>
            ) : todayInterviews.length === 0 ? (
              <p style={{ fontStyle: "italic", color: "var(--ink-soft)", fontSize: "0.95rem" }}>
                ✦ No candidate interviews scheduled for today.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {todayInterviews.slice(0, 4).map((item, idx) => {
                  const timeFormatted = formatTime(item.startTime);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: "0.5rem 0.65rem",
                        border: "1px solid rgba(28, 22, 19, 0.2)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <strong><Num>{timeFormatted}</Num></strong> —{" "}
                        <span>{item.booking?.application?.user?.name || "Candidate"}</span>
                        {isRoot && item.slot.domain && (
                          <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginLeft: "0.4rem", fontFamily: "var(--font-label)" }}>
                            [{DOMAIN_LABELS[item.slot.domain]}]
                          </span>
                        )}
                      </div>
                      {item.slot.meetingLink && (
                        <a
                          href={item.slot.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="stamp-btn"
                          style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem", textDecoration: "none" }}
                        >
                          Join Call
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: "0.75rem", textAlign: "right" }}>
              <Link
                href="/interviews"
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.78rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--ink)",
                  fontWeight: 700,
                  textDecoration: "underline",
                }}
              >
                Open Interview Ledger →
              </Link>
            </div>
          </div>

          {/* Quick Links Card */}
          <div style={{ border: "1px solid var(--ink)", padding: "1.25rem", backgroundColor: "rgba(28, 22, 19, 0.02)" }}>
            <h3 style={{ fontFamily: "var(--font-label)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.75rem", borderBottom: "1px solid var(--ink)", paddingBottom: "0.35rem" }}>
              QUICK LINKS
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <Link href="/applicants" className="ink-btn-secondary" style={{ textAlign: "center", textDecoration: "none", fontSize: "0.78rem" }}>
                Applicant Listings
              </Link>
              <Link href="/slots" className="ink-btn-secondary" style={{ textAlign: "center", textDecoration: "none", fontSize: "0.78rem" }}>
                Slot Planner
              </Link>
              <Link href="/form-builder" className="ink-btn-secondary" style={{ textAlign: "center", textDecoration: "none", fontSize: "0.78rem" }}>
                Question Desk
              </Link>
              {isRoot && (
                <Link href="/team" className="ink-btn-secondary" style={{ textAlign: "center", textDecoration: "none", fontSize: "0.78rem" }}>
                  The Masthead (Team)
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
