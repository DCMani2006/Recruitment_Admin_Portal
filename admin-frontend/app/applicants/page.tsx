"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { StageStamp } from "@/components/StageStamp";
import { Num } from "@/components/Num";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/TickerToast";
import { api } from "@/lib/client";
import {
  Application,
  DomainEnum,
  ApplicationStage,
  DOMAINS,
  DOMAIN_LABELS,
  DOMAIN_SHORT_LABELS,
  STAGE_LABELS,
  getDisplayStage,
} from "@/lib/types";
import { formatDate, formatDateTime, formatTime, REVIEW2_MAX } from "@/lib/config";

export type DecisionStatusKey =
  | "ALL"
  | "WAITING_REVIEW"
  | "MARKED_SHORTLIST"
  | "MARKED_REJECT";

export const DECISION_STATUS_FILTERS: { key: DecisionStatusKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "WAITING_REVIEW", label: "Waiting for review" },
  { key: "MARKED_SHORTLIST", label: "Marked to shortlist" },
  { key: "MARKED_REJECT", label: "Marked to reject" },
];

export function getApplicationDecisionStatus(app: Application): { key: DecisionStatusKey; label: string } {
  if (
    app.round1Decision === "SHORTLIST" ||
    app.stage === "SHORTLISTED" ||
    app.stage === "SLOT_CHOOSING" ||
    app.stage === "INTERVIEW" ||
    app.stage === "SELECTED"
  ) {
    if (app.round1EmailSentAt) {
      return { key: "MARKED_SHORTLIST", label: "Notified (Shortlisted)" };
    }
    return { key: "MARKED_SHORTLIST", label: "Marked to Shortlist" };
  }
  if (app.round1Decision === "REJECT" || app.stage === "REJECTED") {
    if (app.round1EmailSentAt) {
      return { key: "MARKED_REJECT", label: "Notified (Not Taken Forward)" };
    }
    return { key: "MARKED_REJECT", label: "Marked to Reject" };
  }
  return { key: "WAITING_REVIEW", label: "Waiting for review" };
}

