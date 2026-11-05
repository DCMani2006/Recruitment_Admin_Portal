"use client";

import React, { useState, useEffect } from "react";

const RAW_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:5000";

const API_BASE = RAW_BASE.replace(/\/+$/, "").endsWith("/api/admin")
  ? RAW_BASE.replace(/\/+$/, "")
  : `${RAW_BASE.replace(/\/+$/, "")}/api/admin`;

const DOMAINS = [
  "TECHNICAL",
  "MANAGEMENT",
  "DESIGN",
  "MARKETING",
  "R_AND_D",
  "EDITORIAL",
];

export default function AdminPortal() {
  const [token, setToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<{
    id: string;
    email: string;
    role: string;
    domain?: string;
  } | null>(null);

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authSetupCode, setAuthSetupCode] = useState(""); // first-time setup only, from the root admin
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // 1. Form Questions & Marks is FIRST tab by default
  const [activeTab, setActiveTab] = useState<
    "questions" | "candidates" | "review2" | "slots" | "root"
  >("questions");

  // TAB 1: Form Questions & Subsections State
  const [questionDomain, setQuestionDomain] = useState<string>("TECHNICAL");
  const [subsectionsList, setSubsectionsList] = useState<any[]>([]);
  const [questionsList, setQuestionsList] = useState<any[]>([]);
  const [newSubsectionName, setNewSubsectionName] = useState("");
  const [selectedSubsectionId, setSelectedSubsectionId] = useState<string>("");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionMarks, setNewQuestionMarks] = useState<number>(10);
  const [newQuestionOrder, setNewQuestionOrder] = useState<number>(1);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState<string>("");
  const [editQuestionMarks, setEditQuestionMarks] = useState<number>(10);
  const [editQuestionOrder, setEditQuestionOrder] = useState<number>(1);
  const [editQuestionSubsectionId, setEditQuestionSubsectionId] = useState<string>("");

  // TAB 2: Candidates & Review 1 State
  const [filterDomain, setFilterDomain] = useState<string>("TECHNICAL");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [questionScores, setQuestionScores] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState("");
  const [isShortlistedToggle, setIsShortlistedToggle] = useState<boolean>(false);

  // TAB 3: Review 2 (Interview Evaluation) State
  const [review2Search, setReview2Search] = useState("");
  const [selectedInterviewApp, setSelectedInterviewApp] = useState<any | null>(null);
  const [review2Marks, setReview2Marks] = useState<number>(0);
  const [review2Comments, setReview2Comments] = useState<string>("");
  const [isFinalSelectedToggle, setIsFinalSelectedToggle] = useState<boolean>(false);

  // TAB 4: Calendly-Style Interview Slots State
  const [slotDomain, setSlotDomain] = useState<string>("TECHNICAL");
  const [slotDate, setSlotDate] = useState<string>("");
  const [slotStartTime, setSlotStartTime] = useState<string>("10:00");
  const [slotEndTime, setSlotEndTime] = useState<string>("11:00");
  const [slotDuration, setSlotDuration] = useState<number>(20);
  const [slotMeetingLink, setSlotMeetingLink] = useState<string>("");
  const [slotsList, setSlotsList] = useState<any[]>([]);

  // TAB 5: Root Admin Whitelist State
  const [assignDomain, setAssignDomain] = useState<string>("TECHNICAL");
  const [assignEmails, setAssignEmails] = useState<string>("");
  const [domainHeadsList, setDomainHeadsList] = useState<any[]>([]);

  const notify = (type: "success" | "error", text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 6000);
  };

  const parseJwt = (tk: string) => {
    try {
      return JSON.parse(atob(tk.split(".")[1]));
    } catch {
      return {};
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("admin_token");
    if (savedToken) {
      const decoded = parseJwt(savedToken);
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        localStorage.removeItem("admin_token");
      } else {
        setToken(savedToken);
        const userObj = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
          domain: decoded.domain,
        };
        setAdminUser(userObj);
        if (userObj.domain) {
          setFilterDomain(userObj.domain);
          setQuestionDomain(userObj.domain);
          setSlotDomain(userObj.domain);
        }
      }
    }
  }, []);

  const handleAuth = async (endpoint: "/login" | "/setup") => {
    if (!authEmail.trim() || !authPassword) {
      notify("error", "Please enter both email and password.");
      return;
    }
    if (endpoint === "/setup" && !authSetupCode.trim()) {
      notify("error", "Enter the setup code the root admin gave you.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail.trim().toLowerCase(),
          password: authPassword,
          ...(endpoint === "/setup" ? { setupCode: authSetupCode.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Authentication failed");

      const decoded = parseJwt(data.token);
      const userObj = {
        id: data.id || data.admin?.id || decoded.id,
        email: data.email || data.admin?.email || decoded.email || authEmail,
        role: data.role || data.admin?.role || decoded.role,
        domain: data.domain || data.admin?.domain || decoded.domain,
      };

      setToken(data.token);
      localStorage.setItem("admin_token", data.token);
      setAdminUser(userObj);

      const defaultDom = userObj.domain || "TECHNICAL";
      setFilterDomain(defaultDom);
      setQuestionDomain(defaultDom);
      setSlotDomain(defaultDom);

      notify(
        "success",
        endpoint === "/setup"
          ? "Password created & logged in successfully!"
          : `Logged in as ${userObj.email} (${userObj.domain || userObj.role})`
      );
    } catch (err: any) {
      notify("error", err.message || "Authentication failed");
    }
  };

  // ============================================================================
  // TAB 1: FORM QUESTIONS & SUBSECTIONS
  // ============================================================================
  const fetchFormQuestions = async (dom = questionDomain) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/form?domain=${dom}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to fetch questions");

      const rawSubs = json.data?.subsections || [];
      const rawQs = json.data?.questions || [];

      setSubsectionsList(rawSubs.filter((s: any) => !s.domain || s.domain === dom));
      setQuestionsList(rawQs.filter((q: any) => !q.domain || q.domain === dom));
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleCreateSubsection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newSubsectionName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/form/subsection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newSubsectionName.trim(),
          domain: questionDomain,
          order: subsectionsList.length + 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create subsection");

      setNewSubsectionName("");
      notify("success", `Subsection created for ${questionDomain}!`);
      fetchFormQuestions(questionDomain);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newQuestionText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/form/question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: newQuestionText.trim(),
          domain: questionDomain,
          subsectionId: selectedSubsectionId || null,
          maxMarks: Number(newQuestionMarks) || 10,
          order: Number(newQuestionOrder) || questionsList.length + 1,
          required: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create question");

      setNewQuestionText("");
      setNewQuestionOrder((prev) => prev + 1);
      notify("success", `Question added to ${questionDomain} form!`);
      fetchFormQuestions(questionDomain);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const startEditingQuestion = (q: any) => {
    setEditingQuestionId(q.id);
    setEditQuestionText(q.text || "");
    setEditQuestionMarks(q.maxMarks ?? 10);
    setEditQuestionOrder(q.order ?? 1);
    setEditQuestionSubsectionId(q.subsectionId || "");
  };

  const handleSaveEditedQuestion = async (qId: string) => {
    if (!token || !editQuestionText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/form/question/${qId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: editQuestionText.trim(),
          maxMarks: Number(editQuestionMarks) || 10,
          order: Number(editQuestionOrder) || 1,
          subsectionId: editQuestionSubsectionId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to update question");

      setEditingQuestionId(null);
      notify("success", "Question updated successfully!");
      fetchFormQuestions(questionDomain);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/form/question/${qId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to delete question");

      notify("success", "Question removed!");
      fetchFormQuestions(questionDomain);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // ============================================================================
  // TAB 2: REVIEW 1
  // ============================================================================
  const fetchCandidates = async (dom = filterDomain) => {
    if (!token) return;
    try {
      const query = dom && dom !== "ALL" ? `?domain=${dom}` : "";
      const res = await fetch(`${API_BASE}/applicants${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to fetch applicants");

      const rawList = json.data || json.applicants || [];
      const submittedOnly = rawList
        .filter((app: any) => Boolean(app.submittedAt))
        .filter((app: any) => dom === "ALL" || app.domain === dom);
      setCandidates(submittedOnly);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleSelectCandidate = async (app: any) => {
    setSelectedApp(app);
    setReviewComments(app.review1Comments || "");
    setIsShortlistedToggle(Boolean(app.review1Passed));

    let answersList = app.user?.answers || [];

    if (answersList.length === 0 && app.userId && token) {
      try {
        const res = await fetch(`${API_BASE}/applicants/${app.userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok && json.data?.answers) {
          answersList = json.data.answers;
          setSelectedApp({
            ...app,
            user: { ...app.user, answers: answersList },
          });
        }
      } catch {
        // Ignore fallback error
      }
    }

    const scores: Record<string, number> = {};
    answersList
      .filter((ans: any) => !ans.question?.domain || ans.question.domain === app.domain)
      .forEach((ans: any) => {
        scores[ans.id] = ans.marks ?? 0;
      });
    setQuestionScores(scores);
  };

  const totalCalculatedMarks = Object.values(questionScores).reduce(
    (sum, val) => sum + (Number(val) || 0),
    0
  );

  const displayedCandidates = [...candidates]
    .filter((app) => {
      const search = candidateSearch.trim().toLowerCase();
      if (!search) return true;
      return (
        app.user?.name?.toLowerCase().includes(search) ||
        app.user?.regNumber?.toLowerCase().includes(search) ||
        app.user?.email?.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => (Number(b.review1Marks) || 0) - (Number(a.review1Marks) || 0));

  const saveReview1Data = async (nextToggleState: boolean) => {
    if (!selectedApp || !token) return;
    try {
      const answerScores = Object.entries(questionScores).map(
        ([answerId, marks]) => ({
          answerId,
          marks: Number(marks) || 0,
        })
      );

      const payload: any = {
        review1Marks: totalCalculatedMarks,
        review1Comments: reviewComments,
        review1Passed: nextToggleState,
        answerScores,
      };

      const res = await fetch(
        `${API_BASE}/applicants/${selectedApp.id}/review`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save evaluation");

      notify(
        "success",
        `Saved! Shortlist toggle is ${
          nextToggleState ? "ON (Shortlisted)" : "OFF (Not Shortlisted)"
        }.`
      );
      fetchCandidates(filterDomain);
      setSelectedApp({
        ...selectedApp,
        review1Marks: totalCalculatedMarks,
        review1Comments: reviewComments,
        review1Passed: nextToggleState,
      });
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // ADDED: Confirmation Alert for Batch Email Release
  const handleBatchReleaseShortlist = async () => {
    if (!token) return;
    
    const isConfirmed = window.confirm(
      "🚨 ARE YOU ABSOLUTELY SURE?\n\n" +
      "This will instantly send Interview Invite emails to all shortlisted candidates, " +
      "and Polite Rejection emails to all graded candidates left unselected.\n\n" +
      "Please ensure all Domain Heads are finished grading before clicking OK."
    );

    if (!isConfirmed) {
      return; // Cancel execution if they clicked 'Cancel'
    }

    const targetDom =
      adminUser?.role === "DOMAIN_HEAD" && adminUser?.domain
        ? adminUser.domain
        : filterDomain;

    if (targetDom === "ALL") {
      notify("error", "Please select a specific domain before releasing the shortlist batch.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/applicants/release-shortlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ domain: targetDom }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Batch release failed");

      notify("success", json.message || "Shortlist released and emails sent to all shortlisted candidates!");
      fetchCandidates(filterDomain);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleExportExcel = () => {
    if (candidates.length === 0) {
      notify("error", "No candidate data to export.");
      return;
    }

    const questionMap = new Map<string, string>();
    candidates.forEach((app) => {
      (app.user?.answers || []).forEach((ans: any) => {
        if (!ans.question?.domain || ans.question.domain === app.domain) {
          questionMap.set(
            ans.questionId || ans.question?.id || ans.id,
            ans.question?.text || "Question"
          );
        }
      });
    });

    const questionEntries = Array.from(questionMap.entries());

    const headers = [
      "Candidate Name",
      "Registration Number",
      "Email",
      "Phone",
      "Domain",
      "Current Stage",
      "Shortlisted for Next Round",
      "Review 1 Total Marks",
      "Review 1 Reviewer Comments",
      "Interview Booked Slot",
      "Review 2 Interview Marks",
      "Review 2 Interview Comments",
      "Final Status",
    ];

    questionEntries.forEach(([, qText], idx) => {
      headers.push(`Q${idx + 1}: ${qText} (Answer)`);
      headers.push(`Q${idx + 1}: Marks`);
    });

    const escapeCsv = (val: any) => {
      const str = val === null || val === undefined ? "" : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows = displayedCandidates.map((app) => {
      const slotStr = app.booking?.slot
        ? `${new Date(app.booking.slot.startTime).toLocaleDateString()} ${new Date(
            app.booking.slot.startTime
          ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Not Booked";

      const finalStatus =
        app.stage === "SELECTED"
          ? "SELECTED"
          : app.stage === "REJECTED"
          ? "REJECTED"
          : app.review1Passed
          ? "SHORTLISTED FOR INTERVIEW"
          : "NOT SHORTLISTED";

      const row = [
        app.user?.name || "",
        app.user?.regNumber || "",
        app.user?.email || "",
        app.user?.phone || "",
        app.domain || "",
        app.stage || "",
        app.review1Passed ? "YES" : "NO",
        app.review1Marks ?? 0,
        app.review1Comments || "",
        slotStr,
        app.review2Marks ?? "",
        app.review2Comments || "",
        finalStatus,
      ];

      const userAnswers = app.user?.answers || [];
      questionEntries.forEach(([qId]) => {
        const found = userAnswers.find(
          (a: any) => (a.questionId || a.question?.id || a.id) === qId
        );
        row.push(found ? found.text : "");
        row.push(found && found.marks !== null && found.marks !== undefined ? found.marks : 0);
      });

      return row.map(escapeCsv).join(",");
    });

    const csvContent = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `Recruitment_${filterDomain}_Evaluation_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ============================================================================
  // TAB 3: REVIEW 2 (TOGGLE SWITCH FOR SELECTED/REJECTED)
  // ============================================================================
  const handleSelectInterviewCandidate = (app: any) => {
    setSelectedInterviewApp(app);
    setReview2Marks(app.review2Marks ?? 0);
    setReview2Comments(app.review2Comments || "");
    setIsFinalSelectedToggle(app.stage === "SELECTED");
  };

  const interviewCandidates = [...candidates]
    .filter((app) => {
      const hasBookedSlot = Boolean(app.booking?.slot);
      if (!hasBookedSlot) return false;

      if (adminUser?.role === "ROOT_ADMIN") {
        return true;
      }
      return app.booking?.slot?.interviewerId === adminUser?.id;
    })
    .filter((app) => {
      const search = review2Search.trim().toLowerCase();
      if (!search) return true;
      return (
        app.user?.name?.toLowerCase().includes(search) ||
        app.user?.regNumber?.toLowerCase().includes(search) ||
        app.user?.email?.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      const timeA = a.booking?.slot?.startTime
        ? new Date(a.booking.slot.startTime).getTime()
        : Infinity;
      const timeB = b.booking?.slot?.startTime
        ? new Date(b.booking.slot.startTime).getTime()
        : Infinity;
      return timeA - timeB;
    });

  const handleSaveReview2 = async (nextToggleState: boolean) => {
    if (!selectedInterviewApp || !token) return;
    
    const targetStage = nextToggleState ? "SELECTED" : "REJECTED";

    try {
      const res = await fetch(
        `${API_BASE}/applicants/${selectedInterviewApp.id}/review`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            stage: targetStage,
            review2Marks: Number(review2Marks) || 0,
            review2Comments: review2Comments,
            review2Passed: nextToggleState,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok)
        throw new Error(json.message || "Failed to save interview evaluation");

      notify("success", `Saved! Candidate marked as ${targetStage}.`);
      fetchCandidates(filterDomain);
      setSelectedInterviewApp({
        ...selectedInterviewApp,
        stage: targetStage,
        review2Marks: Number(review2Marks) || 0,
        review2Comments,
      });
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // ============================================================================
  // TAB 4: INTERVIEW SLOTS
  // ============================================================================
  const fetchSlots = async (dom = slotDomain) => {
    if (!token || !adminUser?.id) return;
    try {
      const targetAdminId = adminUser.role === "ROOT_ADMIN" ? "ALL" : adminUser.id;
      const res = await fetch(
        `${API_BASE}/schedule/${targetAdminId}?all=true&domain=${dom}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to fetch slots");
      setSlotsList(json.data || []);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleCreateSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !slotDate || !slotStartTime || !slotEndTime) {
      notify("error", "Please select a calendar date, start time, and end time.");
      return;
    }

    const startISO = new Date(`${slotDate}T${slotStartTime}:00`).toISOString();
    const endISO = new Date(`${slotDate}T${slotEndTime}:00`).toISOString();

    if (new Date(endISO) <= new Date(startISO)) {
      notify("error", "End time must be after start time.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/slots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          interviewerId: adminUser?.id,
          domain: slotDomain,
          startTime: startISO,
          endTime: endISO,
          durationMinutes: Number(slotDuration) || 20,
          meetingLink: slotMeetingLink.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to create slots");

      notify("success", json.message || "Interview slots created!");
      fetchSlots(slotDomain);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Are you sure you want to delete this empty slot?")) return;
    try {
      const res = await fetch(`${API_BASE}/slots/${slotId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      
      notify("success", "Slot deleted successfully!");
      fetchSlots(slotDomain);
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  // ============================================================================
  // TAB 5: ROOT ADMIN WHITELIST
  // ============================================================================
  const fetchDomainHeads = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/domain-heads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setDomainHeadsList(json.data || []);
      }
    } catch {
      // ignore
    }
  };

  const handleAssignDomainHeads = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !assignEmails.trim()) return;

    const emailArray = assignEmails
      .split(",")
      .map((em) => em.trim().toLowerCase())
      .filter(Boolean);

    try {
      const res = await fetch(`${API_BASE}/domain-heads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domain: assignDomain,
          emails: emailArray,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to assign domain heads");

      setAssignEmails("");
      notify("success", json.message || "Domain head(s) whitelisted!");
      fetchDomainHeads();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  useEffect(() => {
    if (token) {
      fetchFormQuestions(questionDomain);
      fetchCandidates(filterDomain);
      if (adminUser?.role === "ROOT_ADMIN") {
        fetchDomainHeads();
      }
    }
  }, [token]);

  const shortlistedCount = candidates.filter((c) => Boolean(c.review1Passed)).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* UN-AUTHENTICATED PROFESSIONAL LOGIN SCREEN */}
        {!token ? (
          <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h1 className="text-2xl font-bold text-center text-slate-900 mb-6">
              Recruitment Admin Portal
            </h1>

            {statusMsg && (
              <div
                className={`p-3 mb-6 rounded-lg text-sm font-medium border text-center ${
                  statusMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-red-50 text-red-800 border-red-200"
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <div className="space-y-4">
              <input
                type="email"
                placeholder="Admin / Domain Head Email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm"
              />
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Setup code (first time only, from the root admin)"
                value={authSetupCode}
                onChange={(e) => setAuthSetupCode(e.target.value)}
                autoComplete="off"
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-mono uppercase"
              />
            </div>

            <div className="flex flex-col gap-3 pt-6">
              <button
                onClick={() => handleAuth("/login")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
              >
                Login
              </button>
              <button
                onClick={() => handleAuth("/setup")}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition"
              >
                Create First-Time Password
              </button>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED DASHBOARD SCREEN */
          <>
            {/* Dashboard Top Bar */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Recruitment Admin & Evaluation Portal
                </h1>
              </div>
              {adminUser && (
                <div className="flex items-center gap-4">
                  <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200">
                    {adminUser.email} ({adminUser.role}
                    {adminUser.domain ? ` - ${adminUser.domain}` : ""})
                  </span>
                  <button
                    onClick={() => {
                      localStorage.removeItem("admin_token");
                      setToken(null);
                      setAdminUser(null);
                      setSelectedApp(null);
                      setSelectedInterviewApp(null);
                    }}
                    className="text-xs text-red-600 hover:underline font-semibold"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>

            {/* Status Alert for Dashboard */}
            {statusMsg && (
              <div
                className={`p-4 rounded-xl text-sm font-medium border ${
                  statusMsg.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-red-50 text-red-800 border-red-200"
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              <button
                onClick={() => {
                  setActiveTab("questions");
                  fetchFormQuestions(questionDomain);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  activeTab === "questions"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                1. Form Questions & Marks ({questionsList.length})
              </button>

              <button
                onClick={() => {
                  setActiveTab("candidates");
                  fetchCandidates(filterDomain);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  activeTab === "candidates"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                2. Review 1: Form Grading ({candidates.length})
              </button>

              <button
                onClick={() => {
                  setActiveTab("review2");
                  fetchCandidates(filterDomain);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  activeTab === "review2"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                3. Review 2: My Interviewees ({interviewCandidates.length})
              </button>

              <button
                onClick={() => {
                  setActiveTab("slots");
                  fetchSlots(slotDomain);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  activeTab === "slots"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                4. Interview Slots (Calendly Style)
              </button>

              {adminUser?.role === "ROOT_ADMIN" && (
                <button
                  onClick={() => {
                    setActiveTab("root");
                    fetchDomainHeads();
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    activeTab === "root"
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-indigo-700 border border-indigo-200"
                  }`}
                >
                  5. Whitelist Domain Heads
                </button>
              )}
            </div>

            {/* ===================================================================== */}
            {/* TAB 1: DOMAIN FORM QUESTIONS & MARKS BUILDER                          */}
            {/* ===================================================================== */}
            {activeTab === "questions" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="font-bold text-base mb-1">
                      Add Form Question & Assign Marks
                    </h2>
                    <p className="text-xs text-slate-500 mb-4">
                      Create questions and set maximum marks for your domain's candidate form.
                    </p>

                    <form onSubmit={handleCreateQuestion} className="space-y-4">
                      {adminUser?.role === "ROOT_ADMIN" && (
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Domain
                          </label>
                          <select
                            value={questionDomain}
                            onChange={(e) => {
                              const newDom = e.target.value;
                              setQuestionDomain(newDom);
                              setSelectedSubsectionId("");
                              fetchFormQuestions(newDom);
                            }}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                          >
                            {DOMAINS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {subsectionsList.length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Subsection (Optional)
                          </label>
                          <select
                            value={selectedSubsectionId}
                            onChange={(e) =>
                              setSelectedSubsectionId(e.target.value)
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                          >
                            <option value="">General (No Subsection)</option>
                            {subsectionsList.map((sub: any) => (
                              <option key={sub.id} value={sub.id}>
                                {sub.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Question Prompt
                        </label>
                        <textarea
                          rows={3}
                          required
                          placeholder="Enter the question candidates will answer..."
                          value={newQuestionText}
                          onChange={(e) => setNewQuestionText(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Marks for Question
                          </label>
                          <input
                            type="number"
                            min={1}
                            required
                            value={newQuestionMarks}
                            onChange={(e) =>
                              setNewQuestionMarks(Number(e.target.value))
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1">
                            Question Order
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={newQuestionOrder}
                            onChange={(e) =>
                              setNewQuestionOrder(Number(e.target.value))
                            }
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-2.5 rounded-lg"
                      >
                        Add Question to {questionDomain}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-sm mb-2">
                      Create Form Subsection (Optional)
                    </h3>
                    <form
                      onSubmit={handleCreateSubsection}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        placeholder="e.g., Web Dev / AI-ML / Core"
                        value={newSubsectionName}
                        onChange={(e) => setNewSubsectionName(e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      />
                      <button
                        type="submit"
                        className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </div>

                <div className="lg:col-span-7 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-base">
                      {questionDomain} Form Questions ({questionsList.length})
                    </h2>
                    <button
                      onClick={() => fetchFormQuestions(questionDomain)}
                      className="text-xs text-indigo-600 font-semibold hover:underline"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="space-y-3">
                    {questionsList.length === 0 ? (
                      <p className="text-xs text-slate-500 py-8 text-center">
                        No questions created for {questionDomain} yet.
                      </p>
                    ) : (
                      questionsList.map((q: any, idx: number) => (
                        <div
                          key={q.id || idx}
                          className="p-4 rounded-lg border border-slate-200 bg-slate-50/40 space-y-3"
                        >
                          {editingQuestionId === q.id ? (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-indigo-600">
                                  Editing Question #{idx + 1}
                                </span>
                                <button
                                  onClick={() => setEditingQuestionId(null)}
                                  className="text-xs text-slate-500 hover:underline"
                                >
                                  Cancel
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                value={editQuestionText}
                                onChange={(e) =>
                                  setEditQuestionText(e.target.value)
                                }
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[11px] text-slate-500 mb-0.5">
                                    Max Marks
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={editQuestionMarks}
                                    onChange={(e) =>
                                      setEditQuestionMarks(
                                        Number(e.target.value)
                                      )
                                    }
                                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] text-slate-500 mb-0.5">
                                    Order
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={editQuestionOrder}
                                    onChange={(e) =>
                                      setEditQuestionOrder(
                                        Number(e.target.value)
                                      )
                                    }
                                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] text-slate-500 mb-0.5">
                                    Subsection
                                  </label>
                                  <select
                                    value={editQuestionSubsectionId}
                                    onChange={(e) =>
                                      setEditQuestionSubsectionId(
                                        e.target.value
                                      )
                                    }
                                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                                  >
                                    <option value="">General</option>
                                    {subsectionsList.map((sub: any) => (
                                      <option key={sub.id} value={sub.id}>
                                        {sub.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveEditedQuestion(q.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg"
                                >
                                  Save Changes
                                </button>
                                <button
                                  onClick={() => setEditingQuestionId(null)}
                                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold px-4 py-1.5 rounded-lg"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-indigo-600">
                                    Q{q.order || idx + 1}
                                  </span>
                                  {q.subsection?.name && (
                                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                                      {q.subsection.name}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-medium text-slate-800 mt-1">
                                  {q.text}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded">
                                  {q.maxMarks ?? 10} Marks
                                </span>
                                <button
                                  onClick={() => startEditingQuestion(q)}
                                  className="text-xs font-semibold text-blue-600 hover:bg-blue-50 px-2.5 py-1 rounded border border-blue-200"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="text-xs font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded border border-red-200"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ===================================================================== */}
            {/* TAB 2: REVIEW 1 (FORM EVALUATION, PILL TOGGLE, BATCH SEND & EXCEL)    */}
            {/* ===================================================================== */}
            {activeTab === "candidates" && (
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Review 1 Actions & Excel Export
                    </h2>
                    <p className="text-xs text-slate-500">
                      All candidates start as <strong>Not Shortlisted</strong>. Toggle the switch on candidates you want to shortlist, then click Release Shortlist to email everyone at once.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      onClick={handleExportExcel}
                      className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-lg"
                    >
                      Download Excel / CSV ({candidates.length})
                    </button>
                    <button
                      onClick={handleBatchReleaseShortlist}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm"
                    >
                      Release Shortlist & Send Emails to All ({shortlistedCount} Shortlisted)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-5 bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="font-bold text-base">
                        Submitted Applications
                      </h2>

                      <button
                        onClick={() => fetchCandidates(filterDomain)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                      >
                        Refresh
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Search by name, registration number or email..."
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />

                    {adminUser?.role === "ROOT_ADMIN" && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Domain:</span>
                        <select
                          value={filterDomain}
                          onChange={(e) => {
                            setFilterDomain(e.target.value);
                            setSelectedApp(null);
                            fetchCandidates(e.target.value);
                          }}
                          className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                        >
                          <option value="ALL">ALL DOMAINS</option>
                          {DOMAINS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-2 max-h-[550px] overflow-y-auto">
                      {displayedCandidates.length === 0 ? (
                        <p className="text-xs text-slate-500 py-8 text-center">
                          No submitted applications found.
                        </p>
                      ) : (
                        displayedCandidates.map((app) => (
                          <div
                            key={app.id}
                            onClick={() => handleSelectCandidate(app)}
                            className={`p-3.5 rounded-lg border cursor-pointer transition ${
                              selectedApp?.id === app.id
                                ? "border-blue-600 bg-blue-50/40"
                                : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold text-sm">
                                  {app.user?.name || "Candidate"}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {app.user?.regNumber} • {app.user?.email}
                                </p>
                              </div>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  app.review1Passed
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {app.review1Passed
                                  ? "SHORTLISTED"
                                  : "NOT SHORTLISTED"}
                              </span>
                            </div>
                            <div className="mt-2 flex justify-between items-center text-xs text-slate-500">
                              <span>Domain: {app.domain}</span>
                              {app.review1Marks !== null &&
                                app.review1Marks !== undefined && (
                                  <span className="font-semibold text-emerald-700">
                                    Review 1 Marks: {app.review1Marks}
                                  </span>
                                )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-7 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="font-bold text-base border-b border-slate-200 pb-3 mb-4">
                      Review 1: Candidate Form Evaluation
                    </h2>

                    {!selectedApp ? (
                      <p className="text-xs text-slate-500 py-12 text-center">
                        Select a candidate on the left to grade their responses question-by-question.
                      </p>
                    ) : (
                      <div className="space-y-5">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block">
                              Candidate Name
                            </span>
                            <span className="font-semibold text-slate-800">
                              {selectedApp.user?.name}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">
                              Registration Number
                            </span>
                            <span className="font-semibold text-slate-800">
                              {selectedApp.user?.regNumber}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Phone</span>
                            <span className="font-semibold text-slate-800">
                              {selectedApp.user?.phone || "N/A"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Domain</span>
                            <span className="font-semibold text-indigo-700">
                              {selectedApp.domain}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">
                              Shortlist Status
                            </span>
                            <span
                              className={`font-semibold ${
                                isShortlistedToggle
                                  ? "text-emerald-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {isShortlistedToggle
                                ? "Shortlisted"
                                : "Not Shortlisted"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">
                              Submitted On
                            </span>
                            <span className="font-semibold text-slate-800">
                              {selectedApp.submittedAt
                                ? new Date(
                                    selectedApp.submittedAt
                                  ).toLocaleDateString()
                                : "Submitted"}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-slate-800">
                              Individual Question Responses & Marks
                            </h3>
                            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg border border-emerald-200">
                              Total Score: {totalCalculatedMarks} Marks
                            </span>
                          </div>

                          {(selectedApp.user?.answers || []).filter(
                            (ans: any) =>
                              !ans.question?.domain ||
                              ans.question.domain === selectedApp.domain
                          ).length === 0 ? (
                            <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg">
                              No answers submitted for this domain yet.
                            </p>
                          ) : (
                            (selectedApp.user?.answers || [])
                              .filter(
                                (ans: any) =>
                                  !ans.question?.domain ||
                                  ans.question.domain === selectedApp.domain
                              )
                              .map((ans: any, idx: number) => {
                                const maxM = ans.question?.maxMarks || 10;
                                return (
                                  <div
                                    key={ans.id || idx}
                                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2"
                                  >
                                    <div className="flex justify-between items-start gap-4">
                                      <p className="text-xs font-semibold text-slate-800">
                                        Q{idx + 1}.{" "}
                                        {ans.question?.text || "Question"}
                                      </p>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <label className="text-[11px] text-slate-500">
                                          Marks:
                                        </label>
                                        <input
                                          type="number"
                                          min={0}
                                          max={maxM}
                                          value={questionScores[ans.id] ?? 0}
                                          onChange={(e) =>
                                            setQuestionScores({
                                              ...questionScores,
                                              [ans.id]: Number(e.target.value),
                                            })
                                          }
                                          className="w-16 border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-center bg-white"
                                        />
                                        <span className="text-xs text-slate-500">
                                          / {maxM}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-xs text-slate-700 bg-white p-2.5 rounded border border-slate-200 whitespace-pre-wrap">
                                      {ans.text}
                                    </p>
                                  </div>
                                );
                              })
                          )}
                        </div>

                        {/* SLIDING PILL TOGGLE SWITCH (iOS-Style Green/Gray Switch) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200 items-center">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                              <span className="block text-xs font-bold text-slate-800">
                                Shortlist for Interview Round
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {isShortlistedToggle
                                  ? "Shortlisted (Can book slot)"
                                  : "Not Shortlisted"}
                              </span>
                            </div>

                            {/* Green Pill Toggle Switch */}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isShortlistedToggle}
                              onClick={() => {
                                const nextVal = !isShortlistedToggle;
                                setIsShortlistedToggle(nextVal);
                                saveReview1Data(nextVal);
                              }}
                              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isShortlistedToggle
                                  ? "bg-emerald-500"
                                  : "bg-slate-300"
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                  isShortlistedToggle
                                    ? "translate-x-6"
                                    : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Reviewer Comments
                            </label>
                            <textarea
                              rows={3}
                              value={reviewComments}
                              onChange={(e) => setReviewComments(e.target.value)}
                              placeholder="Form evaluation feedback..."
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => saveReview1Data(isShortlistedToggle)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-lg"
                        >
                          Save Marks & Comments
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ===================================================================== */}
            {/* TAB 3: REVIEW 2 (ONLY CANDIDATES WHO PICKED A SLOT)                   */}
            {/* ===================================================================== */}
            {activeTab === "review2" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-base">
                      {adminUser?.role === "ROOT_ADMIN"
                        ? "Booked Interviewees (All)"
                        : "My Booked Interviewees"}
                    </h2>
                    <button
                      onClick={() => fetchCandidates(filterDomain)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                    >
                      Refresh
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Search booked interviewees..."
                    value={review2Search}
                    onChange={(e) => setReview2Search(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />

                  {adminUser?.role === "ROOT_ADMIN" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">Domain:</span>
                      <select
                        value={filterDomain}
                        onChange={(e) => {
                          setFilterDomain(e.target.value);
                          setSelectedInterviewApp(null);
                          fetchCandidates(e.target.value);
                        }}
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                      >
                        <option value="ALL">ALL DOMAINS</option>
                        {DOMAINS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2 max-h-[550px] overflow-y-auto">
                    {interviewCandidates.length === 0 ? (
                      <p className="text-xs text-slate-500 py-8 text-center">
                        No candidates have booked an interview slot yet.
                      </p>
                    ) : (
                      interviewCandidates.map((app) => (
                        <div
                          key={app.id}
                          onClick={() => handleSelectInterviewCandidate(app)}
                          className={`p-3.5 rounded-lg border cursor-pointer transition ${
                            selectedInterviewApp?.id === app.id
                              ? "border-indigo-600 bg-indigo-50/40"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-sm">
                                {app.user?.name || "Candidate"}
                              </p>
                              <p className="text-xs text-slate-500">
                                {app.user?.regNumber} • {app.user?.email}
                              </p>
                            </div>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                app.stage === "INTERVIEW"
                                  ? "bg-amber-100 text-amber-800"
                                  : app.stage === "SELECTED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : app.stage === "REJECTED"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {app.stage}
                            </span>
                          </div>

                          {app.booking?.slot && (
                            <div className="mt-2 text-[11px] bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded border border-emerald-200 font-medium">
                              Slot Booked:{" "}
                              {new Date(
                                app.booking.slot.startTime
                              ).toLocaleDateString()}{" "}
                              at{" "}
                              {new Date(
                                app.booking.slot.startTime
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}

                          <div className="mt-2 flex justify-between items-center text-xs text-slate-500">
                            <span>R1 Marks: {app.review1Marks ?? "N/A"}</span>
                            {app.review2Marks !== null &&
                              app.review2Marks !== undefined && (
                                <span className="font-semibold text-indigo-700">
                                  Interview Marks: {app.review2Marks}
                                </span>
                              )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Panel: Review 2 Evaluation */}
                <div className="lg:col-span-7 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="font-bold text-base border-b border-slate-200 pb-3 mb-4">
                    Review 2: Interview Grading & Final Selection
                  </h2>

                  {!selectedInterviewApp ? (
                    <p className="text-xs text-slate-500 py-12 text-center">
                      Select a booked candidate on the left to view their slot, conduct their interview, and enter final marks.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block">
                            Candidate Name
                          </span>
                          <span className="font-semibold text-slate-800">
                            {selectedInterviewApp.user?.name}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">
                            Registration Number
                          </span>
                          <span className="font-semibold text-slate-800">
                            {selectedInterviewApp.user?.regNumber}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Phone</span>
                          <span className="font-semibold text-slate-800">
                            {selectedInterviewApp.user?.phone || "N/A"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Domain</span>
                          <span className="font-semibold text-indigo-700">
                            {selectedInterviewApp.domain}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">
                            Current Stage
                          </span>
                          <span className="font-semibold text-slate-800">
                            {selectedInterviewApp.stage}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">
                            Review 1 Score
                          </span>
                          <span className="font-semibold text-emerald-700">
                            {selectedInterviewApp.review1Marks ?? 0} Marks
                          </span>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg border border-indigo-200 bg-indigo-50/50 space-y-1">
                        <h3 className="text-xs font-bold text-indigo-900">
                          Booked Interview Slot
                        </h3>
                        {selectedInterviewApp.booking?.slot && (
                          <div className="text-xs text-slate-700 space-y-1">
                            <p className="font-semibold">
                              {new Date(
                                selectedInterviewApp.booking.slot.startTime
                              ).toLocaleDateString()}{" "}
                              •{" "}
                              {new Date(
                                selectedInterviewApp.booking.slot.startTime
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              –{" "}
                              {new Date(
                                selectedInterviewApp.booking.slot.endTime
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            {selectedInterviewApp.booking.slot.meetingLink && (
                              <a
                                href={
                                  selectedInterviewApp.booking.slot.meetingLink
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block text-blue-600 font-semibold hover:underline"
                              >
                                Join Meeting:{" "}
                                {selectedInterviewApp.booking.slot.meetingLink}
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {selectedInterviewApp.review1Comments && (
                        <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                          <span className="font-semibold text-slate-600 block mb-1">
                            Review 1 Comments:
                          </span>
                          <p className="text-slate-800 whitespace-pre-wrap">
                            {selectedInterviewApp.review1Comments}
                          </p>
                        </div>
                      )}

                      <div className="space-y-4 pt-3 border-t border-slate-200">
                        {/* Final Selection Switch (Replacing Dropdown) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                            <div>
                              <span className="block text-xs font-bold text-slate-800">
                                Final Selection Decision
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {isFinalSelectedToggle
                                  ? "Candidate is SELECTED"
                                  : "Candidate is REJECTED"}
                              </span>
                            </div>

                            <button
                              type="button"
                              role="switch"
                              aria-checked={isFinalSelectedToggle}
                              onClick={() => {
                                const nextVal = !isFinalSelectedToggle;
                                setIsFinalSelectedToggle(nextVal);
                                handleSaveReview2(nextVal);
                              }}
                              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isFinalSelectedToggle
                                  ? "bg-emerald-500"
                                  : "bg-slate-300"
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                  isFinalSelectedToggle
                                    ? "translate-x-6"
                                    : "translate-x-0"
                                }`}
                              />
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Interview Marks (Review 2 Score)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={review2Marks}
                              onChange={(e) =>
                                setReview2Marks(Number(e.target.value))
                              }
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Interview Feedback & Comments (Review 2)
                          </label>
                          <textarea
                            rows={3}
                            value={review2Comments}
                            onChange={(e) => setReview2Comments(e.target.value)}
                            placeholder="Enter interview notes, strengths, and final evaluation remarks..."
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                          />
                        </div>

                        <button
                          onClick={() => handleSaveReview2(isFinalSelectedToggle)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-lg"
                        >
                          Save Interview Marks & Final Decision
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===================================================================== */}
            {/* TAB 4: CALENDLY-STYLE INTERVIEW SLOTS                                 */}
            {/* ===================================================================== */}
            {activeTab === "slots" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="font-bold text-base mb-1">
                    Create Interview Availability (Calendly Style)
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Pick a date on the calendar, choose your start and end time window, and set how many minutes each interview slot should last.
                  </p>
                  <form onSubmit={handleCreateSlots} className="space-y-4">
                    {adminUser?.role === "ROOT_ADMIN" && (
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Domain
                        </label>
                        <select
                          value={slotDomain}
                          onChange={(e) => {
                            setSlotDomain(e.target.value);
                            fetchSlots(e.target.value);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                        >
                          {DOMAINS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        1. Choose Calendar Date
                      </label>
                      <input
                        type="date"
                        required
                        value={slotDate}
                        onChange={(e) => setSlotDate(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          2. From Time
                        </label>
                        <input
                          type="time"
                          required
                          value={slotStartTime}
                          onChange={(e) => setSlotStartTime(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          3. To Time
                        </label>
                        <input
                          type="time"
                          required
                          value={slotEndTime}
                          onChange={(e) => setSlotEndTime(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        4. Duration Per Interview (Minutes)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={240}
                        required
                        value={slotDuration}
                        onChange={(e) =>
                          setSlotDuration(Number(e.target.value))
                        }
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        5. Meeting Link (Sent when candidate books slot)
                      </label>
                      <input
                        type="url"
                        required
                        placeholder="https://meet.google.com/..."
                        value={slotMeetingLink}
                        onChange={(e) => setSlotMeetingLink(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2.5 rounded-lg"
                    >
                      Generate Interview Slots
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-base">
                      Created Slots & Bookings ({slotsList.length})
                    </h2>
                    <button
                      onClick={() => fetchSlots(slotDomain)}
                      className="text-xs text-emerald-700 font-semibold hover:underline"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-[550px] overflow-y-auto">
                    {slotsList.length === 0 ? (
                      <p className="text-xs text-slate-500 py-8 text-center">
                        No slots created yet. Use the form on the left to add availability.
                      </p>
                    ) : (
                      slotsList.map((s: any) => (
                        <div
                          key={s.id}
                          className="p-3.5 rounded-lg border border-slate-200 flex justify-between items-center gap-4"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-800">
                              {new Date(s.startTime).toLocaleDateString()} •{" "}
                              {new Date(s.startTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              –{" "}
                              {new Date(s.endTime).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            {s.meetingLink && (
                              <a
                                href={s.meetingLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-blue-600 hover:underline block"
                              >
                                {s.meetingLink}
                              </a>
                            )}
                            {s.bookings?.length > 0 && (
                              <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                                Booked by:{" "}
                                {s.bookings
                                  .map((b: any) => {
                                    const u = b.application?.user;
                                    return u
                                      ? `${u.name} (${u.regNumber || u.email})`
                                      : "Candidate";
                                  })
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded ${
                                s.bookedCount > 0
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              Booked: {s.bookedCount} / {s.capacity}
                            </span>
                            
                            {s.bookedCount === 0 && (
                              <button
                                onClick={() => handleDeleteSlot(s.id)}
                                className="text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline"
                              >
                                Delete Slot
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ===================================================================== */}
            {/* TAB 5: ROOT ADMIN WHITELIST                                           */}
            {/* ===================================================================== */}
            {activeTab === "root" && adminUser?.role === "ROOT_ADMIN" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="font-bold text-base mb-1">
                    Assign & Whitelist Domain Heads
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Enter one or more comma-separated emails. Once added, those Domain Heads can log out, enter their email & desired password on the login screen, and click <strong>Create First-Time Password</strong>.
                  </p>
                  <form onSubmit={handleAssignDomainHeads} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Select Domain
                      </label>
                      <select
                        value={assignDomain}
                        onChange={(e) => setAssignDomain(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      >
                        {DOMAINS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Domain Head Email(s)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="head1@gmail.com, head2@gmail.com"
                        value={assignEmails}
                        onChange={(e) => setAssignEmails(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg"
                    >
                      Grant Domain Head Access
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-base">
                      Whitelisted Admins & Domain Heads ({domainHeadsList.length})
                    </h2>
                    <button
                      onClick={fetchDomainHeads}
                      className="text-xs text-indigo-600 font-semibold hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[450px] overflow-y-auto">
                    {domainHeadsList.map((adm) => (
                      <div
                        key={adm.id}
                        className="p-3 rounded-lg border border-slate-200 flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">
                            {adm.email}
                          </p>
                          <p className="text-slate-500">
                            Role: {adm.role}{" "}
                            {adm.domain ? `• Domain: ${adm.domain}` : ""}
                          </p>
                          {!adm.hasPassword && adm.setupCode && (
                            <p className="text-slate-600 mt-1">
                              Setup code (send privately):{" "}
                              <span className="font-mono font-semibold tracking-wider">{adm.setupCode}</span>
                            </p>
                          )}
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded font-semibold ${
                            adm.hasPassword
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {adm.hasPassword
                            ? "Password Active (Use Login)"
                            : "Ready for First-Time Setup"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}