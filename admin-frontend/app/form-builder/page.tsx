"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { Num } from "@/components/Num";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/TickerToast";
import { api } from "@/lib/client";
import {
  Subsection,
  Question,
  DomainEnum,
  DOMAINS,
  DOMAIN_LABELS,
} from "@/lib/types";
import { FORM_EDIT_SUPPORTED } from "@/lib/config";

export default function FormBuilderPage() {
  return (
    <AuthGuard>
      <AdminShell>
        <FormBuilderContent />
      </AdminShell>
    </AuthGuard>
  );
}

function FormBuilderContent() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isRoot = user?.role === "ROOT_ADMIN";
  const userDomain = user?.domain;

  const [selectedDomain, setSelectedDomain] = useState<DomainEnum>(
    (userDomain as DomainEnum) || "TECHNICAL"
  );

  useEffect(() => {
    if (!isRoot && userDomain) {
      setSelectedDomain(userDomain as DomainEnum);
    }
  }, [isRoot, userDomain]);

  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Candidate Preview Mode
  const [previewAsCandidate, setPreviewAsCandidate] = useState(false);

  // Add Subsection State
  const [showAddSubModal, setShowAddSubModal] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [newSubOrder, setNewSubOrder] = useState<number>(1);
  const [submittingSub, setSubmittingSub] = useState(false);

  // Add Question State
  const [showAddQModal, setShowAddQModal] = useState(false);
  const [newQText, setNewQText] = useState("");
  const [newQSubId, setNewQSubId] = useState<string>("");
  const [newQRequired, setNewQRequired] = useState(true);
  const [newQMaxLength, setNewQMaxLength] = useState<number>(2000);
  const [newQMaxMarks, setNewQMaxMarks] = useState<number>(10);
  const [newQOrder, setNewQOrder] = useState<number>(1);
  const [submittingQ, setSubmittingQ] = useState(false);

  // Delete Item State
  const [itemToDelete, setItemToDelete] = useState<{ type: "question" | "subsection"; id: string; name: string } | null>(null);

  // Fetch form data
  const loadForm = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getForm(selectedDomain);
      setSubsections((data.subsections || []).sort((a, b) => a.order - b.order));
      setQuestions((data.questions || []).sort((a, b) => a.order - b.order));
    } catch (err: any) {
      setError(err.message || "Failed to load questionnaire.");
    } finally {
      setLoading(false);
    }
  }, [selectedDomain]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  // Total Marks Calculation
  const totalMaxMarks = useMemo(() => {
    return questions.reduce((sum, q) => sum + (q.maxMarks || 0), 0);
  }, [questions]);

  // Group Questions by Subsection
  const groupedSections = useMemo(() => {
    const list: { subsection: Subsection | null; questions: Question[] }[] = [];

    // Map by subsection ID
    const map = new Map<string, Question[]>();
    const general: Question[] = [];

    questions.forEach((q) => {
      if (q.subsectionId) {
        if (!map.has(q.subsectionId)) map.set(q.subsectionId, []);
        map.get(q.subsectionId)!.push(q);
      } else {
        general.push(q);
      }
    });

    // Add defined subsections
    subsections.forEach((sub) => {
      list.push({
        subsection: sub,
        questions: (map.get(sub.id) || []).sort((a, b) => a.order - b.order),
      });
    });

    // Add general / unassigned if any
    if (general.length > 0) {
      list.push({
        subsection: null,
        questions: general.sort((a, b) => a.order - b.order),
      });
    }

    return list;
  }, [subsections, questions]);

  // Handle Add Subsection
  const handleCreateSubsection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubName.trim().length < 2 || newSubName.trim().length > 80) {
      showToast("Subsection title must be between 2 and 80 characters.", "error");
      return;
    }
    setSubmittingSub(true);
    try {
      await api.createSubsection(newSubName.trim(), selectedDomain, newSubOrder);
      showToast(`Subsection "${newSubName.trim()}" created.`, "success");
      setNewSubName("");
      setShowAddSubModal(false);
      loadForm();
    } catch (err: any) {
      showToast(err.message || "Failed to create subsection.", "error");
    } finally {
      setSubmittingSub(false);
    }
  };

  // Handle Add Question
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newQText.trim().length < 5 || newQText.trim().length > 1000) {
      showToast("Question prompt must be between 5 and 1000 characters.", "error");
      return;
    }
    if (newQMaxLength < 100 || newQMaxLength > 10000) {
      showToast("Max length must be between 100 and 10000 characters.", "error");
      return;
    }
    if (newQMaxMarks < 1 || newQMaxMarks > 100) {
      showToast("Max marks must be between 1 and 100.", "error");
      return;
    }

    setSubmittingQ(true);
    try {
      await api.createQuestion({
        text: newQText.trim(),
        domain: selectedDomain,
        subsectionId: newQSubId || null,
        required: newQRequired,
        maxLength: newQMaxLength,
        maxMarks: newQMaxMarks,
        order: newQOrder,
      });
      showToast("New examination question added.", "success");
      setNewQText("");
      setShowAddQModal(false);
      loadForm();
    } catch (err: any) {
      showToast(err.message || "Failed to create question.", "error");
    } finally {
      setSubmittingQ(false);
    }
  };

  // Handle Delete Item
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === "question") {
        await api.deleteQuestion(itemToDelete.id);
        showToast("Question removed.", "success");
      } else {
        await api.deleteSubsection(itemToDelete.id);
        showToast("Subsection removed.", "success");
      }
      setItemToDelete(null);
      loadForm();
    } catch (err: any) {
      showToast(err.message || "Failed to delete item.", "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Delete Item Modal */}
      <ConfirmModal
        isOpen={!!itemToDelete}
        title={`Delete ${itemToDelete?.type === "question" ? "Question" : "Subsection"}`}
        message={`Are you sure you want to remove "${itemToDelete?.name}"? Any candidates currently completing this form will no longer see this item.`}
        confirmLabel="Confirm Delete"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Add Subsection Modal */}
      <ConfirmModal
        isOpen={showAddSubModal}
        title="Add Questionnaire Subsection"
        message="Create a new themed section to group related candidate prompts."
        confirmLabel={submittingSub ? "Creating..." : "Save Subsection"}
        onConfirm={() => {
          const form = document.getElementById("subForm") as HTMLFormElement;
          if (form) form.requestSubmit();
        }}
        onCancel={() => setShowAddSubModal(false)}
      >
        <form id="subForm" onSubmit={handleCreateSubsection} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
              Subsection Title (2 to 80 chars)
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              className="newspaper-input"
              style={{ width: "100%", padding: "0.45rem 0.6rem" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
              Display Order
            </label>
            <input
              type="number"
              min={1}
              value={newSubOrder}
              onChange={(e) => setNewSubOrder(Number(e.target.value))}
              className="newspaper-input"
              style={{ width: "100px", padding: "0.45rem 0.6rem" }}
            />
          </div>
        </form>
      </ConfirmModal>

      {/* Add Question Modal */}
      <ConfirmModal
        isOpen={showAddQModal}
        title="Add Examination Question"
        message="Draft a new prompt for candidate assessment."
        confirmLabel={submittingQ ? "Saving..." : "Add Question"}
        onConfirm={() => {
          const form = document.getElementById("qForm") as HTMLFormElement;
          if (form) form.requestSubmit();
        }}
        onCancel={() => setShowAddQModal(false)}
      >
        <form id="qForm" onSubmit={handleCreateQuestion} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
              Prompt Text (5 to 1000 chars)
            </label>
            <textarea
              required
              rows={3}
              minLength={5}
              maxLength={1000}
              value={newQText}
              onChange={(e) => setNewQText(e.target.value)}
              className="newspaper-textarea"
              style={{ width: "100%", padding: "0.45rem 0.6rem" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                Subsection
              </label>
              <select
                value={newQSubId}
                onChange={(e) => setNewQSubId(e.target.value)}
                className="newspaper-select"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              >
                <option value="">General / None</option>
                {subsections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                Order
              </label>
              <input
                type="number"
                min={1}
                value={newQOrder}
                onChange={(e) => setNewQOrder(Number(e.target.value))}
                className="newspaper-input"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                Max Marks (1 to 100)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={newQMaxMarks}
                onChange={(e) => setNewQMaxMarks(Number(e.target.value))}
                className="newspaper-input"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                Max Length (Chars)
              </label>
              <input
                type="number"
                min={100}
                max={10000}
                value={newQMaxLength}
                onChange={(e) => setNewQMaxLength(Number(e.target.value))}
                className="newspaper-input"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <input
              id="newQReq"
              type="checkbox"
              checked={newQRequired}
              onChange={(e) => setNewQRequired(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "var(--stamp)" }}
            />
            <label htmlFor="newQReq" style={{ fontFamily: "var(--font-label)", fontSize: "0.82rem", cursor: "pointer" }}>
              Required response from candidate
            </label>
          </div>
        </form>
      </ConfirmModal>

      {/* Header section */}
      <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span className="kicker">✦ EDITORIAL COMMISSION ✦</span>
            <h1 className="headline" style={{ fontSize: "2.4rem", margin: "0.25rem 0 0.4rem 0" }}>
              Question Desk
            </h1>
            <p className="deck" style={{ margin: 0, maxWidth: "700px" }}>
              Manage recruitment questions, assessment rubrics, and examination subsections.
            </p>
          </div>

          {/* Division Scoreboard */}
          <div
            style={{
              padding: "0.6rem 1.25rem",
              border: "2px solid var(--ink)",
              backgroundColor: "rgba(28, 22, 19, 0.03)",
              textAlign: "right",
            }}
          >
            <span style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-soft)" }}>
              Division Total Evaluation
            </span>
            <span style={{ fontFamily: "var(--font-headline)", fontSize: "1.7rem", color: "var(--ink)" }}>
              <Num>{totalMaxMarks}</Num> Marks
            </span>
            <div style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              Across <Num>{questions.length}</Num> questions
            </div>
          </div>
        </div>

        {/* Division Switch (Root Only) */}
        {isRoot && (
          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>
              Division:
            </span>
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

      {/* Warning Banner */}
      <div
        style={{
          border: "2px solid var(--stamp)",
          backgroundColor: "rgba(139, 30, 30, 0.04)",
          padding: "0.75rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <span style={{ color: "var(--stamp)", fontSize: "1.2rem", fontWeight: 700 }}>✦</span>
        <div style={{ fontSize: "0.85rem", fontFamily: "var(--font-label)" }}>
          <strong>EDITORIAL WARNING:</strong> Changing questions after people have started applying can confuse them or invalidate existing submissions.
        </div>
      </div>

      {/* Action Bar (Add Subsection, Add Question, Preview Toggle) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          borderBottom: "1px solid var(--ink)",
          paddingBottom: "0.75rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => {
              setNewSubOrder(subsections.length + 1);
              setShowAddSubModal(true);
            }}
            className="ink-btn-secondary"
            style={{ fontSize: "0.78rem" }}
          >
            + Add Subsection
          </button>
          <button
            type="button"
            onClick={() => {
              setNewQOrder(questions.length + 1);
              setShowAddQModal(true);
            }}
            className="stamp-btn"
            style={{ fontSize: "0.78rem" }}
          >
            + Add Question
          </button>
        </div>

        {/* Candidate Preview Toggle */}
        <button
          type="button"
          onClick={() => setPreviewAsCandidate(!previewAsCandidate)}
          className="ink-btn"
          style={{ fontSize: "0.78rem" }}
        >
          {previewAsCandidate ? "← Exit Preview" : "Preview as Candidate ✦"}
        </button>
      </div>

      {/* Content Rendering */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Skeleton height="100px" />
          <Skeleton height="150px" />
          <Skeleton height="150px" />
        </div>
      ) : error ? (
        <EmptyState
          title="Error loading form"
          description={error}
          actionLabel="Retry"
          onClear={loadForm}
        />
      ) : questions.length === 0 ? (
        <EmptyState
          title="No questions drafted"
          description="There are currently no examination questions drafted for this division."
          actionLabel="Draft First Question"
          onClear={() => setShowAddQModal(true)}
        />
      ) : previewAsCandidate ? (
        /* CANDIDATE PREVIEW MODE */
        <div
          style={{
            border: "2px solid var(--ink)",
            padding: "2rem",
            backgroundColor: "var(--paper)",
            display: "flex",
            flexDirection: "column",
            gap: "2rem",
          }}
        >
          <div style={{ borderBottom: "1px dashed var(--ink)", paddingBottom: "0.5rem", textAlign: "center" }}>
            <span className="kicker">✦ CANDIDATE EXAMINATION VIEW · {DOMAIN_LABELS[selectedDomain].toUpperCase()} ✦</span>
            <h2 className="headline" style={{ fontSize: "2rem", margin: "0.3rem 0" }}>
              Application Questionnaire
            </h2>
            <p className="deck" style={{ margin: 0 }}>
              Answer all prompts truthfully and concisely.
            </p>
          </div>

          {groupedSections.map(({ subsection, questions: sectionQs }, sIdx) => (
            <div key={subsection?.id || "general"} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {subsection && (
                <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "0.25rem" }}>
                  <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.5rem", margin: 0, textTransform: "uppercase" }}>
                    Part <Num>{sIdx + 1}</Num>: {subsection.name}
                  </h3>
                </div>
              )}

              {sectionQs.map((q, qIdx) => (
                <div
                  key={q.id}
                  style={{
                    border: "1px solid var(--ink)",
                    padding: "1.25rem",
                    backgroundColor: "rgba(28, 22, 19, 0.015)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
                    <span style={{ fontFamily: "var(--font-label)", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 700 }}>
                      Question <Num>{q.order || qIdx + 1}</Num> · <Num>{q.maxMarks}</Num> Marks
                    </span>
                    {q.required && (
                      <span style={{ fontFamily: "var(--font-label)", fontSize: "0.72rem", color: "var(--stamp)", textTransform: "uppercase", fontWeight: 700 }}>
                        ✦ Required
                      </span>
                    )}
                  </div>

                  <div style={{ fontFamily: "var(--font-body)", fontSize: "1.1rem", lineHeight: 1.4, color: "var(--ink)" }}>
                    {q.text}
                  </div>

                  <textarea
                    disabled
                    rows={4}
                    className="newspaper-textarea"
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      backgroundColor: "rgba(28, 22, 19, 0.02)",
                      cursor: "not-allowed",
                      fontFamily: "var(--font-body)",
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: "var(--font-label)", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                    <Num>0</Num> / <Num>{q.maxLength || 2000}</Num> characters
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* ADMIN EDIT MODE */
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {groupedSections.map(({ subsection, questions: sectionQs }, sIdx) => (
            <div
              key={subsection?.id || "general"}
              className="paper"
              style={{
                border: "2px solid var(--ink)",
                padding: "1.25rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              {/* Subsection Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--ink)", paddingBottom: "0.4rem" }}>
                <div>
                  <span className="kicker" style={{ marginBottom: "0.15rem" }}>
                    ✦ SUBSECTION <Num>{subsection?.order || sIdx + 1}</Num> ✦
                  </span>
                  <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.5rem", margin: 0, textTransform: "uppercase" }}>
                    {subsection ? subsection.name : "General Questions"}
                  </h3>
                </div>

                {subsection && (
                  <button
                    type="button"
                    disabled={!FORM_EDIT_SUPPORTED}
                    title={FORM_EDIT_SUPPORTED ? "Remove subsection" : "Editing questions is disabled after recruitment begins."}
                    onClick={() => setItemToDelete({ type: "subsection", id: subsection.id, name: subsection.name })}
                    style={{
                      background: "none",
                      border: "none",
                      color: FORM_EDIT_SUPPORTED ? "var(--stamp)" : "var(--ink-soft)",
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-label)",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      cursor: FORM_EDIT_SUPPORTED ? "pointer" : "not-allowed",
                      opacity: FORM_EDIT_SUPPORTED ? 1 : 0.4,
                      textDecoration: "underline",
                    }}
                  >
                    Delete Subsection
                  </button>
                )}
              </div>

              {/* Questions List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {sectionQs.length === 0 ? (
                  <div style={{ fontStyle: "italic", fontSize: "0.85rem", color: "var(--ink-soft)", padding: "0.5rem 0" }}>
                    No questions in this subsection.
                  </div>
                ) : (
                  sectionQs.map((q, qIdx) => (
                    <div
                      key={q.id}
                      style={{
                        border: "1px solid var(--ink)",
                        padding: "1rem 1.25rem",
                        backgroundColor: "rgba(28, 22, 19, 0.015)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        gap: "1rem",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: "260px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                          <span style={{ fontFamily: "var(--font-label)", fontWeight: 700, fontSize: "0.8rem", textTransform: "uppercase" }}>
                            Question <Num>{q.order || qIdx + 1}</Num>
                          </span>
                          {q.required && (
                            <span
                              style={{
                                fontFamily: "var(--font-label)",
                                fontSize: "0.68rem",
                                textTransform: "uppercase",
                                padding: "0.1rem 0.35rem",
                                border: "1px solid var(--stamp)",
                                color: "var(--stamp)",
                                fontWeight: 700,
                              }}
                            >
                              Required
                            </span>
                          )}
                          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                            · <Num>{q.maxMarks}</Num> Marks
                          </span>
                          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                            · Max <Num>{q.maxLength || 2000}</Num> Chars
                          </span>
                        </div>

                        <div style={{ fontFamily: "var(--font-body)", fontSize: "1.05rem", lineHeight: 1.35, color: "var(--ink)" }}>
                          {q.text}
                        </div>
                      </div>

                      {/* Question Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <button
                          type="button"
                          disabled={!FORM_EDIT_SUPPORTED}
                          title={FORM_EDIT_SUPPORTED ? "Remove question" : "Editing questions is disabled after recruitment begins."}
                          onClick={() => setItemToDelete({ type: "question", id: q.id, name: q.text.slice(0, 30) + "..." })}
                          className="ink-btn-secondary"
                          style={{
                            fontSize: "0.72rem",
                            padding: "0.25rem 0.5rem",
                            color: FORM_EDIT_SUPPORTED ? "var(--stamp)" : "var(--ink-soft)",
                            cursor: FORM_EDIT_SUPPORTED ? "pointer" : "not-allowed",
                            opacity: FORM_EDIT_SUPPORTED ? 1 : 0.4,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
