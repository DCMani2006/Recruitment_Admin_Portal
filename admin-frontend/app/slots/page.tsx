"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { Num } from "@/components/Num";
import { Skeleton } from "@/components/Skeleton";
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

  useEffect(() => {
    if (!isRoot && userDomain) {
      setSelectedDomain(userDomain as DomainEnum);
    }
  }, [isRoot, userDomain]);

  // Active top-level tab: "create" or "existing"
  const [activeTab, setActiveTab] = useState<"create" | "existing">("create");

  // Step wizard for "create" tab (1 = Which days, 2 = What hours, 3 = Details)
  const [step, setStep] = useState<1 | 2 | 3>(1);

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
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);
  const [showDayBreakdown, setShowDayBreakdown] = useState<boolean>(false);

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
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Existing slots sub-view: "week" or "day"
  const [scheduleViewMode, setScheduleViewMode] = useState<"week" | "day">("week");
  const [selectedDayDate, setSelectedDayDate] = useState<Date>(new Date());
  const [dayStatusFilter, setDayStatusFilter] = useState<"all" | "empty" | "booked">("all");

  // Personal Google Meet Link Modal State
  const [personalLinkModalSlot, setPersonalLinkModalSlot] = useState<Slot | null>(null);
  const [customMeetingLink, setCustomMeetingLink] = useState<string>("");
  const [savingPersonalLink, setSavingPersonalLink] = useState<boolean>(false);

  // Delete Slot Modal State
  const [slotToDelete, setSlotToDelete] = useState<Slot | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "Slot Planner · The TAM Times Admin";
  }, []);

  // Set default dates to today & 6 days from today in Asia/Kolkata
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

    const sixDaysLater = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    const endParts = formatter.formatToParts(sixDaysLater);
    const ey = endParts.find((p) => p.type === "year")?.value;
    const em = endParts.find((p) => p.type === "month")?.value;
    const ed = endParts.find((p) => p.type === "day")?.value;
    setToDate(`${ey}-${em}-${ed}`);
  }, []);

  // Fetch slots and applications
  const loadData = useCallback(async () => {
    setLoadingSchedule(true);
    try {
      const [slotsData, appsData] = await Promise.all([
        api.getSchedule("ALL", true, selectedDomain),
        api.getApplicants(selectedDomain),
      ]);
      setSlots(slotsData || []);
      setApplications(appsData || []);
    } catch {
      showToast("Failed to load interview schedule.", "error");
    } finally {
      setLoadingSchedule(false);
    }
  }, [selectedDomain, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Window Management
  const addWindow = () => {
    if (windows.length >= 4) return;
    const nextStart = windows.length === 1 ? "14:00" : windows.length === 2 ? "17:00" : "19:00";
    const nextEnd = windows.length === 1 ? "16:00" : windows.length === 2 ? "18:30" : "20:30";
    setWindows([...windows, { id: `win-${Date.now()}`, start: nextStart, end: nextEnd }]);
  };

  const removeWindow = (id: string) => {
    if (windows.length <= 1) return;
    setWindows(windows.filter((w) => w.id !== id));
  };

  const updateWindow = (id: string, field: "start" | "end", val: string) => {
    setWindows(windows.map((w) => (w.id === id ? { ...w, [field]: val } : w)));
  };

  // Validation
  const formValidationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!fromDate || !toDate) {
      errors.push("Both start and end dates are required.");
      return errors;
    }
    if (fromDate > toDate) {
      errors.push("From Date must be before or equal to To Date.");
    }
    if (!meetingLink || !meetingLink.startsWith("https://")) {
      errors.push("A valid https:// meeting room URL is required.");
    }

    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (!w.start || !w.end) {
        errors.push(`Window ${i + 1}: Both start and end times are required.`);
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

          const startISO = `${dayStr}T${win.start}:00+05:30`;
          const endISO = `${dayStr}T${win.end}:00+05:30`;

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

  const uniqueDaysCount = useMemo(() => {
    return new Set(dayBreakdown.map((d) => d.dayLabel)).size;
  }, [dayBreakdown]);

  // Candidates waiting to book
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
      setProgressText(`Publishing batch ${i + 1} of ${taskList.length}...`);
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
      setActiveTab("existing");
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
    if (slotToDelete.bookings && slotToDelete.bookings.length > 0) {
      showToast("Cannot delete: this slot is already booked by a candidate.", "error");
      setSlotToDelete(null);
      return;
    }
    setDeleting(true);
    try {
      await api.deleteSlot(slotToDelete.id);
      showToast("Slot deleted successfully.", "success");
      setSlotToDelete(null);
      loadData();
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("bookings") || msg.includes("booked")) {
        showToast("Cannot delete: this slot is already booked by a candidate.", "error");
      } else if (msg.includes("own domain") || msg.includes("only delete slots that you created") || msg.includes("Access Denied")) {
        showToast("Access Denied: You can only delete interview slots that you personally created.", "error");
      } else {
        showToast(msg || "Failed to delete slot.", "error");
      }
    } finally {
      setDeleting(false);
    }
  };

  // Personal GMeet Link Handlers
  const handleOpenPersonalLinkModal = (slot: Slot) => {
    setPersonalLinkModalSlot(slot);
    setCustomMeetingLink(slot.meetingLink || "");
  };

  const handleSavePersonalLink = async () => {
    if (!personalLinkModalSlot) return;
    setSavingPersonalLink(true);
    try {
      await api.updateSlot(personalLinkModalSlot.id, {
        meetingLink: customMeetingLink.trim(),
      });

      setSlots((prev) =>
        prev.map((s) => (s.id === personalLinkModalSlot.id ? { ...s, meetingLink: customMeetingLink.trim() } : s))
      );
      setApplications((prev) =>
        prev.map((a) => {
          if (a.booking?.slotId === personalLinkModalSlot.id && a.booking.slot) {
            return {
              ...a,
              booking: {
                ...a.booking,
                slot: { ...a.booking.slot, meetingLink: customMeetingLink.trim() },
              },
            };
          }
          return a;
        })
      );

      showToast("Personal Google Meet link updated.", "success");
      setPersonalLinkModalSlot(null);
    } catch (err: any) {
      showToast(err?.message || "Failed to update meeting link.", "error");
    } finally {
      setSavingPersonalLink(false);
    }
  };

  const handleCopyPersonalInvitation = (slot: Slot, link: string) => {
    const booking = slot.bookings?.[0];
    const candidateName = booking?.application?.user?.name || "Candidate";
    const dateFormatted = formatDate(slot.startTime);
    const timeFormatted = formatTime(slot.startTime);

    const message = `Hello ${candidateName},\n\nHere is your personal Google Meet link for your TAM Recruitment interview:\n\nDate: ${dateFormatted}\nTime: ${timeFormatted}\nGoogle Meet Link: ${link}\n\nPlease be ready in the meeting room 5 minutes before your scheduled slot.\n\nBest regards,\nTAM Recruitment Team`;

    navigator.clipboard.writeText(message);
    showToast("Personal meeting invitation copied to clipboard.", "success");
  };

  const handlePrevDay = () => {
    const prev = new Date(selectedDayDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDayDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDayDate);
    next.setDate(next.getDate() + 1);
    setSelectedDayDate(next);
  };

  const handleSelectDateInput = (val: string) => {
    if (!val) return;
    const [y, m, d] = val.split("-").map(Number);
    setSelectedDayDate(new Date(y, m - 1, d));
  };

  const selectedDayIsoPrefix = useMemo(() => {
    const y = selectedDayDate.getFullYear();
    const m = String(selectedDayDate.getMonth() + 1).padStart(2, "0");
    const d = String(selectedDayDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [selectedDayDate]);

  const selectedDaySlots = useMemo(() => {
    return slots
      .filter((s) => {
        const sDate = new Date(s.startTime);
        const sPrefix = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, "0")}-${String(sDate.getDate()).padStart(2, "0")}`;
        return sPrefix === selectedDayIsoPrefix;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [slots, selectedDayIsoPrefix]);

  const emptyDaySlotsCount = useMemo(() => {
    return selectedDaySlots.filter((s) => !s.bookings || s.bookings.length === 0).length;
  }, [selectedDaySlots]);

  const bookedDaySlotsCount = useMemo(() => {
    return selectedDaySlots.filter((s) => s.bookings && s.bookings.length > 0).length;
  }, [selectedDaySlots]);

  const filteredDaySlots = useMemo(() => {
    if (dayStatusFilter === "empty") {
      return selectedDaySlots.filter((s) => !s.bookings || s.bookings.length === 0);
    }
    if (dayStatusFilter === "booked") {
      return selectedDaySlots.filter((s) => s.bookings && s.bookings.length > 0);
    }
    return selectedDaySlots;
  }, [selectedDaySlots, dayStatusFilter]);

  // Week Grid Dates Calculation
  const weekDays = useMemo(() => {
    const now = new Date();
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!slotToDelete}
        title={slotToDelete?.bookings && slotToDelete.bookings.length > 0 ? "Booked Slot Protected" : "Delete Unbooked Slot"}
        message={
          slotToDelete?.bookings && slotToDelete.bookings.length > 0
            ? `Protected: This slot on ${slotToDelete ? formatDate(slotToDelete.startTime) : ""} at ${slotToDelete ? formatTime(slotToDelete.startTime) : ""} is already booked by ${slotToDelete.bookings[0]?.application?.user?.name || "a candidate"}. To protect the candidate's interview, booked slots cannot be deleted.`
            : `Remove the unbooked slot on ${slotToDelete ? formatDate(slotToDelete.startTime) : ""} at ${slotToDelete ? formatTime(slotToDelete.startTime) : ""}? This availability will no longer be open to candidates.`
        }
        confirmLabel={slotToDelete?.bookings && slotToDelete.bookings.length > 0 ? "Cannot Delete" : "Confirm Deletion"}
        cancelLabel="Keep Slot"
        isDestructive={true}
        onConfirm={handleConfirmDeleteSlot}
        onCancel={() => setSlotToDelete(null)}
      />

      {/* Personal Google Meet Link Modal */}
      {personalLinkModalSlot && (
        <div
          role="dialog"
          aria-modal="true"
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(20, 16, 14, 0.75)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPersonalLinkModalSlot(null);
          }}
        >
          <div
            className="paper modal-dialog"
            style={{
              width: "100%",
              maxWidth: "520px",
              padding: "1.75rem",
              border: "2px solid var(--ink)",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              position: "relative",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "1.25rem", borderBottom: "1px solid var(--ink)", paddingBottom: "0.75rem" }}>
              <span
                style={{
                  fontFamily: "var(--font-label)",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  fontSize: "0.72rem",
                  color: "var(--stamp)",
                  fontWeight: 700,
                  display: "block",
                  marginBottom: "0.25rem",
                }}
              >
                ✦ CUSTOM DISPATCH DESK ✦
              </span>
              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.45rem", margin: "0 0 0.3rem 0", textTransform: "uppercase" }}>
                Personal Google Meet Link
              </h3>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                Assign an individual meeting room URL or send an updated link directly to this candidate.
              </p>
            </div>

            {/* Candidate & Slot Meta */}
            <div
              style={{
                backgroundColor: "rgba(28, 22, 19, 0.03)",
                border: "1px solid var(--ink)",
                padding: "0.75rem 1rem",
                marginBottom: "1.25rem",
                fontSize: "0.8rem",
                fontFamily: "var(--font-label)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
              }}
            >
              <div>
                <span style={{ color: "var(--ink-soft)", display: "block", fontSize: "0.7rem", textTransform: "uppercase" }}>Date & Time</span>
                <strong>{formatDate(personalLinkModalSlot.startTime)}</strong>
                <div style={{ fontSize: "0.75rem" }}>{formatTime(personalLinkModalSlot.startTime)}</div>
              </div>
              <div>
                <span style={{ color: "var(--ink-soft)", display: "block", fontSize: "0.7rem", textTransform: "uppercase" }}>Candidate</span>
                <strong>{personalLinkModalSlot.bookings?.[0]?.application?.user?.name || "Unbooked / Open"}</strong>
                {personalLinkModalSlot.bookings?.[0]?.application?.user?.email && (
                  <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {personalLinkModalSlot.bookings[0].application.user.email}
                  </div>
                )}
              </div>
            </div>

            {/* Input for custom meet link */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                style={{
                  display: "block",
                  fontFamily: "var(--font-label)",
                  fontSize: "0.75rem",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: "0.35rem",
                }}
              >
                Google Meet Link:
              </label>
              <input
                type="url"
                value={customMeetingLink}
                onChange={(e) => setCustomMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="newspaper-input"
                style={{ width: "100%", padding: "0.5rem 0.65rem", fontSize: "0.85rem" }}
              />
              <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)", fontFamily: "var(--font-label)", display: "block", marginTop: "0.3rem" }}>
                Defaults to the general domain room, but can be customized to any unique Google Meet or video conference link.
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleSavePersonalLink}
                  disabled={savingPersonalLink || !customMeetingLink.trim()}
                  className="stamp-btn"
                  style={{ flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}
                >
                  {savingPersonalLink ? "Saving..." : "Save Link to Slot"}
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyPersonalInvitation(personalLinkModalSlot, customMeetingLink)}
                  disabled={!customMeetingLink.trim()}
                  className="ink-btn"
                  style={{ flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.8rem" }}
                >
                  📋 Copy Invitation
                </button>
              </div>

              {personalLinkModalSlot.bookings?.[0]?.application?.user?.email && (
                <a
                  href={`mailto:${personalLinkModalSlot.bookings[0].application.user.email}?subject=${encodeURIComponent("Updated Interview Google Meet Link · The TAM Times")}&body=${encodeURIComponent(
                    `Hello ${personalLinkModalSlot.bookings[0].application.user.name},\n\nPlease find your Google Meet link for your scheduled interview:\n\nDate: ${formatDate(personalLinkModalSlot.startTime)}\nTime: ${formatTime(personalLinkModalSlot.startTime)}\nMeeting Link: ${customMeetingLink}\n\nTAM Recruitment Team`
                  )}`}
                  className="ink-btn-secondary"
                  style={{
                    display: "block",
                    textAlign: "center",
                    textDecoration: "none",
                    padding: "0.45rem",
                    fontSize: "0.78rem",
                  }}
                >
                  ✉ Open in Email Client
                </a>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", borderTop: "1px dashed rgba(28, 22, 19, 0.2)", paddingTop: "0.75rem" }}>
                {customMeetingLink.startsWith("https://") ? (
                  <a
                    href={customMeetingLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-label)",
                      color: "var(--stamp)",
                      textDecoration: "underline",
                    }}
                  >
                    Test Meet Link ↗
                  </a>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={() => setPersonalLinkModalSlot(null)}
                  className="ink-btn-secondary"
                  style={{ padding: "0.4rem 1rem", fontSize: "0.78rem" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header section */}
      <div style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <span className="kicker">✦ RECRUITMENT TIMETABLE ✦</span>
            <h1 className="headline" style={{ fontSize: "2.3rem", margin: "0.2rem 0 0.3rem 0" }}>
              Slot Planner
            </h1>
            <p className="deck" style={{ margin: 0, maxWidth: "680px" }}>
              Manage candidate interview windows, publish availability, and monitor booking capacity.
            </p>
          </div>
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", textTransform: "uppercase", color: "var(--ink-soft)" }}>
            {DOMAIN_LABELS[selectedDomain]} Desk
          </span>
        </div>
      </div>

      {/* TWO PRIMARY TABS */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid var(--ink)",
          gap: "0.5rem",
          alignItems: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.82rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 700,
            padding: "0.55rem 1.1rem",
            background: activeTab === "create" ? "var(--ink)" : "transparent",
            color: activeTab === "create" ? "var(--paper)" : "var(--ink)",
            border: "1px solid var(--ink)",
            borderBottom: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Create Slots
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("existing")}
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.82rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 700,
            padding: "0.55rem 1.1rem",
            background: activeTab === "existing" ? "var(--ink)" : "transparent",
            color: activeTab === "existing" ? "var(--paper)" : "var(--ink)",
            border: "1px solid var(--ink)",
            borderBottom: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Existing Slots ({slots.length})
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: CREATE SLOTS (SIMPLIFIED 3-STEP GUIDED FORM)           */}
      {/* ============================================================ */}
      {activeTab === "create" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Step Progress Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0.75rem",
              backgroundColor: "rgba(28, 22, 19, 0.03)",
              border: "1px solid var(--ink)",
              fontFamily: "var(--font-label)",
              fontSize: "0.78rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <span
              onClick={() => setStep(1)}
              style={{
                cursor: "pointer",
                fontWeight: step === 1 ? 700 : 500,
                color: step === 1 ? "var(--stamp)" : "var(--ink)",
                textDecoration: step === 1 ? "underline" : "none",
              }}
            >
              1. Which Days
            </span>
            <span style={{ color: "var(--ink-soft)" }}>──</span>
            <span
              onClick={() => setStep(2)}
              style={{
                cursor: "pointer",
                fontWeight: step === 2 ? 700 : 500,
                color: step === 2 ? "var(--stamp)" : "var(--ink)",
                textDecoration: step === 2 ? "underline" : "none",
              }}
            >
              2. What Hours
            </span>
            <span style={{ color: "var(--ink-soft)" }}>──</span>
            <span
              onClick={() => setStep(3)}
              style={{
                cursor: "pointer",
                fontWeight: step === 3 ? 700 : 500,
                color: step === 3 ? "var(--stamp)" : "var(--ink)",
                textDecoration: step === 3 ? "underline" : "none",
              }}
            >
              3. Details & Publish
            </span>
          </div>

          <form onSubmit={handleInitialSubmit} className="paper" style={{ border: "2px solid var(--ink)", padding: "1.5rem" }}>
            {/* STEP 1: WHICH DAYS */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.35rem", margin: "0 0 0.25rem 0", textTransform: "uppercase" }}>
                    Step 1: Which Days?
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                    Select the date span for interviews. Weekends are automatically excluded by default.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.3rem" }}>
                      From Date
                    </label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      required
                      className="newspaper-input"
                      style={{ width: "100%", padding: "0.5rem 0.65rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.3rem" }}>
                      To Date
                    </label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      required
                      className="newspaper-input"
                      style={{ width: "100%", padding: "0.5rem 0.65rem" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <input
                    id="skipWeekends"
                    type="checkbox"
                    checked={skipWeekends}
                    onChange={(e) => setSkipWeekends(e.target.checked)}
                    style={{ cursor: "pointer", accentColor: "var(--stamp)", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="skipWeekends" style={{ fontFamily: "var(--font-label)", fontSize: "0.82rem", cursor: "pointer" }}>
                    Skip weekends (exclude Saturdays and Sundays from the schedule)
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!fromDate || !toDate) {
                        showToast("Please pick start and end dates.", "error");
                        return;
                      }
                      if (fromDate > toDate) {
                        showToast("From Date must be before To Date.", "error");
                        return;
                      }
                      setStep(2);
                    }}
                    className="ink-btn"
                    style={{ fontSize: "0.82rem", padding: "0.5rem 1.25rem" }}
                  >
                    Continue to Hours →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: WHAT HOURS */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.35rem", margin: "0 0 0.25rem 0", textTransform: "uppercase" }}>
                      Step 2: What Hours?
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                      Define daily examination windows. You can configure up to four recurring windows.
                    </p>
                  </div>
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
                      + Add Another Window
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {windows.map((win, idx) => (
                    <div
                      key={win.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        backgroundColor: "rgba(28, 22, 19, 0.02)",
                        padding: "0.6rem 0.85rem",
                        border: "1px solid rgba(28, 22, 19, 0.2)",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-label)", fontSize: "0.78rem", minWidth: "80px", fontWeight: 700 }}>
                        Window {idx + 1}:
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <input
                          type="time"
                          value={win.start}
                          onChange={(e) => updateWindow(win.id, "start", e.target.value)}
                          required
                          className="newspaper-input"
                          style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                        />
                        <span style={{ fontSize: "0.78rem", fontFamily: "var(--font-label)" }}>to</span>
                        <input
                          type="time"
                          value={win.end}
                          onChange={(e) => updateWindow(win.id, "end", e.target.value)}
                          required
                          className="newspaper-input"
                          style={{ padding: "0.35rem 0.5rem", fontSize: "0.85rem" }}
                        />
                      </div>
                      {windows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeWindow(win.id)}
                          className="ink-btn-secondary"
                          style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", color: "var(--stamp)", marginLeft: "auto" }}
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.82rem", padding: "0.5rem 1rem" }}
                  >
                    ← Back to Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="ink-btn"
                    style={{ fontSize: "0.82rem", padding: "0.5rem 1.25rem" }}
                  >
                    Continue to Details →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: DETAILS & PUBLISH */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.35rem", margin: "0 0 0.25rem 0", textTransform: "uppercase" }}>
                    Step 3: Details & Confirmation
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                    Specify interview duration and meeting room link.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.3rem" }}>
                      Slot Duration
                    </label>
                    <select
                      value={slotLength}
                      onChange={(e) => setSlotLength(Number(e.target.value))}
                      className="newspaper-select"
                      style={{ width: "100%", padding: "0.45rem 0.65rem" }}
                    >
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes (Standard)</option>
                      <option value={20}>20 minutes</option>
                      <option value={30}>30 minutes</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.3rem" }}>
                      Meeting Room Link
                    </label>
                    <input
                      type="url"
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      required
                      placeholder="https://meet.google.com/..."
                      className="newspaper-input"
                      style={{ width: "100%", padding: "0.45rem 0.65rem" }}
                    />
                  </div>
                </div>

                {/* Collapsible "More options" for rare options */}
                <div style={{ borderTop: "1px dashed rgba(28, 22, 19, 0.2)", paddingTop: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowMoreOptions((v) => !v)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "var(--font-label)",
                      fontSize: "0.76rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontWeight: 700,
                      color: "var(--ink)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <span>{showMoreOptions ? "▾" : "▸"}</span>
                    <span>More Options (Capacity & Division)</span>
                  </button>

                  {showMoreOptions && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginTop: "0.75rem", padding: "0.75rem", backgroundColor: "rgba(28, 22, 19, 0.02)", border: "1px solid rgba(28, 22, 19, 0.15)" }}>
                      <div>
                        <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                          Candidate Capacity per Slot
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={capacity}
                          onChange={(e) => setCapacity(Math.max(1, Math.min(5, Number(e.target.value))))}
                          className="newspaper-input"
                          style={{ width: "100px", padding: "0.35rem 0.5rem" }}
                        />
                      </div>

                      {isRoot && (
                        <div>
                          <label style={{ display: "block", fontFamily: "var(--font-label)", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, marginBottom: "0.25rem" }}>
                            Target Division
                          </label>
                          <select
                            value={selectedDomain}
                            onChange={(e) => setSelectedDomain(e.target.value as DomainEnum)}
                            className="newspaper-select"
                            style={{ width: "100%", padding: "0.35rem 0.5rem" }}
                          >
                            {DOMAINS.map((dom) => (
                              <option key={dom} value={dom}>
                                {DOMAIN_LABELS[dom]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Quiet Summary Line */}
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    border: "1px solid var(--ink)",
                    backgroundColor: "rgba(28, 22, 19, 0.02)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-label)", fontSize: "0.82rem" }}>
                    Summary: <strong><Num>{totalSlotsCount}</Num> slots</strong> will be generated across{" "}
                    <strong><Num>{uniqueDaysCount}</Num> days</strong> ({slotLength} mins each)
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDayBreakdown((v) => !v)}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: "0.75rem",
                      fontFamily: "var(--font-label)",
                      textTransform: "uppercase",
                      textDecoration: "underline",
                      cursor: "pointer",
                      color: "var(--ink)",
                    }}
                  >
                    {showDayBreakdown ? "Hide Breakdown ▴" : "Show Day Breakdown ▾"}
                  </button>
                </div>

                {/* Expandable Per-Day Breakdown List */}
                {showDayBreakdown && (
                  <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px dashed rgba(28, 22, 19, 0.2)", padding: "0.5rem" }}>
                    {dayBreakdown.map((item, idx) => (
                      <div
                        key={`${item.dayLabel}-${idx}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "0.3rem 0.5rem",
                          borderBottom: "1px dashed rgba(28, 22, 19, 0.1)",
                          fontSize: "0.78rem",
                          fontFamily: "var(--font-label)",
                        }}
                      >
                        <span>{item.dayLabel} ({item.windowLabel})</span>
                        <strong><Num>{item.count}</Num> slots</strong>
                      </div>
                    ))}
                  </div>
                )}

                {/* Overlap notice only when relevant */}
                {overlappingExistingCount > 0 && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      fontFamily: "var(--font-label)",
                      color: "var(--stamp)",
                      borderLeft: "2px solid var(--stamp)",
                      paddingLeft: "0.6rem",
                    }}
                  >
                    ✦ Note: <Num>{overlappingExistingCount}</Num> slot times match existing availability in this division.
                  </div>
                )}

                {/* Validation Warnings */}
                {formValidationErrors.length > 0 && (
                  <div style={{ color: "var(--stamp)", fontSize: "0.78rem", borderLeft: "2px solid var(--stamp)", paddingLeft: "0.6rem" }}>
                    ✦ {formValidationErrors[0]}
                  </div>
                )}

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

                {/* Bottom Action Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.82rem", padding: "0.5rem 1rem" }}
                  >
                    ← Back to Hours
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || formValidationErrors.length > 0 || totalSlotsCount === 0}
                    className="stamp-btn"
                    style={{ fontSize: "0.88rem", padding: "0.6rem 1.5rem" }}
                  >
                    {submitting ? "Publishing Availability..." : `Create ${totalSlotsCount} Slots`}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: EXISTING SLOTS (WEEK GRID & MANAGEMENT)               */}
      {/* ============================================================ */}
      {activeTab === "existing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Division Selector for Root Admin */}
          {isRoot && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
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

          {/* Capacity Shortage Warning */}
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
              <div style={{ fontSize: "0.85rem", fontFamily: "var(--font-label)" }}>
                <strong>CAPACITY SHORTAGE:</strong> There are only <Num>{openSlotsCount}</Num> open slots, but{" "}
                <strong><Num>{waitingCandidates.length}</Num> candidates</strong> are waiting to book.
                Please publish additional slots.
              </div>
            </div>
          )}

          {/* Summary Row & Navigation */}
          <div
            className="paper"
            style={{
              border: "1.5px solid var(--ink)",
              padding: "0.85rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ fontFamily: "var(--font-label)", fontSize: "0.82rem" }}>
              <strong><Num>{slots.length}</Num> Total Slots</strong> ·{" "}
              <span style={{ color: "var(--ink)" }}><strong><Num>{openSlotsCount}</Num> Open</strong></span> ·{" "}
              <span style={{ color: "var(--stamp)" }}><strong><Num>{bookedSlotsCount}</Num> Booked</strong></span>
            </div>

            {/* View Mode Toggle: Week Schedule vs Day View */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", border: "1px solid var(--ink)" }}>
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("week")}
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "0.74rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: scheduleViewMode === "week" ? 700 : 500,
                    padding: "0.35rem 0.75rem",
                    background: scheduleViewMode === "week" ? "var(--ink)" : "transparent",
                    color: scheduleViewMode === "week" ? "var(--paper)" : "var(--ink)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Week Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("day")}
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "0.74rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: scheduleViewMode === "day" ? 700 : 500,
                    padding: "0.35rem 0.75rem",
                    background: scheduleViewMode === "day" ? "var(--ink)" : "transparent",
                    color: scheduleViewMode === "day" ? "var(--paper)" : "var(--ink)",
                    border: "none",
                    borderLeft: "1px solid var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  Day View (All Slots)
                </button>
              </div>

              {scheduleViewMode === "week" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w - 1)}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                  >
                    ← Prev Week
                  </button>
                  {weekOffset !== 0 && (
                    <button
                      type="button"
                      onClick={() => setWeekOffset(0)}
                      className="ink-btn-secondary"
                      style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                    >
                      This Week
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w + 1)}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
                  >
                    Next Week →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* SUB-VIEW 1: WEEK GRID */}
          {scheduleViewMode === "week" && (
            <div className="paper" style={{ border: "2px solid var(--ink)", padding: "1.25rem" }}>
              {loadingSchedule ? (
                <Skeleton height="200px" />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.6rem", overflowX: "auto" }}>
                  {weekDays.map((day) => {
                    const dayStr = day.toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short" });
                    const dateStr = formatDate(day);
                    const dayIsoPrefix = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

                    const daySlots = slots
                      .filter((s) => {
                        const sDate = new Date(s.startTime);
                        const sPrefix = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, "0")}-${String(sDate.getDate()).padStart(2, "0")}`;
                        return sPrefix === dayIsoPrefix;
                      })
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

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
                        <div style={{ borderBottom: "1px solid var(--ink)", paddingBottom: "0.3rem", textAlign: "center", marginBottom: "0.5rem" }}>
                          <div style={{ fontFamily: "var(--font-headline)", fontSize: "1.05rem" }}>
                            {dayStr}
                          </div>
                          <div style={{ fontFamily: "var(--font-label)", fontSize: "0.7rem", color: "var(--ink-soft)" }}>
                            <Num>{dateStr.split(" ")[0]} {dateStr.split(" ")[1]}</Num>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDayDate(new Date(day));
                              setScheduleViewMode("day");
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--stamp)",
                              fontSize: "0.66rem",
                              fontFamily: "var(--font-label)",
                              textTransform: "uppercase",
                              textDecoration: "underline",
                              cursor: "pointer",
                              padding: "0.15rem 0",
                              marginTop: "0.2rem",
                              display: "block",
                              width: "100%",
                            }}
                            title={`View all ${daySlots.length} slots for ${dayStr}`}
                          >
                            See all ({daySlots.length}) →
                          </button>
                        </div>

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
                                    fontSize: "0.72rem",
                                    fontFamily: "var(--font-label)",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.15rem",
                                  }}
                                >
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontWeight: 700 }}><Num>{timeStr}</Num></span>
                                    <button
                                      type="button"
                                      disabled={!SLOT_DELETE_SUPPORTED}
                                      title={SLOT_DELETE_SUPPORTED ? "Delete slot from schedule" : "Slot deletion is disabled."}
                                      onClick={() => setSlotToDelete(slot)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: isBooked ? "var(--paper)" : (SLOT_DELETE_SUPPORTED ? "var(--stamp)" : "var(--ink-soft)"),
                                        fontSize: "0.75rem",
                                        cursor: SLOT_DELETE_SUPPORTED ? "pointer" : "not-allowed",
                                        padding: 0,
                                        opacity: isBooked ? 0.7 : 1,
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {isBooked ? (
                                    <>
                                      <div style={{ fontSize: "0.7rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={candidateName || ""}>
                                        {candidateName}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenPersonalLinkModal(slot)}
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "var(--paper)",
                                          opacity: 0.85,
                                          fontSize: "0.64rem",
                                          fontFamily: "var(--font-label)",
                                          textDecoration: "underline",
                                          cursor: "pointer",
                                          padding: 0,
                                          textAlign: "left",
                                        }}
                                      >
                                        🔗 Personal Meet Link
                                      </button>
                                    </>
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
          )}

          {/* SUB-VIEW 2: DAY VIEW (ALL SLOTS OF ONE DAY IN FULL DETAIL) */}
          {scheduleViewMode === "day" && (
            <div className="paper" style={{ border: "2px solid var(--ink)", padding: "1.25rem" }}>
              {/* Day View Navigation Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  borderBottom: "1.5px solid var(--ink)",
                  paddingBottom: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handlePrevDay}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                  >
                    ← Prev Day
                  </button>
                  <input
                    type="date"
                    value={selectedDayIsoPrefix}
                    onChange={(e) => handleSelectDateInput(e.target.value)}
                    className="newspaper-input"
                    style={{ padding: "0.3rem 0.5rem", fontSize: "0.78rem" }}
                  />
                  <button
                    type="button"
                    onClick={handleNextDay}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                  >
                    Next Day →
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDayDate(new Date())}
                    className="ink-btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                  >
                    Today
                  </button>
                </div>

                <div style={{ textAlign: "right" }}>
                  <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "1.25rem", margin: 0 }}>
                    {formatDate(selectedDayDate)}
                  </h3>
                  <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                    <Num>{selectedDaySlots.length}</Num> Slots Scheduled ·{" "}
                    <Num>{emptyDaySlotsCount}</Num> Empty ·{" "}
                    <Num>{bookedDaySlotsCount}</Num> Booked
                  </span>
                </div>
              </div>

              {/* Status Filter Bar: All / Empty / Booked */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                  marginBottom: "1rem",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "rgba(28, 22, 19, 0.02)",
                  border: "1px solid rgba(28, 22, 19, 0.15)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-label)", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, marginRight: "0.2rem" }}>
                    View Filter:
                  </span>
                  <button
                    type="button"
                    onClick={() => setDayStatusFilter("all")}
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.74rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "0.25rem 0.65rem",
                      border: "1px solid var(--ink)",
                      background: dayStatusFilter === "all" ? "var(--ink)" : "var(--paper)",
                      color: dayStatusFilter === "all" ? "var(--paper)" : "var(--ink)",
                      cursor: "pointer",
                      fontWeight: dayStatusFilter === "all" ? 700 : 500,
                    }}
                  >
                    All Slots ({selectedDaySlots.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDayStatusFilter("empty")}
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.74rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "0.25rem 0.65rem",
                      border: "1px solid var(--ink)",
                      background: dayStatusFilter === "empty" ? "var(--ink)" : "var(--paper)",
                      color: dayStatusFilter === "empty" ? "var(--paper)" : "var(--ink)",
                      cursor: "pointer",
                      fontWeight: dayStatusFilter === "empty" ? 700 : 500,
                    }}
                  >
                    ✦ Empty Slots Only ({emptyDaySlotsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDayStatusFilter("booked")}
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.74rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "0.25rem 0.65rem",
                      border: "1px solid var(--ink)",
                      background: dayStatusFilter === "booked" ? "var(--ink)" : "var(--paper)",
                      color: dayStatusFilter === "booked" ? "var(--paper)" : "var(--ink)",
                      cursor: "pointer",
                      fontWeight: dayStatusFilter === "booked" ? 700 : 500,
                    }}
                  >
                    Booked ({bookedDaySlotsCount})
                  </button>
                </div>

                <div style={{ fontFamily: "var(--font-label)", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                  Showing <strong>{filteredDaySlots.length}</strong> of {selectedDaySlots.length} slots
                </div>
              </div>

              {/* Day Schedule Timetable */}
              {loadingSchedule ? (
                <Skeleton height="200px" />
              ) : filteredDaySlots.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", border: "1px dashed var(--ink)" }}>
                  <div style={{ fontFamily: "var(--font-headline)", fontSize: "1.15rem", marginBottom: "0.4rem" }}>
                    {dayStatusFilter === "empty"
                      ? `No Empty Slots on ${formatDate(selectedDayDate)}`
                      : dayStatusFilter === "booked"
                      ? `No Booked Slots on ${formatDate(selectedDayDate)}`
                      : `No Interview Slots Scheduled for ${formatDate(selectedDayDate)}`}
                  </div>
                  <p style={{ margin: "0 0 1.25rem 0", fontSize: "0.85rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                    {dayStatusFilter === "empty"
                      ? `All ${selectedDaySlots.length} slots for this day are currently booked by candidates.`
                      : dayStatusFilter === "booked"
                      ? `All ${selectedDaySlots.length} slots for this day are currently empty and open for booking.`
                      : `There are currently no slots published for this day in the ${DOMAIN_LABELS[selectedDomain]} division.`}
                  </p>
                  {dayStatusFilter !== "all" ? (
                    <button
                      type="button"
                      onClick={() => setDayStatusFilter("all")}
                      className="ink-btn-secondary"
                      style={{ fontSize: "0.82rem", padding: "0.45rem 1rem" }}
                    >
                      Show All Slots
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate(selectedDayIsoPrefix);
                        setToDate(selectedDayIsoPrefix);
                        setStep(1);
                        setActiveTab("create");
                      }}
                      className="stamp-btn"
                      style={{ fontSize: "0.82rem", padding: "0.45rem 1rem" }}
                    >
                      + Create Slots on This Day
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="newspaper-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--ink)", textAlign: "left", fontFamily: "var(--font-label)", textTransform: "uppercase", fontSize: "0.72rem", letterSpacing: "0.06em" }}>
                        <th style={{ padding: "0.5rem 0.6rem" }}>Time Window</th>
                        <th style={{ padding: "0.5rem 0.6rem" }}>Status</th>
                        <th style={{ padding: "0.5rem 0.6rem" }}>Candidate / Availability</th>
                        <th style={{ padding: "0.5rem 0.6rem" }}>Meeting Link</th>
                        <th style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDaySlots.map((slot) => {
                        const isBooked = slot.bookings && slot.bookings.length > 0;
                        const booking = isBooked ? slot.bookings![0] : null;
                        const candidate = booking?.application?.user;

                        return (
                          <tr
                            key={slot.id}
                            style={{
                              borderBottom: "1px solid rgba(28, 22, 19, 0.15)",
                              backgroundColor: isBooked ? "rgba(28, 22, 19, 0.02)" : "rgba(28, 22, 19, 0.005)",
                            }}
                          >
                            {/* Time Window */}
                            <td style={{ padding: "0.6rem", fontFamily: "var(--font-label)", fontWeight: 700, whiteSpace: "nowrap" }}>
                              <Num>{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</Num>
                            </td>

                            {/* Status Badge */}
                            <td style={{ padding: "0.6rem", whiteSpace: "nowrap" }}>
                              {isBooked ? (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "0.15rem 0.45rem",
                                    backgroundColor: "var(--ink)",
                                    color: "var(--paper)",
                                    fontSize: "0.68rem",
                                    fontFamily: "var(--font-label)",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Booked
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "0.15rem 0.5rem",
                                    border: "1.5px dashed var(--ink)",
                                    backgroundColor: "rgba(28, 22, 19, 0.04)",
                                    color: "var(--ink)",
                                    fontSize: "0.68rem",
                                    fontFamily: "var(--font-label)",
                                    fontWeight: 700,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Empty Slot
                                </span>
                              )}
                            </td>

                            {/* Candidate / Availability Details */}
                            <td style={{ padding: "0.6rem" }}>
                              {candidate ? (
                                <div>
                                  <strong style={{ fontFamily: "var(--font-headline)", fontSize: "0.95rem" }}>
                                    {candidate.name}
                                  </strong>
                                  <div style={{ fontSize: "0.74rem", color: "var(--ink-soft)", fontFamily: "var(--font-label)" }}>
                                    {candidate.email} {candidate.regNumber ? `· Reg: ${candidate.regNumber}` : ""}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  <span style={{ color: "var(--ink)", fontFamily: "var(--font-label)", fontSize: "0.78rem" }}>
                                    ✦ <strong>Unbooked</strong> (Available for candidate booking · Capacity: {slot.capacity})
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Meeting Link */}
                            <td style={{ padding: "0.6rem" }}>
                              {slot.meetingLink ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                  <a
                                    href={slot.meetingLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      fontFamily: "var(--font-label)",
                                      fontSize: "0.75rem",
                                      color: "var(--stamp)",
                                      textDecoration: "underline",
                                      maxWidth: "180px",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      display: "inline-block",
                                    }}
                                    title={slot.meetingLink}
                                  >
                                    {slot.meetingLink}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(slot.meetingLink!);
                                      showToast("Meeting link copied to clipboard.", "success");
                                    }}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      fontSize: "0.72rem",
                                      padding: "0.1rem 0.25rem",
                                      color: "var(--ink)",
                                      opacity: 0.7,
                                    }}
                                    title="Copy meeting link"
                                  >
                                    📋
                                  </button>
                                </div>
                              ) : (
                                <span style={{ color: "var(--ink-soft)", fontStyle: "italic", fontSize: "0.75rem" }}>
                                  No link set
                                </span>
                              )}
                            </td>

                            {/* Actions: Personal GMeet Link & Delete Slot */}
                            <td style={{ padding: "0.6rem", textAlign: "right", whiteSpace: "nowrap" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenPersonalLinkModal(slot)}
                                  className="ink-btn-secondary"
                                  style={{
                                    fontSize: "0.72rem",
                                    padding: "0.25rem 0.55rem",
                                    whiteSpace: "nowrap",
                                  }}
                                  title="Edit, set or share personal Google Meet link"
                                >
                                  🔗 Personal GMeet Link
                                </button>

                                <button
                                  type="button"
                                  disabled={!SLOT_DELETE_SUPPORTED}
                                  onClick={() => setSlotToDelete(slot)}
                                  className="ink-btn-secondary"
                                  style={{
                                    fontSize: "0.72rem",
                                    padding: "0.25rem 0.55rem",
                                    color: "var(--stamp)",
                                    borderColor: "var(--stamp)",
                                    whiteSpace: "nowrap",
                                  }}
                                  title="Delete this specific slot from the schedule"
                                >
                                  ✕ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
