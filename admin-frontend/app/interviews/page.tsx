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
import { Slot, Booking, DomainEnum, DOMAINS, DOMAIN_LABELS, DOMAIN_SHORT_LABELS } from "@/lib/types";
import { formatTime, formatDate, TIMEZONE } from "@/lib/config";

type LedgerTab = "upcoming" | "past" | "all";

interface InterviewRowData {
  slot: Slot;
  booking: Booking;
  applicationId: string;
  candidateName: string;
  regNumber: string;
  domain: DomainEnum;
  startTime: string;
  endTime: string;
  meetingLink: string;
  review2Marks?: number | null;
  review2Comments?: string | null;
}

export default function InterviewsPage() {
  return (
    <AuthGuard>
      <AdminShell>
        <InterviewLedgerContent />
      </AdminShell>
    </AuthGuard>
  );
}

function InterviewLedgerContent() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isRoot = user?.role === "ROOT_ADMIN";
  const userDomain = user?.domain;

  const [activeTab, setActiveTab] = useState<LedgerTab>("upcoming");
  const [selectedDomain, setSelectedDomain] = useState<string>(isRoot ? "ALL" : userDomain || "TECHNICAL");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Interview marks panel state
  const [openMarksAppId, setOpenMarksAppId] = useState<string | null>(null);
  const [marksValue, setMarksValue] = useState<number>(0);
  const [commentsValue, setCommentsValue] = useState<string>("");
  const [savingMarks, setSavingMarks] = useState<boolean>(false);

  const toggleMarksPanel = (row: InterviewRowData) => {
    if (openMarksAppId === row.applicationId) {
      setOpenMarksAppId(null);
    } else {
      setOpenMarksAppId(row.applicationId);
      setMarksValue(row.review2Marks ?? 0);
      setCommentsValue(row.review2Comments ?? "");
    }
  };

  const handleSaveMarks = async (applicationId: string) => {
    setSavingMarks(true);
    try {
      await api.updateReview(applicationId, {
        review2Marks: marksValue,
        review2Comments: commentsValue,
      });
      showToast("Interview marks saved.", "success");
      setOpenMarksAppId(null);
      await loadSchedule();
    } catch (err: any) {
      const errMsg = err?.message || "";
      showToast(errMsg || "Failed to save interview marks.", "error");
    } finally {
      setSavingMarks(false);
    }
  };

  useEffect(() => {
    document.title = "Interview Ledger · The TAM Times Admin";
  }, []);

  useEffect(() => {
    if (!isRoot && userDomain) {
      setSelectedDomain(userDomain);
    }
  }, [isRoot, userDomain]);

  // Load schedule
  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const adminId = isRoot ? "ALL" : (user?.id || "ALL");
      const domainParam = isRoot ? (selectedDomain === "ALL" ? undefined : selectedDomain) : (userDomain || undefined);
      // Fetch only slots that have bookings (all=false)
      const data = await api.getSchedule(adminId, false, domainParam);
      setSlots(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load interview ledger.");
    } finally {
      setLoading(false);
    }
  }, [isRoot, user?.id, userDomain, selectedDomain]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Flatten slots into interview rows
  const allRows: InterviewRowData[] = useMemo(() => {
    const rows: InterviewRowData[] = [];
    slots.forEach((s) => {
      (s.bookings || []).forEach((b) => {
        const app = b.application;
        const candidateUser = app?.user;
        rows.push({
          slot: s,
          booking: b,
          applicationId: b.applicationId || app?.id || "",
          candidateName: candidateUser?.name || "Candidate",
          regNumber: candidateUser?.regNumber || "—",
          domain: app?.domain || s.domain || "TECHNICAL",
          startTime: s.startTime,
          endTime: s.endTime,
          meetingLink: s.meetingLink || "https://meet.google.com/tam-general",
          review2Marks: app?.review2Marks,
          review2Comments: app?.review2Comments,
        });
      });
    });

    // Sort chronologically
    return rows.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [slots]);

  // Today count helper in IST
  const todayCount = useMemo(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const nowParts = formatter.formatToParts(now);
    const nowStr = `${nowParts.find((p) => p.type === "year")?.value}-${nowParts.find((p) => p.type === "month")?.value}-${nowParts.find((p) => p.type === "day")?.value}`;

    return allRows.filter((r) => {
      const d = new Date(r.startTime);
      const dParts = formatter.formatToParts(d);
      const dStr = `${dParts.find((p) => p.type === "year")?.value}-${dParts.find((p) => p.type === "month")?.value}-${dParts.find((p) => p.type === "day")?.value}`;
      return dStr === nowStr;
    }).length;
  }, [allRows]);

  // Filter rows by active tab
  const filteredRows = useMemo(() => {
    const nowMs = Date.now();
    if (activeTab === "upcoming") {
      return allRows.filter((r) => new Date(r.endTime).getTime() >= nowMs);
    }
    if (activeTab === "past") {
      // Show most recent past first
      return allRows
        .filter((r) => new Date(r.endTime).getTime() < nowMs)
        .reverse();
    }
    return allRows;
  }, [allRows, activeTab]);

  // Group filtered rows by day string ("Today", "Tomorrow", "Thu 5 Nov 2026")
  const groupedByDay = useMemo(() => {
    const groups: { dayLabel: string; rows: InterviewRowData[] }[] = [];
    const map: Record<string, InterviewRowData[]> = {};

    filteredRows.forEach((r) => {
      const d = new Date(r.startTime);
      // Use relative label (Today, Tomorrow, or formatted day)
      const dayLabel = formatDate(d, true);

      if (!map[dayLabel]) {
        map[dayLabel] = [];
        groups.push({ dayLabel, rows: map[dayLabel] });
      }
      map[dayLabel].push(r);
    });

    return groups;
  }, [filteredRows]);

  // Copy meeting link handler
  const handleCopyLink = async (id: string, link: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      }
      setCopiedId(id);
      showToast("Meeting link copied to clipboard.", "info");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast("Unable to copy link.", "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header section */}
      <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span className="kicker">✦ EDITORIAL APPOINTMENTS ✦</span>
            <h1 className="headline" style={{ fontSize: "2.4rem", margin: "0.25rem 0 0.4rem 0" }}>
              Interview Ledger
            </h1>
            <p className="deck" style={{ margin: 0, maxWidth: "680px" }}>
              Scheduled examination calls and technical conversations across candidate dossiers.
            </p>
          </div>

          {/* Today Count Badge */}
          <div
            style={{
              padding: "0.6rem 1rem",
              border: "2px solid var(--ink)",
              backgroundColor: "rgba(28, 22, 19, 0.03)",
              textAlign: "right",
            }}
          >
            <span style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-soft)" }}>
              Today's Schedule
            </span>
            <span style={{ fontFamily: "var(--font-headline)", fontSize: "1.7rem", color: todayCount > 0 ? "var(--stamp)" : "var(--ink)" }}>
              <Num>{todayCount}</Num> {todayCount === 1 ? "interview" : "interviews"} today
            </span>
          </div>
        </div>

        {/* Division Filter for Root Admin */}
        {isRoot && (
          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>
              Division:
            </span>
            <button
              type="button"
              onClick={() => setSelectedDomain("ALL")}
              className={selectedDomain === "ALL" ? "ink-btn" : "ink-btn-secondary"}
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            >
              All Divisions
            </button>
            {DOMAINS.map((dom) => (
              <button
                key={dom}
                type="button"
                onClick={() => setSelectedDomain(dom)}
                className={selectedDomain === dom ? "ink-btn" : "ink-btn-secondary"}
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {DOMAIN_LABELS[dom]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--ink)",
          gap: "1.5rem",
          fontSize: "0.85rem",
          fontFamily: "var(--font-label)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {(["upcoming", "past", "all"] as LedgerTab[]).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === "upcoming" ? "Upcoming" : tab === "past" ? "Past" : "All Booked";
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "3px solid var(--stamp)" : "3px solid transparent",
                padding: "0.5rem 0.25rem",
                cursor: "pointer",
                fontWeight: isActive ? 700 : 500,
                color: isActive ? "var(--stamp)" : "var(--ink)",
                marginBottom: "-1px",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Content State */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", margin: "1rem 0" }}>
          <Skeleton height="70px" />
          <Skeleton height="70px" />
          <Skeleton height="70px" />
        </div>
      ) : error ? (
        <EmptyState
          title="Error loading ledger"
          description={error}
          actionLabel="Retry"
          onClear={loadSchedule}
        />
      ) : groupedByDay.length === 0 ? (
        <EmptyState
          title={activeTab === "upcoming" ? "No upcoming interviews" : "No interview records"}
          description={
            activeTab === "upcoming"
              ? "There are no interview appointments booked in this timeframe."
              : "No candidates have booked interview appointments in this view."
          }
          actionLabel="Refresh ledger"
          onClear={loadSchedule}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {groupedByDay.map(({ dayLabel, rows }) => (
            <div key={dayLabel} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {/* Day Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.6rem",
                  borderBottom: "1px dashed var(--ink)",
                  paddingBottom: "0.3rem",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-headline)",
                    fontSize: "1.4rem",
                    margin: 0,
                    color: dayLabel === "Today" ? "var(--stamp)" : "var(--ink)",
                  }}
                >
                  {dayLabel}
                </h3>
                <span
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    color: "var(--ink-soft)",
                  }}
                >
                  — <Num>{rows.length}</Num> {rows.length === 1 ? "appointment" : "appointments"}
                </span>
              </div>

              {/* Rows for this day */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {rows.map((row) => {
                  const startTimeStr = formatTime(row.startTime).replace(" IST", "");
                  const endTimeStr = formatTime(row.endTime);
                  const isCurrent = copiedId === row.booking.id;
                  const hasMarks = row.review2Marks !== null && row.review2Marks !== undefined;
                  const isPanelOpen = openMarksAppId === row.applicationId;

                  return (
                    <div
                      key={row.booking.id}
                      className="paper"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        padding: "0.85rem 1.1rem",
                        border: "1px solid var(--ink)",
                        backgroundColor: "rgba(28, 22, 19, 0.015)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "1rem",
                          width: "100%",
                        }}
                      >
                        {/* Left: Time and Candidate info */}
                        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
                          {/* Time block */}
                          <div
                            style={{
                              minWidth: "160px",
                              fontFamily: "var(--font-label)",
                              fontWeight: 700,
                              fontSize: "0.95rem",
                              color: "var(--ink)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <Num>{startTimeStr}</Num> – <Num>{endTimeStr}</Num>
                          </div>

                          {/* Candidate Name & Reg */}
                          <div>
                            <div style={{ fontFamily: "var(--font-headline)", fontSize: "1.25rem", lineHeight: 1.1 }}>
                              {row.candidateName}
                            </div>
                            <div style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                              Reg: <strong><Num>{row.regNumber}</Num></strong>
                            </div>
                          </div>

                          {/* Division Badge (Shown if Root viewing multiple divisions) */}
                          {isRoot && selectedDomain === "ALL" && (
                            <span
                              title={DOMAIN_LABELS[row.domain]}
                              style={{
                                fontFamily: "var(--font-label)",
                                fontSize: "0.72rem",
                                textTransform: "uppercase",
                                padding: "0.15rem 0.45rem",
                                border: "1px solid var(--ink)",
                                backgroundColor: "rgba(28, 22, 19, 0.04)",
                                letterSpacing: "0.06em",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {DOMAIN_SHORT_LABELS[row.domain]}
                            </span>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          {/* Interview Marks Control */}
                          {row.applicationId && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              {hasMarks && (
                                <span style={{ fontFamily: "var(--font-label)", fontSize: "0.82rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                                  Marks: <Num>{row.review2Marks}</Num> / 10
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleMarksPanel(row)}
                                className={hasMarks ? "ink-btn-secondary" : "stamp-btn"}
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.35rem 0.65rem",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isPanelOpen ? "Close panel" : hasMarks ? "Edit marks" : "Add marks"}
                              </button>
                            </div>
                          )}

                          <a
                            href={row.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="stamp-btn"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.35rem 0.65rem",
                              textDecoration: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Join Call
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(row.booking.id, row.meetingLink)}
                            className="ink-btn-secondary"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.35rem 0.65rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isCurrent ? "Copied!" : "Copy Link"}
                          </button>
                          {row.applicationId && (
                            <Link
                              href={`/applicants/${row.applicationId}`}
                              className="ink-btn"
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.35rem 0.65rem",
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Open Review →
                            </Link>
                          )}
                        </div>
                      </div>

                      {/* Inline Marks Panel */}
                      {isPanelOpen && (
                        <div
                          style={{
                            width: "100%",
                            marginTop: "0.75rem",
                            padding: "0.85rem 1rem",
                            borderTop: "1px dashed var(--ink)",
                            backgroundColor: "rgba(28, 22, 19, 0.02)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.6rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                            <span className="kicker" style={{ color: "var(--stamp)", margin: 0 }}>
                              ✦ INTERVIEW EXAMINATION SCORE (0 TO 10) ✦
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                              Candidate: <strong>{row.candidateName}</strong>
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                            {/* Stepper */}
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", backgroundColor: "var(--paper)", padding: "0.25rem 0.5rem", border: "1px solid var(--ink)" }}>
                              <button
                                type="button"
                                onClick={() => setMarksValue((m) => Math.max(0, m - 1))}
                                disabled={marksValue <= 0 || savingMarks}
                                style={{ width: "24px", height: "24px", border: "1px solid var(--ink)", background: "transparent", cursor: "pointer", fontWeight: 700 }}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                value={marksValue}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setMarksValue(isNaN(v) ? 0 : Math.max(0, Math.min(10, v)));
                                }}
                                style={{ width: "36px", textAlign: "center", border: "none", background: "transparent", fontFamily: "var(--font-label)", fontWeight: 700, fontSize: "1.1rem" }}
                              />
                              <span style={{ fontFamily: "var(--font-label)", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                                out of 10
                              </span>
                              <button
                                type="button"
                                onClick={() => setMarksValue((m) => Math.min(10, m + 1))}
                                disabled={marksValue >= 10 || savingMarks}
                                style={{ width: "24px", height: "24px", border: "1px solid var(--ink)", background: "transparent", cursor: "pointer", fontWeight: 700 }}
                              >
                                +
                              </button>
                            </div>

                            {/* Comments */}
                            <div style={{ flex: 1, minWidth: "220px" }}>
                              <input
                                type="text"
                                placeholder="Interview feedback & comments..."
                                value={commentsValue}
                                onChange={(e) => setCommentsValue(e.target.value)}
                                disabled={savingMarks}
                                className="newspaper-input"
                                style={{ width: "100%", padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
                              />
                            </div>

                            {/* Actions */}
                            <div style={{ display: "flex", gap: "0.4rem" }}>
                              <button
                                type="button"
                                onClick={() => handleSaveMarks(row.applicationId)}
                                disabled={savingMarks}
                                className="stamp-btn"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.85rem" }}
                              >
                                {savingMarks ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setOpenMarksAppId(null)}
                                disabled={savingMarks}
                                className="ink-btn-secondary"
                                style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem" }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