function sanitizeForCSV(val: any): string {
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  // Protect against CSV formula injection
  if (str.startsWith("=") || str.startsWith("+") || str.startsWith("-") || str.startsWith("@")) {
    str = `'${str}`;
  }
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface SendFailure {
  applicationId: string;
  candidateName?: string;
  reason: string;
}

export default function ApplicantsPage() {
  return (
    <AuthGuard>
      <AdminShell>
        <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
          <ApplicantsListContent />
        </Suspense>
      </AdminShell>
    </AuthGuard>
  );
}

function ApplicantsListContent() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isRoot = user?.role === "ROOT_ADMIN";
  const userDomain = user?.domain;

  // URL State
  const initialDomain = searchParams.get("domain") || (isRoot ? "ALL" : userDomain || "ALL");
  const rawStatus = searchParams.get("status") || searchParams.get("stage") || "ALL";
  const mapParamToStatus = (param: string): DecisionStatusKey => {
    if (param === "SHORTLIST" || param === "SHORTLISTED" || param === "MARKED_SHORTLIST") return "MARKED_SHORTLIST";
    if (param === "REJECT" || param === "REJECTED" || param === "MARKED_REJECT") return "MARKED_REJECT";
    if (param === "WAITING_REVIEW" || param === "FORM_FILLING") return "WAITING_REVIEW";
    return "ALL";
  };

  const initialStatus = mapParamToStatus(rawStatus);
  const initialQ = searchParams.get("q") || "";
  const initialSort = searchParams.get("sort") || "oldest";
  const initialPage = parseInt(searchParams.get("page") || "1", 10);

  const [selectedDomain, setSelectedDomain] = useState<string>(initialDomain);
  const [selectedStatus, setSelectedStatus] = useState<DecisionStatusKey>(initialStatus);
  const [searchQuery, setSearchQuery] = useState<string>(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initialQ);
  const [sortOrder, setSortOrder] = useState<string>(initialSort);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Email Dispatch Modal State
  const [modalDecision, setModalDecision] = useState<"SHORTLIST" | "REJECT" | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [confirmedChecked, setConfirmedChecked] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{
    sent: number;
    total: number;
    remaining: number;
    failures: SendFailure[];
  }>({
    sent: 0,
    total: 0,
    remaining: 0,
    failures: [],
  });

  useEffect(() => {
    document.title = "Applicant Listings · The TAM Times Admin";
  }, []);

  // Sync state if user is Domain Head (cannot switch domain)
  useEffect(() => {
    if (!isRoot && userDomain && selectedDomain !== userDomain) {
      setSelectedDomain(userDomain);
    }
  }, [isRoot, userDomain, selectedDomain]);

  // Debounce search by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedDomain && selectedDomain !== "ALL") params.set("domain", selectedDomain);
    if (selectedStatus && selectedStatus !== "ALL") params.set("status", selectedStatus);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (sortOrder && sortOrder !== "oldest") params.set("sort", sortOrder);
    if (currentPage > 1) params.set("page", String(currentPage));

    const queryStr = params.toString();
    const targetUrl = `/applicants${queryStr ? `?${queryStr}` : ""}`;
    window.history.replaceState(null, "", targetUrl);
  }, [selectedDomain, selectedStatus, debouncedQuery, sortOrder, currentPage]);

  // Fetch applications
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getApplicants(isRoot ? "ALL" : userDomain || "ALL");
      setApplications(data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load applicant listings.");
    } finally {
      setLoading(false);
    }
  }, [isRoot, userDomain]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Domain filtered pool
  const domainPool = useMemo(() => {
    if (!selectedDomain || selectedDomain === "ALL") return applications;
    return applications.filter((a) => a.domain === selectedDomain);
  }, [applications, selectedDomain]);

  // Target domain for email actions (if ALL selected by Root, default to first domain)
  const dispatchDomain = useMemo<DomainEnum>(() => {
    if (selectedDomain && selectedDomain !== "ALL") {
      return selectedDomain as DomainEnum;
    }
    return (userDomain as DomainEnum) || "TECHNICAL";
  }, [selectedDomain, userDomain]);

  // Unmailed Candidates ready for email dispatch in current active domain pool
  const unmailedShortlistCandidates = useMemo(() => {
    return domainPool.filter(
      (a) =>
        a.submittedAt &&
        (a.stage === "FORM_FILLING" || a.stage === "SHORTLISTED") &&
        a.round1Decision === "SHORTLIST" &&
        !a.round1EmailSentAt
    );
  }, [domainPool]);

  const unmailedRejectCandidates = useMemo(() => {
    return domainPool.filter(
      (a) =>
        a.submittedAt &&
        (a.stage === "FORM_FILLING" || a.stage === "REJECTED") &&
        a.round1Decision === "REJECT" &&
        !a.round1EmailSentAt
    );
  }, [domainPool]);

  // Total shortlisted and rejected counts in the current domain pool
  const totalShortlistedCount = useMemo(() => {
    return domainPool.filter(
      (a) =>
        a.round1Decision === "SHORTLIST" ||
        a.stage === "SHORTLISTED" ||
        a.stage === "SLOT_CHOOSING" ||
        a.stage === "INTERVIEW" ||
        a.stage === "SELECTED"
    ).length;
  }, [domainPool]);

  const totalRejectedCount = useMemo(() => {
    return domainPool.filter(
      (a) => a.round1Decision === "REJECT" || a.stage === "REJECTED"
    ).length;
  }, [domainPool]);

  const waitingReviewCount = useMemo(() => {
    return domainPool.filter(
      (a) => !a.round1Decision && a.stage === "FORM_FILLING" && !a.round1EmailSentAt
    ).length;
  }, [domainPool]);

  const sentEmailsCount = useMemo(() => {
    return domainPool.filter((a) => Boolean(a.round1EmailSentAt)).length;
  }, [domainPool]);

  // Live decision-aware status counts based on current domain pool
  const statusCounts = useMemo(() => {
    const counts: Record<DecisionStatusKey, number> = {
      ALL: domainPool.length,
      WAITING_REVIEW: 0,
      MARKED_SHORTLIST: 0,
      MARKED_REJECT: 0,
    };
    domainPool.forEach((a) => {
      const st = getApplicationDecisionStatus(a).key;
      if (counts[st] !== undefined) counts[st]++;
    });
    return counts;
  }, [domainPool]);

  // Filtered & Sorted applications
  const filteredAndSorted = useMemo(() => {
    let result = [...domainPool];

    // Filter by decision status
    if (selectedStatus && selectedStatus !== "ALL") {
      result = result.filter((a) => getApplicationDecisionStatus(a).key === selectedStatus);
    }

    // Filter search query (name, regNumber, email)
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter((a) => {
        const nameMatch = a.user?.name?.toLowerCase().includes(q);
        const regMatch = a.user?.regNumber?.toLowerCase().includes(q);
        const emailMatch = a.user?.email?.toLowerCase().includes(q);
        return nameMatch || regMatch || emailMatch;
      });
    }

    // Sort order
    result.sort((a, b) => {
      const timeA = new Date(a.submittedAt || 0).getTime();
      const timeB = new Date(b.submittedAt || 0).getTime();
      const marksA = a.review1Marks ?? -1;
      const marksB = b.review1Marks ?? -1;

      switch (sortOrder) {
        case "newest":
          return timeB - timeA;
        case "regNumber":
          return (a.user?.regNumber || "").localeCompare(b.user?.regNumber || "");
        case "marksHigh":
          return marksB - marksA;
        case "marksLow":
          return marksA - marksB;
        case "oldest":
        default:
          return timeA - timeB;
      }
    });

    return result;
  }, [domainPool, selectedStatus, debouncedQuery, sortOrder]);

  // Save current filtered list IDs to sessionStorage for Previous/Next navigation in review desk
  useEffect(() => {
    try {
      const ids = filteredAndSorted.map((a) => a.id);
      sessionStorage.setItem("tam_applicant_ids", JSON.stringify(ids));
    } catch {}
  }, [filteredAndSorted]);

  // Move candidate decision between Shortlist and Reject before email dispatch
  const handleMoveDecision = async (
    candidate: Application,
    targetDecision: "SHORTLIST" | "REJECT"
  ) => {
    if (movingId) return;
    setMovingId(candidate.id);

    // Optimistic update so list, badges, and counters shift immediately
    setApplications((prev) =>
      prev.map((a) =>
        a.id === candidate.id
          ? {
              ...a,
              round1Decision: targetDecision,
              review1Passed: targetDecision === "SHORTLIST",
              round1DecisionAt: new Date().toISOString(),
            }
          : a
      )
    );

    try {
      const defaultComment =
        targetDecision === "REJECT" && (!candidate.review1Comments || candidate.review1Comments.trim().length < 10)
          ? "Decision adjusted prior to email dispatch."
          : (candidate.review1Comments || undefined);

      await api.updateReview(candidate.id, {
        round1Decision: targetDecision,
        review1Passed: targetDecision === "SHORTLIST",
        review1Comments: defaultComment,
      });

      showToast(
        `Moved ${candidate.user?.name || "candidate"} to ${
          targetDecision === "SHORTLIST" ? "Shortlist" : "Reject"
        } list.`,
        "success"
      );
      await fetchApplications();
    } catch (err: any) {
      const errMsg = err?.message || "";
      if (err?.code === "DECISION_LOCKED" || errMsg.includes("DECISION_LOCKED")) {
        showToast("Decision is locked because emails have already been dispatched.", "error");
      } else {
        showToast(errMsg || "Failed to update decision.", "error");
      }
      await fetchApplications();
    } finally {
      setMovingId(null);
    }
  };

  // Open the Send Confirmation Modal
  const openSendModal = async (decision: "SHORTLIST" | "REJECT") => {
    const targetCandidates = decision === "SHORTLIST" ? unmailedShortlistCandidates : unmailedRejectCandidates;
    setModalDecision(decision);
    setConfirmedChecked(false);
    setSendProgress({
      sent: 0,
      total: targetCandidates.length,
      remaining: targetCandidates.length,
      failures: [],
    });
    setLoadingTemplate(true);

    try {
      const tmpl = await api.getRound1Templates(decision);
      setEmailSubject(tmpl?.subject || "");
      setEmailBody(tmpl?.body || "");
    } catch {
      setEmailSubject(
        decision === "SHORTLIST"
          ? `TAM Recruitment: Shortlisted for Interview - {{division}}`
          : `TAM Recruitment: Application Status Update - {{division}}`
      );
      setEmailBody(
        decision === "SHORTLIST"
          ? `Dear {{name}},\n\nCongratulations! We are pleased to invite you to a 15-minute online interview for the {{division}} team.\n\nPlease sign in to {{site_url}} to choose your preferred interview slot at your earliest convenience.\n\nBest regards,\nTAM Recruitment Team`
          : `Dear {{name}},\n\nThank you for applying to the {{division}} team at The AI & ML Club, IIT Roorkee. We enjoyed reviewing your dossier.\n\nAfter careful evaluation, we are unable to take your application forward to the interview stage this recruitment cycle. We encourage you to participate in our open workshops and apply again next term.\n\nWarm regards,\nTAM Recruitment Team`
      );
    } finally {
      setLoadingTemplate(false);
    }
  };

  const closeSendModal = () => {
    if (isSending) return;
    setModalDecision(null);
    setSendProgress({ sent: 0, total: 0, remaining: 0, failures: [] });
  };

  // Chunked batch email sending execution
  const executeSendEmails = async () => {
    if (!modalDecision) return;
    setIsSending(true);

    const targetCandidates =
      modalDecision === "SHORTLIST" ? unmailedShortlistCandidates : unmailedRejectCandidates;
    const initialTotal = targetCandidates.length;

    let currentSent = sendProgress.sent;
    let currentFailures: SendFailure[] = [...sendProgress.failures];
    let remaining = initialTotal - currentSent;

    try {
      const distinctDomains = Array.from(new Set(targetCandidates.map((c) => c.domain)));
      for (const dom of distinctDomains) {
        let domainRemaining = targetCandidates.filter((c) => c.domain === dom).length;
        while (domainRemaining > 0) {
          const batchRes = await api.sendRound1Emails({
            domain: dom,
            decision: modalDecision,
            subject: emailSubject,
            body: emailBody,
            limit: 20,
          });

          currentSent += batchRes.sent;
          if (batchRes.failed && batchRes.failed.length > 0) {
            batchRes.failed.forEach((f: any) => {
              const matchedApp = targetCandidates.find((c) => c.id === f.applicationId);
              currentFailures.push({
                applicationId: f.applicationId,
                candidateName: matchedApp?.user?.name || f.applicationId,
                reason: f.reason || "Dispatch failed",
              });
            });
          }

          domainRemaining = batchRes.remaining;

          setSendProgress({
            sent: currentSent,
            total: initialTotal,
            remaining: Math.max(0, initialTotal - currentSent),
            failures: currentFailures,
          });

          if (batchRes.processed === 0 || (batchRes.sent === 0 && batchRes.failed?.length > 0)) {
            break;
          }
        }
      }

      showToast(`Dispatched ${currentSent} of ${initialTotal} emails.`, "success");
      await fetchApplications();

      if (remaining === 0 && currentFailures.length === 0) {
        setModalDecision(null);
      }
    } catch (err: any) {
      showToast(err?.message || "Error occurred during email dispatch.", "error");
      await fetchApplications();
    } finally {
      setIsSending(false);
    }
  };

  // Pagination (25 per page)
  const pageSize = 25;
  const totalItems = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  const handleClearFilters = () => {
    setSelectedStatus("ALL");
    setSearchQuery("");
    setDebouncedQuery("");
    setSortOrder("oldest");
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    const divisionLabel =
      selectedDomain === "ALL"
        ? "All Divisions"
        : DOMAIN_LABELS[selectedDomain as DomainEnum] || selectedDomain;
    const headers = [
      "Name",
      "Registration Number",
      "Email",
      "Phone",
      "Division",
      "Stage",
      "Round 1 Decision",
      "Email Sent",
      "Submitted Date",
      "Round 1 Marks",
      "Round 1 Maximum",
      "Round 1 Comments",
      "Round 2 Marks",
      "Interview Date and Time",
    ];

    const rows = filteredAndSorted.map((app) => {
      const maxMarks =
        (app.user?.answers || [])
          .filter((a) => a.question && a.question.domain === app.domain)
          .reduce((sum, a) => sum + (a.question?.maxMarks || 0), 0) || 35;

      const interviewStr = app.booking?.slot ? formatDateTime(app.booking.slot.startTime) : "—";
      const r1Formatted =
        app.review1Marks !== null && app.review1Marks !== undefined
          ? `${app.review1Marks} / ${maxMarks}`
          : "Not scored";
      const r2Formatted =
        app.review2Marks !== null && app.review2Marks !== undefined
          ? `${app.review2Marks} / ${REVIEW2_MAX}`
          : "—";
      const r1CommentsFormatted = app.review1Comments || "—";
      const decisionStr = app.round1Decision || "Undecided";
      const emailSentStr = app.round1EmailSentAt ? formatDate(app.round1EmailSentAt) : "No";

      return [
        sanitizeForCSV(app.user?.name),
        sanitizeForCSV(app.user?.regNumber || "—"),
        sanitizeForCSV(app.user?.email || "—"),
        sanitizeForCSV(app.user?.phone || "—"),
        sanitizeForCSV(DOMAIN_LABELS[app.domain] || app.domain),
        sanitizeForCSV(STAGE_LABELS[app.stage] || app.stage),
        sanitizeForCSV(decisionStr),
        sanitizeForCSV(emailSentStr),
        sanitizeForCSV(formatDate(app.submittedAt || "")),
        sanitizeForCSV(r1Formatted),
        sanitizeForCSV(maxMarks),
        sanitizeForCSV(r1CommentsFormatted),
        sanitizeForCSV(r2Formatted),
        sanitizeForCSV(interviewStr),
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateFormatted = formatDate(new Date()).toLowerCase().replace(/\s+/g, "-");
    a.href = url;
    a.download = `tam-applicants-${divisionLabel.toLowerCase().replace(/\s+/g, "-")}-${dateFormatted}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const headlineDivision =
    isRoot && selectedDomain === "ALL"
      ? "ALL DIVISIONS"
      : DOMAIN_LABELS[selectedDomain as DomainEnum]?.toUpperCase() || selectedDomain;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <section style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.25rem",
          }}
        >
          <span className="kicker">✦ APPLICANT LISTINGS ✦</span>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredAndSorted.length === 0}
            className="ink-btn-secondary"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", fontWeight: 700 }}
          >
            Export CSV ({filteredAndSorted.length})
          </button>
        </div>

        <h1 className="headline" style={{ fontSize: "clamp(2rem, 3.2vw, 2.8rem)", margin: "0.25rem 0" }}>
          {headlineDivision}: <Num>{filteredAndSorted.length}</Num> APPLICATIONS
        </h1>

        <p className="deck">
          Review candidates, manage Round 1 shortlisted & rejected rosters, and dispatch decision emails.
        </p>
      </section>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: "0.85rem 1rem",
            border: "2px solid var(--stamp)",
            backgroundColor: "rgba(139, 30, 30, 0.08)",
            color: "var(--stamp)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            <strong>✦ Notice:</strong> {error}
          </span>
          <button
            type="button"
            onClick={fetchApplications}
            className="stamp-btn"
            style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
          >
            Retry Dispatch
          </button>
        </div>
      )}

      {/* Division Selector (Root only) */}
      {isRoot && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            borderBottom: "1px dashed var(--ink)",
            paddingBottom: "0.75rem",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 700,
              color: "var(--ink-soft)",
            }}
          >
            Division:
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedDomain("ALL");
              setCurrentPage(1);
            }}
            style={{
              padding: "0.3rem 0.65rem",
              fontFamily: "var(--font-label)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              border: "1px solid var(--ink)",
              backgroundColor: selectedDomain === "ALL" ? "var(--ink)" : "transparent",
              color: selectedDomain === "ALL" ? "var(--paper)" : "var(--ink)",
              cursor: "pointer",
            }}
          >
            All Divisions
          </button>
          {DOMAINS.map((dom) => (
            <button
              key={dom}
              type="button"
              onClick={() => {
                setSelectedDomain(dom);
                setCurrentPage(1);
              }}
              style={{
                padding: "0.3rem 0.65rem",
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                border: "1px solid var(--ink)",
                backgroundColor: selectedDomain === dom ? "var(--ink)" : "transparent",
                color: selectedDomain === dom ? "var(--paper)" : "var(--ink)",
                cursor: "pointer",
              }}
            >
              {DOMAIN_LABELS[dom]}
            </button>
          ))}
        </div>
      )}

      {/* ROUND 1 DECISIONS & EMAIL DISPATCH PANEL */}
      <section
        className="paper"
        style={{
          border: "2px solid var(--ink)",
          padding: "1.25rem",
          backgroundColor: "rgba(28, 22, 19, 0.02)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "0.75rem",
            borderBottom: "1px solid var(--ink)",
            paddingBottom: "0.75rem",
          }}
        >
          <div>
            <span className="kicker" style={{ marginBottom: "0.2rem" }}>
              ✦ ROUND 1 DECISION & DISPATCH PANEL ✦
            </span>
            <h2
              style={{
                fontFamily: "var(--font-headline)",
                fontSize: "1.35rem",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              {selectedDomain === "ALL"
                ? "All Divisions Desk"
                : (DOMAIN_LABELS[dispatchDomain as DomainEnum] || dispatchDomain) + " Division Desk"}
            </h2>
            <div style={{ fontSize: "0.82rem", color: "var(--ink-soft)", marginTop: "0.2rem" }}>
              View final candidate pools and dispatch batch decision notifications. Decisions remain movable until emails are dispatched.
            </div>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <div
              style={{
                border: "1px solid var(--ink)",
                padding: "0.4rem 0.75rem",
                backgroundColor: "var(--paper)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.65rem", fontFamily: "var(--font-label)", textTransform: "uppercase" }}>
                Shortlisted
              </div>
              <div style={{ fontSize: "1.3rem", fontFamily: "var(--font-headline)", fontWeight: 700, lineHeight: 1.1 }}>
                <Num>{totalShortlistedCount}</Num>
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)" }}>
                <Num>{unmailedShortlistCandidates.length}</Num> unmailed
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--ink)",
                padding: "0.4rem 0.75rem",
                backgroundColor: "var(--paper)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.65rem", fontFamily: "var(--font-label)", textTransform: "uppercase" }}>
                Rejected
              </div>
              <div
                style={{
                  fontSize: "1.3rem",
                  fontFamily: "var(--font-headline)",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  color: "var(--stamp)",
                }}
              >
                <Num>{totalRejectedCount}</Num>
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)" }}>
                <Num>{unmailedRejectCandidates.length}</Num> unmailed
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--ink)",
                padding: "0.4rem 0.75rem",
                backgroundColor: "var(--paper)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.65rem", fontFamily: "var(--font-label)", textTransform: "uppercase" }}>
                Waiting Review
              </div>
              <div style={{ fontSize: "1.3rem", fontFamily: "var(--font-headline)", fontWeight: 700, lineHeight: 1.1 }}>
                <Num>{waitingReviewCount}</Num>
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)" }}>
                undecided
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--ink)",
                padding: "0.4rem 0.75rem",
                backgroundColor: "var(--paper)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.65rem", fontFamily: "var(--font-label)", textTransform: "uppercase" }}>
                Sent Emails
              </div>
              <div style={{ fontSize: "1.3rem", fontFamily: "var(--font-headline)", fontWeight: 700, lineHeight: 1.1 }}>
                <Num>{sentEmailsCount}</Num>
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)" }}>
                dispatched
              </div>
            </div>
          </div>
        </div>

        {/* Panel Action Controls: View Options & Email Dispatch Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* View Filter Options */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
                color: "var(--ink-soft)",
              }}
            >
              View Roster:
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedStatus("MARKED_SHORTLIST");
                setCurrentPage(1);
              }}
              className="ink-btn-secondary"
              style={{
                fontSize: "0.75rem",
                padding: "0.3rem 0.65rem",
                fontWeight: selectedStatus === "MARKED_SHORTLIST" ? 700 : 500,
                backgroundColor: selectedStatus === "MARKED_SHORTLIST" ? "var(--ink)" : "var(--paper)",
                color: selectedStatus === "MARKED_SHORTLIST" ? "var(--paper)" : "var(--ink)",
              }}
            >
              View Final Shortlisted ({totalShortlistedCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedStatus("MARKED_REJECT");
                setCurrentPage(1);
              }}
              className="ink-btn-secondary"
              style={{
                fontSize: "0.75rem",
                padding: "0.3rem 0.65rem",
                fontWeight: selectedStatus === "MARKED_REJECT" ? 700 : 500,
                backgroundColor: selectedStatus === "MARKED_REJECT" ? "var(--ink)" : "var(--paper)",
                color: selectedStatus === "MARKED_REJECT" ? "var(--paper)" : "var(--ink)",
              }}
            >
              View Final Rejected ({totalRejectedCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedStatus("ALL");
                setCurrentPage(1);
              }}
              className="ink-btn-secondary"
              style={{
                fontSize: "0.75rem",
                padding: "0.3rem 0.65rem",
                fontWeight: selectedStatus === "ALL" ? 700 : 500,
                backgroundColor: selectedStatus === "ALL" ? "var(--ink)" : "var(--paper)",
                color: selectedStatus === "ALL" ? "var(--paper)" : "var(--ink)",
              }}
            >
              View All ({domainPool.length})
            </button>
          </div>

          {/* Email Dispatch Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => openSendModal("SHORTLIST")}
              disabled={unmailedShortlistCandidates.length === 0}
              className="stamp-btn"
              style={{
                fontSize: "0.78rem",
                padding: "0.4rem 0.9rem",
                opacity: unmailedShortlistCandidates.length === 0 ? 0.45 : 1,
                cursor: unmailedShortlistCandidates.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              ✉ Send All Shortlist Emails ({unmailedShortlistCandidates.length})
            </button>

            <button
              type="button"
              onClick={() => openSendModal("REJECT")}
              disabled={unmailedRejectCandidates.length === 0}
              className="ink-btn-secondary"
              style={{
                fontSize: "0.78rem",
                padding: "0.4rem 0.9rem",
                color: "var(--stamp)",
                borderColor: "var(--stamp)",
                fontWeight: 700,
                opacity: unmailedRejectCandidates.length === 0 ? 0.45 : 1,
                cursor: unmailedRejectCandidates.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              ✉ Send All Rejection Emails ({unmailedRejectCandidates.length})
            </button>
          </div>
        </div>
      </section>

      {/* Decision-aware Status Filter Chips */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        {DECISION_STATUS_FILTERS.map((f) => {
          const isActive = selectedStatus === f.key;
          const count = statusCounts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setSelectedStatus(f.key);
                setCurrentPage(1);
              }}
              style={{
                padding: "0.35rem 0.7rem",
                fontFamily: "var(--font-label)",
                fontSize: "0.74rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                border: isActive ? "2px solid var(--ink)" : "1px solid rgba(28, 22, 19, 0.3)",
                backgroundColor: isActive ? "var(--ink)" : "rgba(28, 22, 19, 0.02)",
                color: isActive ? "var(--paper)" : "var(--ink)",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                transition: "all 0.12s ease",
              }}
            >
              <span>{f.label}</span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "0.05rem 0.35rem",
                  borderRadius: "2px",
                  backgroundColor: isActive ? "var(--paper)" : "rgba(28, 22, 19, 0.1)",
                  color: isActive ? "var(--ink)" : "var(--ink)",
                  fontWeight: 700,
                }}
              >
                <Num>{count}</Num>
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls: Search and Sort */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div style={{ flex: 1, minWidth: "260px" }}>
          <label
            htmlFor="applicantSearch"
            style={{
              display: "block",
              fontFamily: "var(--font-label)",
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "0.2rem",
              color: "var(--ink)",
              fontWeight: 700,
            }}
          >
            SEARCH APPLICANTS
          </label>
          <input
            id="applicantSearch"
            name="searchQuery"
            type="text"
            className="newspaper-input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Sort Select */}
        <div style={{ width: "240px" }}>
          <label
            htmlFor="applicantSort"
            style={{
              display: "block",
              fontFamily: "var(--font-label)",
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "0.2rem",
              color: "var(--ink)",
              fontWeight: 700,
            }}
          >
            SORT ORDER
          </label>
          <select
            id="applicantSort"
            name="sortOrder"
            className="newspaper-select"
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              setCurrentPage(1);
            }}
            style={{ height: "36px" }}
          >
            <option value="oldest">Oldest submitted first</option>
            <option value="newest">Newest submitted first</option>
            <option value="regNumber">Registration number</option>
            <option value="marksHigh">Highest Round 1 marks</option>
            <option value="marksLow">Lowest Round 1 marks</option>
          </select>
        </div>
      </div>

      {/* Classified Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={selectedDomain === "ALL" ? 8 : 7} />
      ) : filteredAndSorted.length === 0 ? (
        <EmptyState
          title="No applications match these filters."
          description="Adjust your search keywords, status filters, or division selection."
          onClear={handleClearFilters}
        />
      ) : (
        <div style={{ width: "100%", overflowX: "auto", borderTop: "2px solid var(--ink)" }}>
          <table className="classified-table" style={{ width: "100%", tableLayout: "fixed", marginTop: 0 }}>
            <thead>
              <tr>
                <th style={{ width: (isRoot || selectedDomain === "ALL") ? "8.5%" : "9.5%", padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>Reg. no.</th>
                <th style={{ width: (isRoot || selectedDomain === "ALL") ? "14%" : "18%", padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>Name</th>
                {(isRoot || selectedDomain === "ALL") && (
                  <th style={{ width: "7.5%", padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>Division</th>
                )}
                <th style={{ width: (isRoot || selectedDomain === "ALL") ? "9.5%" : "10.5%", padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>Submitted</th>
                <th style={{ width: (isRoot || selectedDomain === "ALL") ? "7%" : "8%", padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>Round 1</th>
                <th style={{ width: (isRoot || selectedDomain === "ALL") ? "20%" : "21%", padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>Status</th>
                <th style={{ width: (isRoot || selectedDomain === "ALL") ? "15.5%" : "15%", padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>Interview</th>
                <th style={{ width: "18%", padding: "0.55rem 0.35rem", textAlign: "right", whiteSpace: "nowrap" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((app) => {
                const totalMax =
                  (app.user?.answers || [])
                    .filter((a) => a.question && a.question.domain === app.domain)
                    .reduce((sum, a) => sum + (a.question?.maxMarks || 0), 0) || 35;

                const interviewTime = app.booking?.slot
                  ? `${formatDate(app.booking.slot.startTime)}, ${formatTime(app.booking.slot.startTime).replace(" IST", "")}`
                  : "—";

                const isMovable =
                  !app.round1EmailSentAt &&
                  app.stage === "FORM_FILLING" &&
                  (app.round1Decision === "SHORTLIST" || app.round1Decision === "REJECT");

                return (
                  <tr
                    key={app.id}
                    onClick={() => router.push(`/applicants/${app.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/applicants/${app.id}`);
                    }}
                    tabIndex={0}
                    style={{ cursor: "pointer", outline: "none" }}
                    className="classified-row"
                  >
                    <td data-label="Reg. no." style={{ padding: "0.55rem 0.35rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                      <Num>{app.user?.regNumber || "—"}</Num>
                    </td>
                    <td
                      data-label="Name"
                      style={{
                        padding: "0.55rem 0.35rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={app.user?.name}
                    >
                      <strong title={app.user?.name}>{app.user?.name}</strong>
                    </td>
                    {(isRoot || selectedDomain === "ALL") && (
                      <td
                        data-label="Division"
                        style={{
                          padding: "0.55rem 0.35rem",
                          fontSize: "0.78rem",
                          textTransform: "uppercase",
                          fontFamily: "var(--font-label)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={DOMAIN_LABELS[app.domain]}
                      >
                        {DOMAIN_SHORT_LABELS[app.domain]}
                      </td>
                    )}
                    <td data-label="Submitted" style={{ padding: "0.55rem 0.35rem", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                      <Num>{formatDate(app.submittedAt || "")}</Num>
                    </td>
                    <td data-label="Round 1" style={{ padding: "0.55rem 0.35rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                      {app.review1Marks !== null && app.review1Marks !== undefined ? (
                        <span style={{ whiteSpace: "nowrap" }}>
                          <Num>{app.review1Marks}</Num>&nbsp;/&nbsp;<Num>{totalMax}</Num>
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-soft)", fontStyle: "italic", fontSize: "0.78rem" }}>
                          Not scored
                        </span>
                      )}
                    </td>
                    <td data-label="Status" style={{ padding: "0.55rem 0.35rem", whiteSpace: "nowrap" }}>
                      {(() => {
                        const status = getApplicationDecisionStatus(app);
                        const isReject =
                          app.round1Decision === "REJECT" || app.stage === "REJECTED";
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", alignItems: "flex-start", overflow: "hidden" }}>
                            <span
                              style={{
                                fontFamily: "var(--font-label)",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.03em",
                                color: isReject ? "var(--stamp)" : "var(--ink)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%",
                              }}
                            >
                              {status.label}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexWrap: "wrap" }}>
                              <StageStamp stage={getDisplayStage(app)} size="sm" />
                              {app.round1EmailSentAt && (
                                <span
                                  style={{
                                    fontSize: "0.66rem",
                                    fontFamily: "var(--font-label)",
                                    color: "var(--ink-soft)",
                                    textTransform: "uppercase",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  (Emailed)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td data-label="Interview" style={{ padding: "0.55rem 0.35rem", fontSize: "0.78rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {interviewTime !== "—" ? <Num>{interviewTime}</Num> : "—"}
                    </td>
                    <td
                      data-label="Action"
                      style={{
                        padding: "0.55rem 0.35rem",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          justifyContent: "flex-end",
                        }}
                      >
                        {isMovable && (
                          <button
                            type="button"
                            disabled={movingId === app.id}
                            onClick={() =>
                              handleMoveDecision(
                                app,
                                app.round1Decision === "SHORTLIST" ? "REJECT" : "SHORTLIST"
                              )
                            }
                            className="ink-btn-secondary"
                            style={{
                              fontSize: "0.66rem",
                              padding: "0.18rem 0.4rem",
                              color: app.round1Decision === "SHORTLIST" ? "var(--stamp)" : "var(--ink)",
                              borderColor: app.round1Decision === "SHORTLIST" ? "var(--stamp)" : "var(--ink)",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                            title={
                              app.round1Decision === "SHORTLIST"
                                ? "Move this candidate to the rejection list"
                                : "Move this candidate to the shortlisted list"
                            }
                          >
                            {app.round1Decision === "SHORTLIST" ? "Reject" : "Shortlist"}
                          </button>
                        )}
                        <Link
                          href={`/applicants/${app.id}`}
                          className="ink-btn-secondary"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.7rem",
                            padding: "0.18rem 0.55rem",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            fontWeight: 600,
                            lineHeight: 1.2,
                          }}
                        >
                          OPEN →
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      {totalItems > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--ink)",
            fontSize: "0.82rem",
            fontFamily: "var(--font-label)",
          }}
        >
          <div>
            Showing <Num>{startItem}</Num> to <Num>{endItem}</Num> of <Num>{totalItems}</Num>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="ink-btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }}
            >
              ← Previous
            </button>
            <span style={{ padding: "0.3rem 0.5rem", fontWeight: 700 }}>
              Page <Num>{currentPage}</Num> of <Num>{totalPages}</Num>
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="ink-btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.75rem" }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* SEND EMAILS CONFIRMATION MODAL POPUP */}
      {modalDecision && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sendModalTitle"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(20, 16, 14, 0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            boxSizing: "border-box",
          }}
        >
          <div
            className="paper"
            style={{
              maxWidth: "680px",
              width: "100%",
              maxHeight: "92vh",
              overflowY: "auto",
              border: "3px solid var(--ink)",
              boxShadow: "8px 8px 0px rgba(28, 22, 19, 0.3)",
              padding: "1.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              position: "relative",
            }}
          >
            {/* Modal Header */}
            <div>
              <span className="kicker" style={{ color: "var(--stamp)" }}>
                ✦ CONFIRM DISPATCH · {DOMAIN_LABELS[dispatchDomain]?.toUpperCase()} DESK ✦
              </span>
              <h2
                id="sendModalTitle"
                className="headline"
                style={{ fontSize: "1.75rem", margin: "0.3rem 0 0.2rem 0" }}
              >
                Send Round 1 {modalDecision === "SHORTLIST" ? "Shortlist" : "Rejection"} Notifications
              </h2>
              <p className="deck" style={{ margin: 0 }}>
                {modalDecision === "SHORTLIST" ? (
                  <>
                    You are dispatching interview invitations to{" "}
                    <strong><Num>{unmailedShortlistCandidates.length}</Num> shortlisted candidates</strong>.
                  </>
                ) : (
                  <>
                    You are dispatching status updates to{" "}
                    <strong><Num>{unmailedRejectCandidates.length}</Num> applicants not taken forward</strong>.
                  </>
                )}
              </p>
            </div>

            {/* Candidate List Preview */}
            <div
              style={{
                border: "1px solid var(--ink)",
                backgroundColor: "rgba(28, 22, 19, 0.03)",
                padding: "0.75rem 1rem",
                maxHeight: "160px",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  marginBottom: "0.4rem",
                }}
              >
                Recipients ({modalDecision === "SHORTLIST" ? unmailedShortlistCandidates.length : unmailedRejectCandidates.length}):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {(modalDecision === "SHORTLIST"
                  ? unmailedShortlistCandidates
                  : unmailedRejectCandidates
                ).map((c) => (
                  <span
                    key={c.id}
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.5rem",
                      backgroundColor: "var(--paper)",
                      border: "1px solid var(--ink)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <strong>{c.user?.name}</strong>{" "}
                    <span style={{ color: "var(--ink-soft)" }}>({c.user?.regNumber || "—"})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Email Template Preview / Edit */}
            {loadingTemplate ? (
              <div style={{ padding: "1.5rem", textAlign: "center", fontStyle: "italic" }}>
                Loading editorial dispatch template...
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label
                    htmlFor="emailSubject"
                    style={{
                      display: "block",
                      fontFamily: "var(--font-label)",
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontWeight: 700,
                      marginBottom: "0.25rem",
                    }}
                  >
                    Email Subject Header
                  </label>
                  <input
                    id="emailSubject"
                    type="text"
                    disabled={isSending}
                    className="newspaper-input"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="emailBody"
                    style={{
                      display: "block",
                      fontFamily: "var(--font-label)",
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontWeight: 700,
                      marginBottom: "0.25rem",
                    }}
                  >
                    Email Body Dispatch Preview
                  </label>
                  <textarea
                    id="emailBody"
                    rows={6}
                    disabled={isSending}
                    className="newspaper-textarea"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    style={{ resize: "vertical", fontSize: "0.85rem", lineHeight: 1.4 }}
                  />
                  <div style={{ fontSize: "0.7rem", color: "var(--ink-soft)", marginTop: "0.2rem" }}>
                    Dynamic merge fields: <code>{"{{name}}"}</code>, <code>{"{{division}}"}</code>, <code>{"{{site_url}}"}</code>
                  </div>
                </div>
              </div>
            )}

            {/* Critical Warning Notice */}
            <div
              style={{
                border: "2px solid var(--stamp)",
                backgroundColor: "rgba(139, 30, 30, 0.05)",
                padding: "0.75rem 1rem",
                fontSize: "0.82rem",
                color: "var(--stamp)",
                lineHeight: 1.35,
              }}
            >
              <strong>✦ FINALITY NOTICE:</strong> Once dispatched, decision emails are sent directly to applicants. Their Round 1 evaluation becomes permanently locked and cannot be altered or moved back.
            </div>

            {/* Checkbox Confirmation */}
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
                cursor: isSending ? "not-allowed" : "pointer",
                fontSize: "0.84rem",
                fontFamily: "var(--font-label)",
              }}
            >
              <input
                type="checkbox"
                checked={confirmedChecked}
                onChange={(e) => setConfirmedChecked(e.target.checked)}
                disabled={isSending}
                style={{ marginTop: "0.15rem" }}
              />
              <span>
                I have verified this roster and authorize dispatching{" "}
                <strong>
                  {modalDecision === "SHORTLIST"
                    ? unmailedShortlistCandidates.length
                    : unmailedRejectCandidates.length}{" "}
                  {modalDecision === "SHORTLIST" ? "shortlist" : "rejection"} emails
                </strong>.
              </span>
            </label>

            {/* Sending Progress Bar */}
            {isSending && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                  <span>Dispatching in batches of 20...</span>
                  <span>
                    <Num>{sendProgress.sent}</Num> of <Num>{sendProgress.total}</Num> sent
                  </span>
                </div>
                <div style={{ height: "10px", width: "100%", backgroundColor: "rgba(28, 22, 19, 0.1)", border: "1px solid var(--ink)" }}>
                  <div
                    style={{
                      height: "100%",
                      backgroundColor: "var(--stamp)",
                      width: `${(sendProgress.sent / (sendProgress.total || 1)) * 100}%`,
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Failures Display & Retry */}
            {sendProgress.failures.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--stamp)",
                  padding: "0.6rem 0.8rem",
                  backgroundColor: "rgba(139, 30, 30, 0.05)",
                  fontSize: "0.78rem",
                  color: "var(--stamp)",
                }}
              >
                <strong>{sendProgress.failures.length} delivery errors occurred:</strong>
                <ul style={{ margin: "0.3rem 0 0.5rem 1.2rem", padding: 0 }}>
                  {sendProgress.failures.map((f, i) => (
                    <li key={i}>
                      {f.candidateName}: {f.reason}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={executeSendEmails}
                  disabled={isSending}
                  className="stamp-btn"
                  style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
                >
                  Retry Failed Deliveries
                </button>
              </div>
            )}

            {/* Modal Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                borderTop: "1px solid var(--ink)",
                paddingTop: "0.75rem",
              }}
            >
              <button
                type="button"
                onClick={closeSendModal}
                disabled={isSending}
                className="ink-btn-secondary"
                style={{ fontSize: "0.82rem", padding: "0.45rem 1rem" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={executeSendEmails}
                disabled={!confirmedChecked || isSending || (modalDecision === "SHORTLIST" ? unmailedShortlistCandidates.length === 0 : unmailedRejectCandidates.length === 0)}
                className="stamp-btn"
                style={{
                  fontSize: "0.82rem",
                  padding: "0.45rem 1.25rem",
                  fontWeight: 700,
                  opacity: !confirmedChecked || isSending ? 0.5 : 1,
                  cursor: !confirmedChecked || isSending ? "not-allowed" : "pointer",
                }}
              >
                {isSending
                  ? "Dispatching..."
                  : `Send ${
                      modalDecision === "SHORTLIST"
                        ? unmailedShortlistCandidates.length
                        : unmailedRejectCandidates.length
                    } Emails`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
