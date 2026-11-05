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

  useEffect(() => {
    document.title = "Question Desk · The TAM Times Admin";
  }, []);

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
  const [newQMaxMarks, setNewQMaxMarks] = useState<number>(10);
  const [newQOrder, setNewQOrder] = useState<number>(1);
  const [submittingQ, setSubmittingQ] = useState(false);

  // Edit Subsection State
  const [editingSub, setEditingSub] = useState<Subsection | null>(null);
  const [editSubName, setEditSubName] = useState("");
  const [editSubOrder, setEditSubOrder] = useState<number>(1);
  const [submittingEditSub, setSubmittingEditSub] = useState(false);

  // Edit Question State
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [editQText, setEditQText] = useState("");
  const [editQSubId, setEditQSubId] = useState<string>("");
  const [editQRequired, setEditQRequired] = useState(true);
  const [editQMaxMarks, setEditQMaxMarks] = useState<number>(10);
  const [editQOrder, setEditQOrder] = useState<number>(1);
  const [submittingEditQ, setSubmittingEditQ] = useState(false);

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
    if (!newSubName.trim()) {
      showToast("Subsection title is required.", "error");
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

  // Handle Update Subsection
  const handleUpdateSubsection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub || !editSubName.trim()) {
      showToast("Subsection title is required.", "error");
      return;
    }
    setSubmittingEditSub(true);
    try {
      await api.updateSubsection(editingSub.id, editSubName.trim(), editSubOrder);
      showToast(`Subsection "${editSubName.trim()}" updated.`, "success");
      setEditingSub(null);
      loadForm();
    } catch (err: any) {
      if (err?.code === "QUESTION_HAS_ANSWERS" || err?.message?.includes("QUESTION_HAS_ANSWERS")) {
        showToast("Cannot modify: candidates have already submitted answers in this subsection.", "error");
      } else {
        showToast(err.message || "Failed to update subsection.", "error");
      }
    } finally {
      setSubmittingEditSub(false);
    }
  };

  // Handle Add Question
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQText.trim()) {
      showToast("Question prompt is required.", "error");
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
        maxLength: 100000,
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

  // Handle Update Question
  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQ || !editQText.trim()) {
      showToast("Question prompt is required.", "error");
      return;
    }
    if (editQMaxMarks < 1 || editQMaxMarks > 100) {
      showToast("Max marks must be between 1 and 100.", "error");
      return;
    }

    setSubmittingEditQ(true);
    try {
      await api.updateQuestion(editingQ.id, {
        text: editQText.trim(),
        subsectionId: editQSubId || null,
        required: editQRequired,
        maxMarks: editQMaxMarks,
        order: editQOrder,
      });
      showToast("Examination question updated.", "success");
      setEditingQ(null);
      loadForm();
    } catch (err: any) {
      if (err?.code === "QUESTION_HAS_ANSWERS" || err?.message?.includes("QUESTION_HAS_ANSWERS")) {
        showToast("Cannot modify: candidates have already submitted answers for this question.", "error");
      } else {
        showToast(err.message || "Failed to update question.", "error");
      }
    } finally {
      setSubmittingEditQ(false);
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
      if (err?.code === "QUESTION_HAS_ANSWERS" || err?.message?.includes("QUESTION_HAS_ANSWERS")) {
        showToast("Cannot delete: candidates have already submitted answers for this item.", "error");
      } else {
        showToast(err.message || "Failed to delete item.", "error");
      }
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
              Subsection Title
            </label>
            <input
              type="text"
              required
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

      {/* Edit Subsection Modal */}
      <ConfirmModal
        isOpen={!!editingSub}
        title="Edit Subsection"
        message="Update the title or order for this questionnaire section."
        confirmLabel={submittingEditSub ? "Saving..." : "Update Subsection"}
        onConfirm={() => {
          const form = document.getElementById("editSubForm") as HTMLFormElement;
          if (form) form.requestSubmit();
        }}
        onCancel={() => setEditingSub(null)}
      >
        <form id="editSubForm" onSubmit={handleUpdateSubsection} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
              Subsection Title
            </label>
            <input
              type="text"
              required
              value={editSubName}
              onChange={(e) => setEditSubName(e.target.value)}
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
              value={editSubOrder}
              onChange={(e) => setEditSubOrder(Number(e.target.value))}
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
              Prompt Text
            </label>
            <textarea
              required
              rows={3}
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

      {/* Edit Question Modal */}
      <ConfirmModal
        isOpen={!!editingQ}
        title="Edit Examination Question"
        message="Update the question prompt, subsection, marks, or display order."
        confirmLabel={submittingEditQ ? "Saving..." : "Update Question"}
        onConfirm={() => {
          const form = document.getElementById("editQForm") as HTMLFormElement;
          if (form) form.requestSubmit();
        }}
        onCancel={() => setEditingQ(null)}
      >
        <form id="editQForm" onSubmit={handleUpdateQuestion} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
              Prompt Text
            </label>
            <textarea
              required
              rows={3}
              value={editQText}
              onChange={(e) => setEditQText(e.target.value)}
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
                value={editQSubId}
                onChange={(e) => setEditQSubId(e.target.value)}
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
                value={editQOrder}
                onChange={(e) => setEditQOrder(Number(e.target.value))}
                className="newspaper-input"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
              Max Marks (1 to 100)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={editQMaxMarks}
              onChange={(e) => setEditQMaxMarks(Number(e.target.value))}
              className="newspaper-input"
              style={{ width: "100%", padding: "0.45rem 0.6rem" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <input
              id="editQReq"
              type="checkbox"
              checked={editQRequired}
              onChange={(e) => setEditQRequired(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "var(--stamp)" }}
            />
            <label htmlFor="editQReq" style={{ fontFamily: "var(--font-label)", fontSize: "0.82rem", cursor: "pointer" }}>
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
            <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-label)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-soft)", marginTop: "0.35rem" }}>
              Candidates can write answers of any length · No character limit
            </div>
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
                    Response text
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
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSub(subsection);
                        setEditSubName(subsection.name);
                        setEditSubOrder(subsection.order || sIdx + 1);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--ink)",
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-label)",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Edit Subsection
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemToDelete({ type: "subsection", id: subsection.id, name: subsection.name })}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--stamp)",
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-label)",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Delete Subsection
                    </button>
                  </div>
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
                        </div>

                        <div style={{ fontFamily: "var(--font-body)", fontSize: "1.05rem", lineHeight: 1.35, color: "var(--ink)" }}>
                          {q.text}
                        </div>
                      </div>

                      {/* Question Actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQ(q);
                            setEditQText(q.text);
                            setEditQSubId(q.subsectionId || "");
                            setEditQRequired(Boolean(q.required));
                            setEditQMaxMarks(q.maxMarks || 10);
                            setEditQOrder(q.order || qIdx + 1);
                          }}
                          className="ink-btn-secondary"
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.3rem 0.7rem",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ✎ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemToDelete({ type: "question", id: q.id, name: q.text.slice(0, 30) + "..." })}
                          className="ink-btn-secondary"
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.3rem 0.7rem",
                            fontWeight: 700,
                            color: "var(--stamp)",
                            borderColor: "var(--stamp)",
                            cursor: "pointer",
                          }}
                        >
                          ✕ Delete
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
