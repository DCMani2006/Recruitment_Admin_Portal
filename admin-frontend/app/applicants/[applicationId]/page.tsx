"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { StageStamp } from "@/components/StageStamp";
import { FiveStepTracker } from "@/components/FiveStepTracker";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Num } from "@/components/Num";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/TickerToast";
import { api } from "@/lib/client";
import {
  Application,
  Answer,
  DomainEnum,
  ApplicationStage,
  DOMAIN_LABELS,
  STAGE_LABELS,
  getDisplayStage,
} from "@/lib/types";
import { formatDate, formatDateTime, formatTime, REVIEW2_MAX } from "@/lib/config";

export default function ApplicantDetailPage() {
  return (
    <AuthGuard>
      <AdminShell>
        <ReviewDeskContent />
      </AdminShell>
    </AuthGuard>
  );
}

function ReviewDeskContent() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isRoot = user?.role === "ROOT_ADMIN";
  const userDomain = user?.domain;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [subsectionsMap, setSubsectionsMap] = useState<Record<string, string>>({});

  // Marks and comments state for Round 1
  const [marksMap, setMarksMap] = useState<Record<string, number>>({});
  const [initialMarksMap, setInitialMarksMap] = useState<Record<string, number>>({});
  const [review1Comments, setReview1Comments] = useState<string>("");

  // Round 2 State (when stage is INTERVIEW)
  const [review2Marks, setReview2Marks] = useState<number>(0);
  const [review2Comments, setReview2Comments] = useState<string>("");

  // Edit toggle for Round 1 during INTERVIEW stage
  const [editRound1, setEditRound1] = useState(false);

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Decision Modal States
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [rejectCommentsError, setRejectCommentsError] = useState<string | null>(null);

  // Stamp slam animation removed per F3b

  // Session list for Previous / Next navigation
  const [sessionList, setSessionList] = useState<string[]>([]);
  const currentIndexInSession = sessionList.indexOf(applicationId);

  useEffect(() => {
    document.title = "Candidate Review · The TAM Times Admin";
  }, []);

  // Load session list from sessionStorage or fallback to getApplicants
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tam_applicant_ids");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessionList(parsed);
          return;
        }
      }
    } catch {}

    // Fallback: fetch applicant IDs directly if sessionStorage is unseeded
    api.getApplicants(isRoot ? "ALL" : (userDomain || "ALL")).then((apps) => {
      const ids = apps.map((a) => a.id);
      setSessionList(ids);
      try {
        sessionStorage.setItem("tam_applicant_ids", JSON.stringify(ids));
      } catch {}
    }).catch(() => {});
  }, [isRoot, userDomain]);

  // Fetch application data
  const loadApplication = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const app = await api.getApplication(applicationId);

      // Domain Head permission check: opening another division gets a "not found" state
      if (!isRoot && userDomain && app.domain !== userDomain) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setApplication(app);

      // Initialize marks map only with answers belonging to THIS application's domain
      const initialMarks: Record<string, number> = {};
      const domainAnswers = (app.user?.answers || []).filter(
        (a) => a.question && a.question.domain === app.domain
      );

      domainAnswers.forEach((ans) => {
        initialMarks[ans.id] = ans.marks !== null && ans.marks !== undefined ? ans.marks : 0;
      });

      setMarksMap(initialMarks);
      setInitialMarksMap(initialMarks);
      setReview1Comments(app.review1Comments || "");
      setReview2Marks(app.review2Marks !== null && app.review2Marks !== undefined ? app.review2Marks : 0);
      setReview2Comments(app.review2Comments || "");
      setHasUnsavedChanges(false);

      // Fetch subsections for clear subsection headers
      api.getForm(app.domain).then((formData) => {
        const subMap: Record<string, string> = {};
        (formData.subsections || []).forEach((sub) => {
          subMap[sub.id] = sub.name;
        });
        setSubsectionsMap(subMap);
      }).catch(() => {});
    } catch (err: any) {
      const errMsg = err.message || "";
      if (err.status === 401 || err.status === 403 || errMsg.includes("401") || errMsg.includes("403")) {
        router.push("/login");
        return;
      }
      if (err.status === 404 || errMsg.includes("not found") || errMsg.includes("404")) {
        setNotFound(true);
      } else {
        setError(errMsg || "Network error loading application. Please retry.");
      }
    } finally {
      setLoading(false);
    }
  }, [applicationId, isRoot, userDomain, router]);

  useEffect(() => {
    loadApplication();
  }, [loadApplication]);

  // Window beforeunload guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Safe navigation helper with guard
  const navigateWithGuard = (url: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigationUrl(url);
      setShowUnsavedModal(true);
    } else {
      router.push(url);
    }
  };

  // Keyboard navigation: Left/Right arrows (when not typing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        if (currentIndexInSession > 0) {
          navigateWithGuard(`/applicants/${sessionList[currentIndexInSession - 1]}`);
        }
      } else if (e.key === "ArrowRight") {
        if (currentIndexInSession !== -1 && currentIndexInSession < sessionList.length - 1) {
          navigateWithGuard(`/applicants/${sessionList[currentIndexInSession + 1]}`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndexInSession, sessionList, hasUnsavedChanges]);

  // Filter user's answers to strictly this application's domain
  const relevantAnswers = useMemo(() => {
    if (!application?.user?.answers) return [];
    return application.user.answers
      .filter((a) => a.question && a.question.domain === application.domain)
      .sort((a, b) => (a.question?.order || 0) - (b.question?.order || 0));
  }, [application]);

  // Group relevant answers by subsection
  const groupedAnswers = useMemo(() => {
    const groups: { subsectionName: string; answers: Answer[] }[] = [];
    const map: Record<string, Answer[]> = {};

    relevantAnswers.forEach((ans) => {
      const subName = ans.question?.subsectionId
        ? (subsectionsMap[ans.question.subsectionId] || `Subsection ${ans.question.subsectionId.split("-").pop() || "I"}`)
        : "General";
      if (!map[subName]) {
        map[subName] = [];
        groups.push({ subsectionName: subName, answers: map[subName] });
      }
      map[subName].push(ans);
    });

    return groups;
  }, [relevantAnswers, subsectionsMap]);

  // Scoring calculations for Round 1
  const totalMaxMarks = useMemo(() => {
    return relevantAnswers.reduce((sum, a) => sum + (a.question?.maxMarks || 0), 0);
  }, [relevantAnswers]);

  const currentTotalMarks = useMemo(() => {
    return relevantAnswers.reduce((sum, a) => sum + (marksMap[a.id] || 0), 0);
  }, [relevantAnswers, marksMap]);

  const markedCount = useMemo(() => {
    return relevantAnswers.filter((a) => marksMap[a.id] !== undefined && marksMap[a.id] > 0).length;
  }, [relevantAnswers, marksMap]);

  const unmarkedCount = relevantAnswers.length - markedCount;
  const scorePercentage = totalMaxMarks > 0 ? Math.round((currentTotalMarks / totalMaxMarks) * 100) : 0;

  // Handle Mark Change
  const handleScoreChange = (answerId: string, delta: number, maxMarks: number) => {
    const current = marksMap[answerId] || 0;
    const next = Math.max(0, Math.min(maxMarks, current + delta));
    setMarksMap((prev) => ({ ...prev, [answerId]: next }));
    setHasUnsavedChanges(true);
  };

  const handleScoreInput = (answerId: string, val: string, maxMarks: number) => {
    const num = parseInt(val, 10);
    const valid = isNaN(num) ? 0 : Math.max(0, Math.min(maxMarks, num));
    setMarksMap((prev) => ({ ...prev, [answerId]: valid }));
    setHasUnsavedChanges(true);
  };

  // Perform Update Decision (ONE single PUT)
  const executeReviewDecision = async (
    payload: {
      stage?: ApplicationStage;
      review1Marks?: number;
      review1Comments?: string;
      review1Passed?: boolean;
      review2Marks?: number;
      review2Comments?: string;
      review2Passed?: boolean;
      round1Decision?: "SHORTLIST" | "REJECT" | null;
    },
    successMessage: string
  ) => {
    if (!application || submitting) return;
    setSubmitting(true);
    setError(null);

    // Build answerScores array: changed answers only (or unrecorded scores with marks entered)
    const answerScores = relevantAnswers
      .filter((a) => marksMap[a.id] !== initialMarksMap[a.id] || a.marks === null || a.marks === undefined)
      .map((a) => ({
        answerId: a.id,
        marks: marksMap[a.id] ?? 0,
      }));

    // Optimistic update so UI shifts immediately
    setApplication((prev) =>
      prev
        ? {
            ...prev,
            ...payload,
            round1DecisionAt: payload.round1Decision ? new Date().toISOString() : prev.round1DecisionAt,
          }
        : null
    );

    try {
      const updated = await api.updateReview(application.id, {
        ...payload,
        answerScores,
      });

      setApplication(updated);
      setInitialMarksMap(marksMap);
      setHasUnsavedChanges(false);
      showToast(successMessage, "success");
    } catch (err: any) {
      const errMsg = err.message || "";
      if (err.code === "DECISION_LOCKED" || errMsg.includes("DECISION_LOCKED")) {
        showToast("Round 1 review is locked because decision emails have already been dispatched.", "error");
        await loadApplication();
      } else if (err.code === "USE_DECISION_FLOW" || errMsg.includes("USE_DECISION_FLOW")) {
        showToast("Stage changes from FORM_FILLING must go through the decision and email workflow.", "error");
      } else if (err.code === "INTERVIEW_NOT_DONE" || errMsg.includes("INTERVIEW_NOT_DONE")) {
        showToast("Interview marks can only be entered after the candidate's interview slot has ended.", "error");
      } else if (errMsg.includes("INVALID_STAGE_CHANGE")) {
        showToast("The status changed elsewhere, showing the updated one.", "error");
        await loadApplication();
      } else if (errMsg.includes("NOT_SUBMITTED")) {
        showToast("Cannot shortlist an unsubmitted application.", "error");
      } else if (errMsg.includes("WRONG_DOMAIN")) {
        showToast("This application does not belong to your division.", "error");
      } else if (err.status === 401 || err.status === 403 || errMsg.includes("401") || errMsg.includes("403")) {
        showToast("Session expired or unauthorized. Returning to login.", "error");
        router.push("/login");
      } else if (err.status === 404 || errMsg.includes("404")) {
        setNotFound(true);
      } else {
        setError(errMsg || "Failed to update review decision. Please retry.");
        showToast(errMsg || "Network error updating review.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Round 1 Handlers
  const handleSaveDraftR1 = () => {
    setRejectCommentsError(null);
    executeReviewDecision(
      {
        round1Decision: null,
        review1Marks: currentTotalMarks,
        review1Comments,
      },
      "Draft evaluation saved (without decision)."
    );
  };

  const handleMarkToShortlist = () => {
    setRejectCommentsError(null);
    executeReviewDecision(
      {
        round1Decision: "SHORTLIST",
        review1Marks: currentTotalMarks,
        review1Comments,
        review1Passed: true,
      },
      "Marked to shortlist (email not sent yet)."
    );
  };

  const handleMarkToReject = () => {
    if (!review1Comments || review1Comments.trim().length < 10) {
      setRejectCommentsError("A comment of at least 10 characters is required to mark for rejection.");
      return;
    }
    setRejectCommentsError(null);
    executeReviewDecision(
      {
        round1Decision: "REJECT",
        review1Marks: currentTotalMarks,
        review1Comments,
        review1Passed: false,
      },
      "Marked to reject (email not sent yet)."
    );
  };

  const handleMarkSlotChoosing = () => {
    executeReviewDecision(
      {
        stage: "SLOT_CHOOSING",
        review1Marks: currentTotalMarks,
        review1Comments,
      },
      "Stage set to slot choosing."
    );
  };

  // Round 2 Handlers (Interview)
  const handleConfirmSelect = () => {
    setShowSelectModal(false);
    executeReviewDecision(
      {
        stage: "SELECTED",
        review2Marks,
        review2Comments,
        review2Passed: true,
      },
      "Candidate officially selected!"
    );
  };

  const handleConfirmRejectRound2 = () => {
    if (!review2Comments || review2Comments.trim().length < 10) {
      setRejectCommentsError("A comment of at least 10 characters is required for rejection.");
      return;
    }
    setRejectCommentsError(null);
    setShowRejectModal(false);
    executeReviewDecision(
      {
        stage: "REJECTED",
        review2Marks,
        review2Comments,
        review2Passed: false,
      },
      "Application marked as not taken forward."
    );
  };

  const handleConfirmSendBack = () => {
    setShowSendBackModal(false);
    executeReviewDecision(
      {
        stage: "SLOT_CHOOSING",
        review2Marks,
        review2Comments,
      },
      "Candidate sent back to slot choosing. Previous slot released."
    );
  };

  const handleSaveDraftR2 = () => {
    executeReviewDecision(
      {
        review2Marks,
        review2Comments,
      },
      "Interview round draft saved."
    );
  };

  // Copy meeting link
  const handleCopyLink = () => {
    if (application?.booking?.slot?.meetingLink) {
      navigator.clipboard.writeText(application.booking.slot.meetingLink);
      showToast("Meeting link copied to clipboard.", "info");
    }
  };

  // Find next waiting applicant in current session list
  const nextWaitingId = useMemo(() => {
    if (currentIndexInSession === -1 || currentIndexInSession >= sessionList.length - 1) return null;
    return sessionList[currentIndexInSession + 1];
  }, [currentIndexInSession, sessionList]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <Skeleton height="80px" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
          <Skeleton height="400px" />
          <Skeleton height="300px" />
        </div>
      </div>
    );
  }

  if (notFound || !application) {
    return (
      <EmptyState
        title="Application not found"
        description="The requested candidate dossier could not be found in your division records."
        actionLabel="← Return to Applicant Listings"
        onClear={() => router.push("/applicants")}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Error loading application"
        description={error}
        actionLabel="Retry"
        onClear={() => loadApplication()}
      />
    );
  }

  const stage = application.stage;
  const isFormFilling = stage === "FORM_FILLING";
  const isShortlisted = stage === "SHORTLISTED";
  const isSlotChoosing = stage === "SLOT_CHOOSING";
  const isInterview = stage === "INTERVIEW";
  const isSelected = stage === "SELECTED";
  const isRejected = stage === "REJECTED";
  const isFinalStage = isSelected || isRejected;

  const slot = application.booking?.slot;
  const slotDurationMinutes = slot
    ? Math.round((new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 60000)
    : 15;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Top Breadcrumb & Session Navigation */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--ink)",
          paddingBottom: "0.5rem",
          fontSize: "0.78rem",
          fontFamily: "var(--font-label)",
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => navigateWithGuard("/applicants")}
            style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline", color: "var(--ink)", padding: 0 }}
          >
            ← Applicant Listings
          </button>
          <span>/</span>
          <span style={{ color: "var(--ink-soft)" }}>{application.user.name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {sessionList.length > 0 && currentIndexInSession !== -1 && (
            <span>
              <Num>{currentIndexInSession + 1}</Num> of <Num>{sessionList.length}</Num>
            </span>
          )}
          <button
            type="button"
            disabled={currentIndexInSession <= 0}
            onClick={() => navigateWithGuard(`/applicants/${sessionList[currentIndexInSession - 1]}`)}
            className="ink-btn-secondary"
            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={currentIndexInSession === -1 || currentIndexInSession >= sessionList.length - 1}
            onClick={() => navigateWithGuard(`/applicants/${sessionList[currentIndexInSession + 1]}`)}
            className="ink-btn-secondary"
            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Candidate Header Card */}
      <header
        className="paper"
        style={{
          border: "2px solid var(--ink)",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span className="kicker" style={{ marginBottom: "0.2rem" }}>
              ✦ CANDIDATE DOSSIER · {DOMAIN_LABELS[application.domain].toUpperCase()} DESK ✦
            </span>
            <h1 className="headline" style={{ fontSize: "2.4rem", margin: "0.1rem 0" }}>
              {application.user.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
              <span>
                Reg: <strong><Num>{application.user.regNumber}</Num></strong>
              </span>
              <span>·</span>
              <a href={`mailto:${application.user.email}`} style={{ color: "var(--ink)", textDecoration: "underline" }}>
                {application.user.email}
              </a>
              <span>·</span>
              <a href={`tel:${application.user.phone}`} style={{ color: "var(--ink)", textDecoration: "underline" }}>
                <Num>{application.user.phone}</Num>
              </a>
              <span>·</span>
              <span>
                Submitted: <Num>{formatDate(application.submittedAt || "")}</Num>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
            <StageStamp stage={getDisplayStage(application)} size="lg" />
            {application.stage === "FORM_FILLING" && application.round1Decision === "SHORTLIST" && !application.round1EmailSentAt && (
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-label)", textTransform: "uppercase", color: "var(--stamp)", letterSpacing: "0.06em", fontWeight: 700 }}>
                Marked to Shortlist (unmailed)
              </span>
            )}
            {application.stage === "FORM_FILLING" && application.round1Decision === "REJECT" && !application.round1EmailSentAt && (
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-label)", textTransform: "uppercase", color: "var(--stamp)", letterSpacing: "0.06em", fontWeight: 700 }}>
                Marked to Reject (unmailed)
              </span>
            )}
            {nextWaitingId && (
              <button
                type="button"
                onClick={() => navigateWithGuard(`/applicants/${nextWaitingId}`)}
                className="ink-btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
              >
                Next waiting applicant →
              </button>
            )}
          </div>
        </div>

        {/* 5-Step Tracker */}
        <FiveStepTracker stage={getDisplayStage(application)} />
      </header>

      {/* Main Two-Column Review Desk Layout */}
      <div
        className="review-desk-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* Left Column: Answers Grouped by Subsection */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {groupedAnswers.length === 0 ? (
            <div style={{ padding: "2rem", border: "1px dashed var(--ink)", textAlign: "center" }}>
              <p style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>
                No question responses recorded for this division.
              </p>
            </div>
          ) : (
            groupedAnswers.map((group, gIdx) => (
              <div key={gIdx} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderBottom: "1.5px solid var(--ink)", paddingBottom: "0.35rem" }}>
                  <h2
                    style={{
                      fontFamily: "var(--font-headline)",
                      fontSize: "1.3rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {group.subsectionName}
                  </h2>
                </div>

                {group.answers.map((ans, qIdx) => {
                  const q = ans.question;
                  const wordCount = ans.text ? ans.text.trim().split(/\s+/).filter(Boolean).length : 0;
                  const score = marksMap[ans.id] || 0;
                  const maxMarks = q?.maxMarks || 10;
                  const isReadOnly = (isInterview && !editRound1) || isFinalStage;

                  return (
                    <article
                      key={ans.id}
                      style={{
                        border: "1px solid var(--ink)",
                        padding: "1rem 1.25rem",
                        backgroundColor: "rgba(28, 22, 19, 0.02)",
                      }}
                    >
                      {/* Question Text */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.6rem" }}>
                        <h3
                          style={{
                            fontFamily: "var(--font-headline)",
                            fontSize: "1.1rem",
                            lineHeight: 1.2,
                            color: "var(--ink)",
                          }}
                        >
                          <Num>{(q?.order || qIdx + 1)}</Num>. {q?.text}
                        </h3>

                        {/* Marks Stepper */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            backgroundColor: "var(--paper)",
                            padding: "0.25rem 0.4rem",
                            border: "1px solid var(--ink)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleScoreChange(ans.id, -1, maxMarks)}
                              disabled={score <= 0}
                              aria-label={`Decrease marks for Question ${q?.order || qIdx + 1}`}
                              style={{
                                width: "24px",
                                height: "24px",
                                border: "1px solid var(--ink)",
                                background: "transparent",
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: "1rem",
                                lineHeight: 1,
                              }}
                            >
                              -
                            </button>
                          )}

                          <input
                            type="number"
                            min="0"
                            max={maxMarks}
                            value={score}
                            disabled={isReadOnly}
                            onChange={(e) => handleScoreInput(ans.id, e.target.value, maxMarks)}
                            aria-label={`Score for Question ${q?.order || qIdx + 1}`}
                            style={{
                              width: "36px",
                              textAlign: "center",
                              border: "none",
                              background: "transparent",
                              fontFamily: "var(--font-label)",
                              fontWeight: 700,
                              fontSize: "0.95rem",
                              outline: "none",
                            }}
                          />
                          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.85rem", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                            &nbsp;/&nbsp;<Num>{maxMarks}</Num>
                          </span>

                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => handleScoreChange(ans.id, 1, maxMarks)}
                              disabled={score >= maxMarks}
                              aria-label={`Increase marks for Question ${q?.order || qIdx + 1}`}
                              style={{
                                width: "24px",
                                height: "24px",
                                border: "1px solid var(--ink)",
                                background: "transparent",
                                cursor: "pointer",
                                fontWeight: 700,
                                fontSize: "1rem",
                                lineHeight: 1,
                              }}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Candidate Answer Text */}
                      <div
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: "1rem",
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          color: ans.text ? "var(--ink)" : "var(--ink-soft)",
                          fontStyle: ans.text ? "normal" : "italic",
                          borderLeft: "2px solid var(--ink)",
                          paddingLeft: "0.75rem",
                          margin: "0.6rem 0",
                        }}
                      >
                        {ans.text || "No answer given."}
                      </div>

                      {/* Answer Footer (Word count) */}
                      <div
                        style={{
                          fontSize: "0.72rem",
                          fontFamily: "var(--font-label)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "var(--ink-soft)",
                          textAlign: "right",
                        }}
                      >
                        <Num>{wordCount}</Num> {wordCount === 1 ? "word" : "words"}
                      </div>
                    </article>
                  );
                })}
              </div>
            ))
          )}

          {/* History Timeline for Final Stages (SELECTED & REJECTED) */}
          {isFinalStage && (
            <div
              style={{
                border: "2px solid var(--ink)",
                padding: "1.25rem",
                marginTop: "1rem",
                backgroundColor: "rgba(28, 22, 19, 0.02)",
              }}
            >
              <span className="kicker" style={{ marginBottom: "0.3rem" }}>
                ✦ EDITORIAL RECORD & TIMELINE ✦
              </span>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.4rem", margin: "0.2rem 0 0.8rem 0" }}>
                Application History
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ borderLeft: "2px solid var(--ink)", paddingLeft: "0.75rem" }}>
                  <strong>1. Submission:</strong> Received on <Num>{formatDate(application.submittedAt || "")}</Num>.
                </div>
                <div style={{ borderLeft: "2px solid var(--ink)", paddingLeft: "0.75rem" }}>
                  <strong>2. Round 1 Review:</strong> Scored{" "}
                  <span style={{ whiteSpace: "nowrap" }}>
                    <Num>{application.review1Marks ?? currentTotalMarks}</Num>&nbsp;/&nbsp;<Num>{totalMaxMarks}</Num>
                  </span>{" "}
                  ({application.review1Passed ? "Passed" : "Not Passed"}).
                  {application.review1Comments && (
                    <div style={{ fontStyle: "italic", fontSize: "0.92rem", marginTop: "0.2rem" }}>
                      "{application.review1Comments}"
                    </div>
                  )}
                </div>
                {slot && (
                  <div style={{ borderLeft: "2px solid var(--ink)", paddingLeft: "0.75rem" }}>
                    <strong>3. Interview Examination:</strong> Conducted on <Num>{formatDateTime(slot.startTime)}</Num>.
                  </div>
                )}
                {application.review2Marks !== null && (
                  <div style={{ borderLeft: "2px solid var(--ink)", paddingLeft: "0.75rem" }}>
                    <strong>4. Round 2 Review:</strong> Scored{" "}
                    <span style={{ whiteSpace: "nowrap" }}>
                      <Num>{application.review2Marks}</Num>&nbsp;/&nbsp;<Num>{REVIEW2_MAX}</Num>
                    </span>{" "}
                    ({application.review2Passed ? "Passed" : "Not Passed"}).
                    {application.review2Comments && (
                      <div style={{ fontStyle: "italic", fontSize: "0.92rem", marginTop: "0.2rem" }}>
                        "{application.review2Comments}"
                      </div>
                    )}
                  </div>
                )}
                <div style={{ borderLeft: `2px solid ${isSelected ? "var(--stamp)" : "var(--ink)"}`, paddingLeft: "0.75rem" }}>
                  <strong>5. Final Decision:</strong> {isSelected ? "Candidate Selected for Membership." : "Application Not Taken Forward."}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Sticky Column: Round 1 / Round 2 Review Panels & Booking Card */}
        <aside className="review-desk-aside" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", position: "sticky", top: "1rem" }}>
          {/* Booking Card if Stage is INTERVIEW */}
          {isInterview && slot && (
            <div
              style={{
                border: "2px solid var(--ink)",
                padding: "1rem",
                backgroundColor: "rgba(28, 22, 19, 0.03)",
              }}
            >
              <span className="kicker" style={{ marginBottom: "0.2rem" }}>✦ INTERVIEW BOOKING ✦</span>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.2rem", margin: "0.2rem 0" }}>
                Scheduled Slot
              </h3>
              <p style={{ fontFamily: "var(--font-label)", fontSize: "0.85rem", margin: "0.3rem 0" }}>
                <Num>{formatDateTime(slot.startTime)}</Num>
              </p>
              <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginBottom: "0.75rem" }}>
                Duration: <Num>{slotDurationMinutes}</Num> minutes
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                {slot.meetingLink && (
                  <a
                    href={slot.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="stamp-btn"
                    style={{ flex: 1, textAlign: "center", textDecoration: "none", fontSize: "0.75rem", padding: "0.4rem 0.5rem" }}
                  >
                    Join Call
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="ink-btn-secondary"
                  style={{ fontSize: "0.75rem", padding: "0.4rem 0.6rem" }}
                >
                  Copy Link
                </button>
              </div>
            </div>
          )}

          {/* ROUND 1 PANEL */}
          <div
            style={{
              border: "2px solid var(--ink)",
              padding: "1.25rem",
              backgroundColor: "rgba(28, 22, 19, 0.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--ink)", paddingBottom: "0.4rem", marginBottom: "0.75rem" }}>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.4rem", textTransform: "uppercase" }}>
                Round 1 Review
              </h3>
            </div>

            {/* Status Line */}
            <div
              style={{
                padding: "0.6rem 0.75rem",
                border: "1px dashed var(--ink)",
                backgroundColor: "var(--paper)",
                fontSize: "0.82rem",
                marginBottom: "0.85rem",
                lineHeight: 1.4,
              }}
            >
              {application.round1EmailSentAt ? (
                <span style={{ color: "var(--ink)", fontWeight: 500 }}>
                  Email sent on <Num>{formatDateTime(application.round1EmailSentAt)}</Num>. This decision is locked.
                </span>
              ) : application.round1Decision === "SHORTLIST" ? (
                <span style={{ color: "var(--ink)" }}>
                  Decision: <strong>marked to shortlist</strong>. The email has not been sent yet, so you can still change this.
                </span>
              ) : application.round1Decision === "REJECT" ? (
                <span style={{ color: "var(--stamp)" }}>
                  Decision: <strong>marked to reject</strong>. The email has not been sent yet, so you can still change this.
                </span>
              ) : (
                <span style={{ color: "var(--ink-soft)" }}>
                  Decision: <em>waiting for review</em>.
                </span>
              )}
            </div>

            {/* Questions marked & total */}
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.85rem", fontFamily: "var(--font-label)", textTransform: "uppercase", color: "var(--ink-soft)" }}>
                <Num>{markedCount}</Num> of <Num>{relevantAnswers.length}</Num> questions marked
              </div>
              <div
                aria-live="polite"
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "2.2rem",
                  lineHeight: 1.1,
                  margin: "0.2rem 0",
                  color: "var(--ink)",
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>
                  <Num>{currentTotalMarks}</Num>&nbsp;/&nbsp;<Num>{totalMaxMarks}</Num>
                </span>{" "}
                <span style={{ fontSize: "1.1rem", fontFamily: "var(--font-label)", color: "var(--ink-soft)" }}>
                  (<Num>{scorePercentage}</Num>%)
                </span>
              </div>
            </div>

            {/* Comments Textarea */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                htmlFor="r1Comments"
                style={{
                  display: "block",
                  fontFamily: "var(--font-label)",
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: "0.25rem",
                  fontWeight: 700,
                }}
              >
                Round 1 Evaluation Comments
              </label>
              <textarea
                id="r1Comments"
                rows={4}
                disabled={Boolean(application.round1EmailSentAt) || isFinalStage}
                className="newspaper-textarea"
                value={review1Comments}
                onChange={(e) => {
                  setReview1Comments(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                style={{ resize: "vertical", fontSize: "0.92rem" }}
              />
              <div style={{ fontSize: "0.7rem", fontFamily: "var(--font-label)", textAlign: "right", color: "var(--ink-soft)" }}>
                <Num>{review1Comments.length}</Num> characters
              </div>
            </div>

            {/* Buttons Valid for Round 1 Only */}
            {isFormFilling && !application.round1EmailSentAt && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {rejectCommentsError && (
                  <div style={{ color: "var(--stamp)", fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                    ✦ {rejectCommentsError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSaveDraftR1}
                  disabled={submitting}
                  className="ink-btn-secondary"
                  style={{ width: "100%", fontSize: "0.78rem" }}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={handleMarkToShortlist}
                  disabled={submitting}
                  className={application.round1Decision === "SHORTLIST" ? "ink-btn" : "stamp-btn"}
                  style={{ width: "100%", fontSize: "0.78rem" }}
                >
                  {application.round1Decision === "SHORTLIST" ? "✓ Marked to Shortlist" : "Mark to Shortlist"}
                </button>
                <button
                  type="button"
                  onClick={handleMarkToReject}
                  disabled={submitting}
                  className="ink-btn-secondary"
                  style={{
                    width: "100%",
                    fontSize: "0.78rem",
                    color: "var(--stamp)",
                    borderColor: "var(--stamp)",
                    fontWeight: application.round1Decision === "REJECT" ? 700 : 400,
                  }}
                >
                  {application.round1Decision === "REJECT" ? "✕ Marked to Reject" : "Mark to Reject"}
                </button>
              </div>
            )}

            {isShortlisted && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={handleMarkSlotChoosing}
                  disabled={submitting}
                  className="ink-btn"
                  style={{ width: "100%", fontSize: "0.78rem" }}
                >
                  Mark as Choosing Slots
                </button>
                <button
                  type="button"
                  onClick={() => { setRejectCommentsError(null); setShowRejectModal(true); }}
                  disabled={submitting}
                  className="ink-btn-secondary"
                  style={{ width: "100%", fontSize: "0.78rem", color: "var(--stamp)", borderColor: "var(--stamp)" }}
                >
                  Reject
                </button>
              </div>
            )}

            {isSlotChoosing && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => { setRejectCommentsError(null); setShowRejectModal(true); }}
                  disabled={submitting}
                  className="ink-btn-secondary"
                  style={{ width: "100%", fontSize: "0.78rem", color: "var(--stamp)", borderColor: "var(--stamp)" }}
                >
                  Reject
                </button>
              </div>
            )}

            {isInterview && editRound1 && (
              <button
                type="button"
                onClick={handleSaveDraftR1}
                disabled={submitting}
                className="ink-btn"
                style={{ width: "100%", fontSize: "0.78rem" }}
              >
                Save Updated Round 1 Marks
              </button>
            )}
          </div>

          {/* ROUND 2 PANEL (Only at Stage INTERVIEW) */}
          {isInterview && (
            <div
              style={{
                border: "2px solid var(--stamp)",
                padding: "1.25rem",
                backgroundColor: "rgba(139, 30, 30, 0.03)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "1.4rem",
                  textTransform: "uppercase",
                  color: "var(--stamp)",
                  borderBottom: "1px solid var(--stamp)",
                  paddingBottom: "0.4rem",
                  marginBottom: "0.75rem",
                }}
              >
                Round 2 Interview
              </h3>

              {/* Round 2 Stepper (0 to REVIEW2_MAX) */}
              <div style={{ marginBottom: "0.75rem" }}>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--font-label)",
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "0.25rem",
                    fontWeight: 700,
                  }}
                >
                  Interview Examination Score
                </label>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    backgroundColor: "var(--paper)",
                    padding: "0.3rem 0.5rem",
                    border: "1px solid var(--ink)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setReview2Marks((m) => Math.max(0, m - 1));
                      setHasUnsavedChanges(true);
                    }}
                    disabled={review2Marks <= 0}
                    style={{ width: "24px", height: "24px", border: "1px solid var(--ink)", background: "transparent", cursor: "pointer", fontWeight: 700 }}
                  >
                    -
                  </button>
                  <input
                    id="r2Marks"
                    type="number"
                    min="0"
                    max={REVIEW2_MAX}
                    value={review2Marks}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setReview2Marks(isNaN(v) ? 0 : Math.max(0, Math.min(REVIEW2_MAX, v)));
                      setHasUnsavedChanges(true);
                    }}
                    aria-label="Interview Examination Score"
                    style={{ width: "36px", textAlign: "center", border: "none", background: "transparent", fontFamily: "var(--font-label)", fontWeight: 700, fontSize: "1.1rem" }}
                  />
                  <span style={{ fontFamily: "var(--font-label)", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>
                    &nbsp;/&nbsp;<Num>{REVIEW2_MAX}</Num>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReview2Marks((m) => Math.min(REVIEW2_MAX, m + 1));
                      setHasUnsavedChanges(true);
                    }}
                    disabled={review2Marks >= REVIEW2_MAX}
                    style={{ width: "24px", height: "24px", border: "1px solid var(--ink)", background: "transparent", cursor: "pointer", fontWeight: 700 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Round 2 Comments */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  htmlFor="r2Comments"
                  style={{
                    display: "block",
                    fontFamily: "var(--font-label)",
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "0.25rem",
                    fontWeight: 700,
                  }}
                >
                  Round 2 Notes & Comments
                </label>
                <textarea
                  id="r2Comments"
                  rows={4}
                  className="newspaper-textarea"
                  value={review2Comments}
                  onChange={(e) => {
                    setReview2Comments(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  style={{ resize: "vertical", fontSize: "0.92rem" }}
                />
                <div style={{ fontSize: "0.7rem", fontFamily: "var(--font-label)", textAlign: "right", color: "var(--ink-soft)" }}>
                  <Num>{review2Comments.length}</Num> / <Num>1000</Num>
                </div>
              </div>

              {/* Round 2 Decision Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowSelectModal(true)}
                  disabled={submitting}
                  className="stamp-btn"
                  style={{ width: "100%", fontSize: "0.78rem" }}
                >
                  Select Candidate
                </button>
                <button
                  type="button"
                  onClick={() => { setRejectCommentsError(null); setShowRejectModal(true); }}
                  disabled={submitting}
                  className="ink-btn-secondary"
                  style={{ width: "100%", fontSize: "0.78rem", color: "var(--stamp)", borderColor: "var(--stamp)" }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setShowSendBackModal(true)}
                  disabled={submitting}
                  className="ink-btn-secondary"
                  style={{ width: "100%", fontSize: "0.78rem" }}
                >
                  Send Back to Slot Choosing
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraftR2}
                  disabled={submitting}
                  className="ink-btn-secondary"
                  style={{ width: "100%", fontSize: "0.78rem" }}
                >
                  Save Draft
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile Sticky Bottom Bar for Marks & Decisions */}
      <div className="mobile-review-sticky-bar">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
          <div>
            <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-label)", textTransform: "uppercase", color: "var(--ink-soft)", letterSpacing: "0.08em" }}>
              Total Score
            </span>
            <div style={{ fontFamily: "var(--font-headline)", fontSize: "1.25rem", lineHeight: 1, color: "var(--ink)" }}>
              <Num>{currentTotalMarks}</Num> / <Num>{totalMaxMarks}</Num>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const aside = document.querySelector(".review-desk-aside");
              if (aside) aside.scrollIntoView({ behavior: "smooth" });
            }}
            className="stamp-btn"
            style={{ fontSize: "0.75rem", padding: "0.45rem 0.85rem", whiteSpace: "nowrap" }}
          >
            Review Decisions ➔
          </button>
        </div>
      </div>

      {/* CONFIRM MODALS */}
      {/* Reject Modal (Round 2) */}
      <ConfirmModal
        isOpen={showRejectModal}
        title="Reject Application"
        message="The candidate will see that they were not taken forward. Any booked interview slot is released."
        confirmLabel="Confirm Rejection"
        isDestructive={true}
        onConfirm={handleConfirmRejectRound2}
        onCancel={() => setShowRejectModal(false)}
      >
        {rejectCommentsError && (
          <div style={{ color: "var(--stamp)", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
            ✦ {rejectCommentsError}
          </div>
        )}
      </ConfirmModal>

      {/* Select Modal */}
      <ConfirmModal
        isOpen={showSelectModal}
        title="Select Candidate"
        message="This candidate will be marked as SELECTED for membership. This decision is final."
        confirmLabel="Confirm Selection"
        onConfirm={handleConfirmSelect}
        onCancel={() => setShowSelectModal(false)}
      />

      {/* Send Back Modal */}
      <ConfirmModal
        isOpen={showSendBackModal}
        title="Return to Slot Choosing"
        message="The candidate's current interview booking will be cancelled and the slot freed. The candidate must choose a new slot."
        confirmLabel="Confirm Return to Slots"
        onConfirm={handleConfirmSendBack}
        onCancel={() => setShowSendBackModal(false)}
      />

      {/* Unsaved Changes Guard Modal */}
      <ConfirmModal
        isOpen={showUnsavedModal}
        title="Unsaved Changes"
        message="You have unsaved marks or comments. Discard changes and leave this review desk?"
        confirmLabel="Discard & Leave"
        cancelLabel="Stay on Page"
        isDestructive={true}
        onConfirm={() => {
          setShowUnsavedModal(false);
          setHasUnsavedChanges(false);
          if (pendingNavigationUrl) router.push(pendingNavigationUrl);
        }}
        onCancel={() => {
          setShowUnsavedModal(false);
          setPendingNavigationUrl(null);
        }}
      />
    </div>
  );
}
