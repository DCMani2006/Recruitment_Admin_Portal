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
  Slot,
  Application,
  DomainEnum,
  DOMAINS,
  DOMAIN_LABELS,
} from "@/lib/types";
import {
  formatDate,
  formatTime,
  SLOT_DELETE_SUPPORTED,
  TIMEZONE,
} from "@/lib/config";

interface DailyWindow {
  id: string;
  start: string; // "10:00"
  end: string;   // "13:00"
}

interface WindowTask {
  dayStr: string;
  dateLabel: string;
  window: DailyWindow;
  startISO: string;
  endISO: string;
  slotCount: number;
}

export default function SlotPlannerPage() {
  return (
    <AuthGuard>
      <AdminShell>
        <SlotPlannerContent />
      </AdminShell>
    </AuthGuard>
  );
}

function SlotPlannerContent() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isRoot = user?.role === "ROOT_ADMIN";
  const userDomain = user?.domain;

  // Selected Division (Root can change; Domain Heads locked)
  const [selectedDomain, setSelectedDomain] = useState<DomainEnum>(
    (userDomain as DomainEnum) || "TECHNICAL"
  );

  // Form State
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [windows, setWindows] = useState<DailyWindow[]>([
    { id: "win-1", start: "10:00", end: "13:00" },
  ]);
  const [slotLength, setSlotLength] = useState<number>(15);
  const [skipWeekends, setSkipWeekends] = useState<boolean>(true);
  const [meetingLink, setMeetingLink] = useState<string>("https://meet.google.com/tam-interview");
  const [capacity, setCapacity] = useState<number>(1);

  // Existing schedule data & candidates
  const [slots, setSlots] = useState<Slot[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  // Sequential Submission & Progress
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [failedTasks, setFailedTasks] = useState<WindowTask[]>([]);

  // Week Grid Navigation
  const [weekOffset, setWeekOffset] = useState<number>(0); // 0 = current week

  // Delete Slot Modal State
  const [slotToDelete, setSlotToDelete] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Set default dates to today & 7 days from today in Asia/Kolkata
  useEffect(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    const todayStr = `${y}-${m}-${d}`;
    setFromDate(todayStr);

    const sevenDaysLater = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    const endParts = formatter.formatToParts(sevenDaysLater);
    const ey = endParts.find((p) => p.type === "year")?.value;
    const em = endParts.find((p) => p.type === "month")?.value;
    const ed = endParts.find((p) => p.type === "day")?.value;
    setToDate(`${ey}-${em}-${ed}`);
  }, []);

  // Fetch schedule and applications for division
  const loadData = useCallback(async () => {
    setLoadingSchedule(true);
    try {
      const adminId = isRoot ? "ALL" : user?.id || "ALL";
      const [scheduleData, appsData] = await Promise.all([
        api.getSchedule(adminId, true, selectedDomain),
        api.getApplicants(selectedDomain),
      ]);
      setSlots(scheduleData || []);
      setApplications(appsData || []);
    } catch {
      showToast("Failed to refresh schedule.", "error");
    } finally {
      setLoadingSchedule(false);
    }
  }, [isRoot, user?.id, selectedDomain, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Window Management
  const addWindow = () => {
    if (windows.length >= 4) return;
    const nextStart = windows.length === 1 ? "15:00" : "18:00";
    const nextEnd = windows.length === 1 ? "18:00" : "20:00";
    setWindows((prev) => [
      ...prev,
      { id: `win-${Date.now()}`, start: nextStart, end: nextEnd },
    ]);
  };

  const removeWindow = (id: string) => {
    if (windows.length <= 1) return;
    setWindows((prev) => prev.filter((w) => w.id !== id));
  };

  const updateWindow = (id: string, field: "start" | "end", val: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: val } : w))
    );
  };

  // Form Validations
  const formValidationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!fromDate || !toDate) {
      errors.push("Both start and end dates are required.");
    } else {
      if (toDate < fromDate) {
        errors.push("End date cannot be earlier than start date.");
      }
      const dFrom = new Date(fromDate);
      const dTo = new Date(toDate);
      const diffDays = Math.round((dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 31) {
        errors.push("Date range cannot exceed 31 days.");
      }
    }

    if (!meetingLink || !meetingLink.startsWith("https://")) {
      errors.push("A valid meeting link beginning with https:// is required.");
    }

    // Windows validation
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (!w.start || !w.end) {
        errors.push(`Window ${i + 1} has incomplete times.`);
        continue;
      }
      if (w.start >= w.end) {
        errors.push(`Window ${i + 1}: Start time must be before end time.`);
      }
      const [sh, sm] = w.start.split(":").map(Number);
      const [eh, em] = w.end.split(":").map(Number);
      const durationMins = (eh * 60 + em) - (sh * 60 + sm);
      if (durationMins < slotLength) {
        errors.push(`Window ${i + 1}: Duration (${durationMins}m) is shorter than slot length (${slotLength}m).`);
      }
    }

    // Check overlap between windows
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const w1 = windows[i];
        const w2 = windows[j];
        if (w1.start < w2.end && w2.start < w1.end) {
          errors.push(`Window ${i + 1} and Window ${j + 1} overlap.`);
        }
      }
    }

    return errors;
  }, [fromDate, toDate, windows, slotLength, meetingLink]);

  // Compute Task List & Live Preview
  const { generatedTasks, totalSlotsCount, dayBreakdown, overlappingExistingCount } = useMemo(() => {
    if (formValidationErrors.length > 0 || !fromDate || !toDate) {
      return { generatedTasks: [], totalSlotsCount: 0, dayBreakdown: [], overlappingExistingCount: 0 };
    }

    const tasks: WindowTask[] = [];
    const breakdown: { dayLabel: string; windowLabel: string; count: number }[] = [];
    let totalSlots = 0;

    const cur = new Date(fromDate);
    const end = new Date(toDate);

    // Existing slot start times map for overlap detection
    const existingStartMap = new Set(
      slots.map((s) => new Date(s.startTime).toISOString())
    );
    let overlapCount = 0;

    while (cur <= end) {
      const dayOfWeek = cur.getDay(); // 0 = Sun, 6 = Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (!skipWeekends || !isWeekend) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        const dayStr = `${y}-${m}-${d}`;
        const dateLabel = formatDate(cur);

        windows.forEach((win) => {
          const [sh, sm] = win.start.split(":").map(Number);
          const [eh, em] = win.end.split(":").map(Number);
          const winDuration = (eh * 60 + em) - (sh * 60 + sm);
          const count = Math.floor(winDuration / slotLength);

          // Build explicit IST strings
          const startISO = `${dayStr}T${win.start}:00+05:30`;
          const endISO = `${dayStr}T${win.end}:00+05:30`;

          // Check individual slot starts for overlap
          const startMs = new Date(startISO).getTime();
          const stepMs = slotLength * 60 * 1000;
          for (let t = startMs; t + stepMs <= new Date(endISO).getTime(); t += stepMs) {
            if (existingStartMap.has(new Date(t).toISOString())) {
              overlapCount++;
            }
          }

          if (count > 0) {
            tasks.push({
              dayStr,
              dateLabel,
              window: win,
              startISO,
              endISO,
              slotCount: count,
            });

            breakdown.push({
              dayLabel: dateLabel,
              windowLabel: `${win.start} to ${win.end}`,
              count,
            });
            totalSlots += count;
          }
        });
      }

      cur.setDate(cur.getDate() + 1);
    }

    return {
      generatedTasks: tasks,
      totalSlotsCount: totalSlots,
      dayBreakdown: breakdown,
      overlappingExistingCount: overlapCount,
    };
  }, [fromDate, toDate, windows, slotLength, skipWeekends, slots, formValidationErrors]);

  // Candidates waiting to book (SHORTLISTED & SLOT_CHOOSING)
  const waitingCandidates = useMemo(() => {
    return applications.filter(
      (a) => a.stage === "SHORTLISTED" || a.stage === "SLOT_CHOOSING"
    );
  }, [applications]);

  const openSlotsCount = useMemo(() => {
    return slots.filter((s) => !s.bookings || s.bookings.length === 0).length;
  }, [slots]);

  const bookedSlotsCount = useMemo(() => {
    return slots.filter((s) => s.bookings && s.bookings.length > 0).length;
  }, [slots]);

  // Sequential Submission
  const handleExecuteTasks = async (taskList: WindowTask[]) => {
    if (taskList.length === 0) return;
    setSubmitting(true);
    setFailedTasks([]);
    let completed = 0;
    const failed: WindowTask[] = [];

    for (let i = 0; i < taskList.length; i++) {
      const task = taskList[i];
      setProgressText(`Creating ${i + 1} of ${taskList.length}...`);
      setProgressPercent(Math.round(((i + 1) / taskList.length) * 100));

      try {
        await api.createSlots({
          domain: selectedDomain,
          startTime: task.startISO,
          endTime: task.endISO,
          durationMinutes: slotLength,
          capacity,
          meetingLink,
          interviewerId: user?.id,
        });
        completed++;
      } catch {
        failed.push(task);
      }
    }

    setSubmitting(false);
    setProgressText(null);
    setProgressPercent(0);

    if (failed.length > 0) {
      setFailedTasks(failed);
      showToast(`Created ${completed} batches, but ${failed.length} failed. Please retry failed tasks.`, "error");
    } else {
      showToast(`Successfully created all ${totalSlotsCount} slots.`, "success");
      loadData();
    }
  };

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formValidationErrors.length > 0) {
      showToast(formValidationErrors[0], "error");
      return;
    }
    handleExecuteTasks(generatedTasks);
  };

  // Delete Slot Handler
  const handleConfirmDeleteSlot = async () => {
    if (!slotToDelete || deleting) return;
    setDeleting(true);
    try {
      await api.deleteSlot(slotToDelete.id);
      showToast("Slot deleted successfully.", "success");
      setSlotToDelete(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete slot.", "error");
    } finally {
      setDeleting(false);
    }
  };

  // Week Grid Dates Calculation
  const weekDays = useMemo(() => {
    const now = new Date();
    // Move to base Monday of current week + offset
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + weekOffset * 7);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekOffset]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!slotToDelete}
        title="Delete Unbooked Slot"
        message={`Remove the unbooked slot on ${slotToDelete ? formatDate(slotToDelete.startTime) : ""} from ${slotToDelete ? formatTime(slotToDelete.startTime) : ""}? This availability will no longer be open to candidates.`}
        confirmLabel="Confirm Deletion"
        cancelLabel="Keep Slot"
        isDestructive={true}
        onConfirm={handleConfirmDeleteSlot}
        onCancel={() => setSlotToDelete(null)}
      />

      {/* Header section */}
      <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "1rem" }}>
        <span className="kicker">✦ RECRUITMENT TIMETABLE ✦</span>
        <h1 className="headline" style={{ fontSize: "2.4rem", margin: "0.25rem 0 0.4rem 0" }}>
          Slot Planner
        </h1>
        <p className="deck" style={{ margin: 0, maxWidth: "700px" }}>
          Generate interview availability across calendar dates and daily examination windows.
        </p>

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

      {/* Candidate Capacity Warning Banner */}
      {openSlotsCount < waitingCandidates.length && (
        <div
          style={{
            border: "2px solid var(--stamp)",
            backgroundColor: "rgba(139, 30, 30, 0.04)",
            padding: "0.85rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <span style={{ color: "var(--stamp)", fontSize: "1.2rem", fontWeight: 700 }}>✦</span>
          <div style={{ fontSize: "0.88rem", fontFamily: "var(--font-label)" }}>
            <strong>CAPACITY SHORTAGE:</strong> There are only <Num>{openSlotsCount}</Num> open slots, but{" "}
            <strong><Num>{waitingCandidates.length}</Num> candidates</strong> are waiting to book (
            <Num>{applications.filter((a) => a.stage === "SHORTLISTED").length}</Num> Shortlisted,{" "}
            <Num>{applications.filter((a) => a.stage === "SLOT_CHOOSING").length}</Num> Slot Choosing).
            Please publish additional slots.
          </div>
        </div>
      )}

      {/* MAIN LAYOUT: Form (Left) & Live Preview (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "1.5rem" }}>
        {/* Slot Creation Form */}
        <form
          onSubmit={handleInitialSubmit}
          className="paper"
          style={{
            border: "2px solid var(--ink)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div style={{ borderBottom: "1px solid var(--ink)", paddingBottom: "0.4rem" }}>
            <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.4rem", margin: 0, textTransform: "uppercase" }}>
              Publish New Interview Windows
            </h3>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              Division: {DOMAIN_LABELS[selectedDomain]}
            </span>
          </div>

          {/* Date Range Fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                required
                className="newspaper-input"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                required
                className="newspaper-input"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              />
            </div>
          </div>

          {/* Daily Time Windows */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
              <label style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>
                Daily Examination Windows (1 to 4)
              </label>
              {windows.length < 4 && (
                <button
                  type="button"
                  onClick={addWindow}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-label)",
                    textTransform: "uppercase",
                    color: "var(--stamp)",
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  + Add Window
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {windows.map((win, idx) => (
                <div key={win.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", minWidth: "22px", color: "var(--ink-soft)" }}>
                    {idx + 1}.
                  </span>
                  <input
                    type="time"
                    value={win.start}
                    onChange={(e) => updateWindow(win.id, "start", e.target.value)}
                    required
                    className="newspaper-input"
                    style={{ flex: 1, padding: "0.35rem 0.5rem" }}
                  />
                  <span>to</span>
                  <input
                    type="time"
                    value={win.end}
                    onChange={(e) => updateWindow(win.id, "end", e.target.value)}
                    required
                    className="newspaper-input"
                    style={{ flex: 1, padding: "0.35rem 0.5rem" }}
                  />
                  {windows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWindow(win.id)}
                      className="ink-btn-secondary"
                      style={{ fontSize: "0.7rem", padding: "0.25rem 0.45rem", color: "var(--stamp)" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Slot Length & Capacity */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                Slot Duration
              </label>
              <select
                value={slotLength}
                onChange={(e) => setSlotLength(Number(e.target.value))}
                className="newspaper-select"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              >
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes (Standard)</option>
                <option value={20}>20 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                Candidate Capacity
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Math.min(5, Number(e.target.value))))}
                className="newspaper-input"
                style={{ width: "100%", padding: "0.45rem 0.6rem" }}
              />
            </div>
          </div>

          {/* Meeting Link (ONE link, required HTTPS) */}
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.2rem" }}>
              Interview Room Link
            </label>
            <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginBottom: "0.25rem" }}>
              Must be a secure https URL (e.g. Google Meet, Zoom, or Teams)
            </div>
            <input
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              required
              className="newspaper-input"
              style={{ width: "100%", padding: "0.45rem 0.6rem" }}
            />
          </div>

          {/* Weekend Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              id="skipWeekends"
              type="checkbox"
              checked={skipWeekends}
              onChange={(e) => setSkipWeekends(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "var(--stamp)" }}
            />
            <label htmlFor="skipWeekends" style={{ fontFamily: "var(--font-label)", fontSize: "0.82rem", cursor: "pointer" }}>
              Skip weekends (exclude Saturdays and Sundays from schedule)
            </label>
          </div>

          {/* Validation Warnings */}
          {formValidationErrors.length > 0 && (
            <div style={{ color: "var(--stamp)", fontSize: "0.78rem", borderLeft: "2px solid var(--stamp)", paddingLeft: "0.6rem" }}>
              ✦ {formValidationErrors[0]}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || formValidationErrors.length > 0 || totalSlotsCount === 0}
            className="stamp-btn"
            style={{ width: "100%", padding: "0.65rem 1rem", fontSize: "0.88rem" }}
          >
            {submitting ? "Publishing Availability..." : `Publish ${totalSlotsCount} Slots`}
          </button>

          {/* Progress Indicator */}
          {submitting && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontFamily: "var(--font-label)" }}>
                <span>{progressText}</span>
                <span><Num>{progressPercent}</Num>%</span>
              </div>
              <div style={{ width: "100%", height: "6px", backgroundColor: "rgba(28, 22, 19, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ width: `${progressPercent}%`, height: "100%", backgroundColor: "var(--stamp)", transition: "width 0.2s" }} />
              </div>
            </div>
          )}

          {/* Retry Failed Tasks */}
          {failedTasks.length > 0 && !submitting && (
            <div style={{ border: "1px dashed var(--stamp)", padding: "0.75rem", backgroundColor: "rgba(139, 30, 30, 0.04)" }}>
              <div style={{ color: "var(--stamp)", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                ✦ {failedTasks.length} batch(es) failed to publish.
              </div>
              <button
                type="button"
                onClick={() => handleExecuteTasks(failedTasks)}
                className="stamp-btn"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
              >
                Retry Failed Batches
              </button>
            </div>
          )}
        </form>

        {/* Live Preview Panel */}
        <div
          className="paper"
          style={{
            border: "2px solid var(--ink)",
            padding: "1.25rem 1.5rem",
            backgroundColor: "rgba(28, 22, 19, 0.02)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div style={{ borderBottom: "1px solid var(--ink)", paddingBottom: "0.4rem" }}>
            <span className="kicker" style={{ marginBottom: "0.2rem" }}>✦ SCHEDULE PROJECTION ✦</span>
            <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.4rem", margin: 0, textTransform: "uppercase" }}>
              Live Slot Preview
            </h3>
          </div>

          {/* Summary Stat */}
          <div
            style={{
              padding: "0.8rem 1rem",
              border: "1px solid var(--ink)",
              backgroundColor: "var(--paper)",
              textAlign: "center",
            }}
          >
            <div style={{ fontFamily: "var(--font-headline)", fontSize: "2rem", color: "var(--ink)", lineHeight: 1.1 }}>
              <Num>{totalSlotsCount}</Num> Slots
            </div>
            <div style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", textTransform: "uppercase", color: "var(--ink-soft)" }}>
              Over <Num>{dayBreakdown.length}</Num> Daily Windows ({slotLength}m each)
            </div>
          </div>

          {/* Overlap notice */}
          {overlappingExistingCount > 0 && (
            <div
              style={{
                fontSize: "0.78rem",
                fontFamily: "var(--font-label)",
                color: "var(--ink-soft)",
                borderLeft: "2px solid var(--ink)",
                paddingLeft: "0.6rem",
              }}
            >
              ✦ Note: <Num>{overlappingExistingCount}</Num> slot times match existing availability in this division.
            </div>
          )}

          {/* Per-Day Breakdown List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "380px", overflowY: "auto" }}>
            {dayBreakdown.length === 0 ? (
              <div style={{ fontStyle: "italic", fontSize: "0.85rem", color: "var(--ink-soft)", padding: "1rem 0", textAlign: "center" }}>
                Select valid dates and windows to generate preview.
              </div>
            ) : (
              dayBreakdown.map((item, idx) => (
                <div
                  key={`${item.dayLabel}-${idx}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.4rem 0.6rem",
                    borderBottom: "1px dashed rgba(28, 22, 19, 0.2)",
                    fontSize: "0.82rem",
                    fontFamily: "var(--font-label)",
                  }}
                >
                  <div>
                    <strong><Num>{item.dayLabel}</Num></strong>
                    <span style={{ color: "var(--ink-soft)", marginLeft: "0.4rem" }}>
                      ({item.windowLabel})
                    </span>
                  </div>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                    <Num>{item.count}</Num> slots
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* WEEK GRID OF EXISTING SLOTS */}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", borderBottom: "1px solid var(--ink)", paddingBottom: "0.6rem" }}>
          <div>
            <span className="kicker" style={{ marginBottom: "0.2rem" }}>✦ DIVISION TIMETABLE ✦</span>
            <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.5rem", margin: 0, textTransform: "uppercase" }}>
              Existing Slots: {DOMAIN_LABELS[selectedDomain]}
            </h3>
            <span style={{ fontFamily: "var(--font-label)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
              Counts: <strong><Num>{openSlotsCount}</Num> Open</strong>, <strong><Num>{bookedSlotsCount}</Num> Booked</strong>
            </span>
          </div>

          {/* Week Navigation & Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.75rem", fontFamily: "var(--font-label)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                <span style={{ width: "12px", height: "12px", border: "1px solid var(--ink)", backgroundColor: "var(--paper)" }} />
                Open
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                <span style={{ width: "12px", height: "12px", backgroundColor: "var(--ink)" }} />
                Booked
              </span>
            </div>

            {/* Week Prev / Next */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                className="ink-btn-secondary"
                style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
              >
                ← Prev Week
              </button>
              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="ink-btn-secondary"
                  style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
                >
                  This Week
                </button>
              )}
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 1)}
                className="ink-btn-secondary"
                style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
              >
                Next Week →
              </button>
            </div>
          </div>
        </div>

        {/* 7-Day Columns */}
        {loadingSchedule ? (
          <Skeleton height="200px" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.6rem", overflowX: "auto" }}>
            {weekDays.map((day) => {
              const dayStr = day.toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short" });
              const dateStr = formatDate(day);
              const dayIsoPrefix = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

              // Slots falling on this day
              const daySlots = slots.filter((s) => {
                const sDate = new Date(s.startTime);
                const sPrefix = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, "0")}-${String(sDate.getDate()).padStart(2, "0")}`;
                return sPrefix === dayIsoPrefix;
              }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

              return (
                <div
                  key={day.toISOString()}
                  style={{
                    border: "1px solid var(--ink)",
                    backgroundColor: "rgba(28, 22, 19, 0.015)",
                    padding: "0.5rem",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: "120px",
                  }}
                >
                  {/* Day Header */}
                  <div style={{ borderBottom: "1px solid var(--ink)", paddingBottom: "0.3rem", textAlign: "center", marginBottom: "0.5rem" }}>
                    <div style={{ fontFamily: "var(--font-headline)", fontSize: "1.1rem" }}>
                      {dayStr}
                    </div>
                    <div style={{ fontFamily: "var(--font-label)", fontSize: "0.7rem", color: "var(--ink-soft)" }}>
                      <Num>{dateStr.split(" ")[0]} {dateStr.split(" ")[1]}</Num>
                    </div>
                  </div>

                  {/* Day Slots List */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: 1 }}>
                    {daySlots.length === 0 ? (
                      <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", fontStyle: "italic", textAlign: "center", marginTop: "1rem" }}>
                        No slots
                      </div>
                    ) : (
                      daySlots.map((slot) => {
                        const isBooked = slot.bookings && slot.bookings.length > 0;
                        const candidateName = isBooked ? slot.bookings![0]?.application?.user?.name || "Booked" : null;
                        const timeStr = formatTime(slot.startTime).replace(" IST", "");

                        return (
                          <div
                            key={slot.id}
                            style={{
                              border: isBooked ? "1px solid var(--ink)" : "1px dashed var(--ink)",
                              backgroundColor: isBooked ? "var(--ink)" : "var(--paper)",
                              color: isBooked ? "var(--paper)" : "var(--ink)",
                              padding: "0.35rem 0.45rem",
                              borderRadius: "2px",
                              fontSize: "0.72rem",
                              fontFamily: "var(--font-label)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.15rem",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 700 }}><Num>{timeStr}</Num></span>
                              {!isBooked && (
                                <button
                                  type="button"
                                  disabled={!SLOT_DELETE_SUPPORTED}
                                  title={SLOT_DELETE_SUPPORTED ? "Delete slot" : "Slot deletion is disabled until the backend API endpoint is available."}
                                  onClick={() => setSlotToDelete(slot)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: SLOT_DELETE_SUPPORTED ? "var(--stamp)" : "var(--ink-soft)",
                                    fontSize: "0.75rem",
                                    cursor: SLOT_DELETE_SUPPORTED ? "pointer" : "not-allowed",
                                    padding: 0,
                                    opacity: SLOT_DELETE_SUPPORTED ? 1 : 0.4,
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            {isBooked ? (
                              <div style={{ fontSize: "0.7rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={candidateName || ""}>
                                {candidateName}
                              </div>
                            ) : (
                              <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)", textTransform: "uppercase" }}>
                                Open
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
