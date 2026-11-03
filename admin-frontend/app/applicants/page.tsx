"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminShell } from "@/components/AdminShell";
import { StageStamp } from "@/components/StageStamp";
import { Num } from "@/components/Num";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/client";
import {
  Application,
  DomainEnum,
  ApplicationStage,
  DOMAINS,
  DOMAIN_LABELS,
  DOMAIN_SHORT_LABELS,
  STAGE_LABELS,
} from "@/lib/types";
import { formatDate, formatDateTime, REVIEW2_MAX } from "@/lib/config";

const STAGE_FILTERS: { key: string; label: string; stage?: ApplicationStage }[] = [
  { key: "ALL", label: "All" },
  { key: "FORM_FILLING", label: "Waiting for review", stage: "FORM_FILLING" },
  { key: "SHORTLISTED", label: "Shortlisted", stage: "SHORTLISTED" },
  { key: "SLOT_CHOOSING", label: "Slot choosing", stage: "SLOT_CHOOSING" },
  { key: "INTERVIEW", label: "Interview", stage: "INTERVIEW" },
  { key: "SELECTED", label: "Selected", stage: "SELECTED" },
  { key: "REJECTED", label: "Not taken forward", stage: "REJECTED" },
];

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
  const router = useRouter();
  const searchParams = useSearchParams();

  const isRoot = user?.role === "ROOT_ADMIN";
  const userDomain = user?.domain;

  // URL State
  const initialDomain = searchParams.get("domain") || (isRoot ? "ALL" : userDomain || "ALL");
  const initialStage = searchParams.get("stage") || "ALL";
  const initialQ = searchParams.get("q") || "";
  const initialSort = searchParams.get("sort") || "oldest";
  const initialPage = parseInt(searchParams.get("page") || "1", 10);

  const [selectedDomain, setSelectedDomain] = useState<string>(initialDomain);
  const [selectedStage, setSelectedStage] = useState<string>(initialStage);
  const [searchQuery, setSearchQuery] = useState<string>(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initialQ);
  const [sortOrder, setSortOrder] = useState<string>(initialSort);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (selectedStage && selectedStage !== "ALL") params.set("stage", selectedStage);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (sortOrder && sortOrder !== "oldest") params.set("sort", sortOrder);
    if (currentPage > 1) params.set("page", String(currentPage));

    const queryStr = params.toString();
    const targetUrl = `/applicants${queryStr ? `?${queryStr}` : ""}`;
    window.history.replaceState(null, "", targetUrl);
  }, [selectedDomain, selectedStage, debouncedQuery, sortOrder, currentPage]);

  // Fetch applications
  const fetchApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getApplicants(isRoot ? "ALL" : userDomain || "ALL");
      setApplications(data);
    } catch (err: any) {
      setError(err.message || "Failed to load applicant listings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [isRoot, userDomain]);

  // Domain filtered pool
  const domainPool = useMemo(() => {
    if (!selectedDomain || selectedDomain === "ALL") return applications;
    return applications.filter((a) => a.domain === selectedDomain);
  }, [applications, selectedDomain]);

  // Live stage counts based on current domain pool
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: domainPool.length };
    STAGE_FILTERS.forEach((f) => {
      if (f.stage) counts[f.stage] = 0;
    });
    domainPool.forEach((a) => {
      if (counts[a.stage] !== undefined) counts[a.stage]++;
    });
    return counts;
  }, [domainPool]);

  // Filtered & Sorted applications
  const filteredAndSorted = useMemo(() => {
    let result = [...domainPool];

    // Filter stage
    if (selectedStage && selectedStage !== "ALL") {
      result = result.filter((a) => a.stage === selectedStage);
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
  }, [domainPool, selectedStage, debouncedQuery, sortOrder]);

  // Save current filtered list IDs to sessionStorage for Previous/Next navigation in review desk
  useEffect(() => {
    try {
      const ids = filteredAndSorted.map((a) => a.id);
      sessionStorage.setItem("tam_applicant_ids", JSON.stringify(ids));
    } catch {}
  }, [filteredAndSorted]);

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
    setSelectedStage("ALL");
    setSearchQuery("");
    setDebouncedQuery("");
    setSortOrder("oldest");
    setCurrentPage(1);
  };

  const handleExportCSV = () => {
    const divisionLabel = selectedDomain === "ALL" ? "All Divisions" : DOMAIN_LABELS[selectedDomain as DomainEnum] || selectedDomain;
    const headers = [
      "Name",
      "Registration Number",
      "Email",
      "Phone",
      "Division",
      "Stage",
      "Submitted Date",
      "Round 1 Marks",
      "Round 1 Maximum",
      "Round 1 Comments",
      "Round 2 Marks",
      "Interview Date and Time",
    ];

    const rows = filteredAndSorted.map((app) => {
      const maxMarks = (app.user?.answers || [])
        .filter((a) => a.question && a.question.domain === app.domain)
        .reduce((sum, a) => sum + (a.question?.maxMarks || 0), 0) || 35;

      const interviewStr = app.booking?.slot ? formatDateTime(app.booking.slot.startTime) : "—";
      const r1Formatted = app.review1Marks !== null && app.review1Marks !== undefined
        ? `${app.review1Marks} / ${maxMarks}`
        : "Not scored";
      const r2Formatted = app.review2Marks !== null && app.review2Marks !== undefined
        ? `${app.review2Marks} / ${REVIEW2_MAX}`
        : "—";
      const r1CommentsFormatted = app.review1Comments || "—";

      return [
        sanitizeForCSV(app.user?.name),
        sanitizeForCSV(app.user?.regNumber || "—"),
        sanitizeForCSV(app.user?.email || "—"),
        sanitizeForCSV(app.user?.phone || "—"),
        sanitizeForCSV(DOMAIN_LABELS[app.domain] || app.domain),
        sanitizeForCSV(STAGE_LABELS[app.stage] || app.stage),
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

  const headlineDivision = isRoot && selectedDomain === "ALL"
    ? "ALL DIVISIONS"
    : DOMAIN_LABELS[selectedDomain as DomainEnum]?.toUpperCase() || selectedDomain;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <section style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.25rem" }}>
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
          Everyone who has submitted the form. Open a name to review it.
        </p>
      </section>

      {/* Error state */}
      {error && (
        <div style={{ padding: "0.85rem 1rem", border: "2px solid var(--stamp)", backgroundColor: "rgba(139, 30, 30, 0.08)", color: "var(--stamp)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span><strong>✦ Notice:</strong> {error}</span>
          <button type="button" onClick={fetchApplications} className="stamp-btn" style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}>
            Retry Dispatch
          </button>
        </div>
      )}

      {/* Division Selector (Root only) */}
      {isRoot && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", borderBottom: "1px dashed var(--ink)", paddingBottom: "0.75rem" }}>
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--ink-soft)" }}>
            Division:
          </span>
          <button
            type="button"
            onClick={() => { setSelectedDomain("ALL"); setCurrentPage(1); }}
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
              onClick={() => { setSelectedDomain(dom); setCurrentPage(1); }}
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

      {/* Stage Filter Chips */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
        {STAGE_FILTERS.map((f) => {
          const isActive = selectedStage === f.key;
          const count = stageCounts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => { setSelectedStage(f.key); setCurrentPage(1); }}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem", flexWrap: "wrap" }}>
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
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
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
            onChange={(e) => { setSortOrder(e.target.value); setCurrentPage(1); }}
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
          description="Adjust your search keywords, stage filters, or division selection."
          onClear={handleClearFilters}
        />
      ) : (
        <div style={{ overflowX: "auto", borderTop: "2px solid var(--ink)" }}>
          <table className="classified-table" style={{ width: "100%", marginTop: 0 }}>
            <thead>
              <tr>
                <th style={{ width: "120px", whiteSpace: "nowrap" }}>Reg. no.</th>
                <th style={{ whiteSpace: "nowrap" }}>Name</th>
                {(isRoot || selectedDomain === "ALL") && <th style={{ width: "140px", whiteSpace: "nowrap" }}>Division</th>}
                <th style={{ width: "130px", whiteSpace: "nowrap" }}>Submitted</th>
                <th style={{ width: "110px", whiteSpace: "nowrap" }}>Round 1</th>
                <th style={{ width: "170px", whiteSpace: "nowrap" }}>Stage</th>
                <th style={{ width: "190px", whiteSpace: "nowrap" }}>Interview</th>
                <th style={{ width: "110px", textAlign: "right", whiteSpace: "nowrap" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedList.map((app) => {
                const totalMax = (app.user?.answers || [])
                  .filter((a) => a.question && a.question.domain === app.domain)
                  .reduce((sum, a) => sum + (a.question?.maxMarks || 0), 0) || 35;

                const interviewTime = app.booking?.slot
                  ? formatDateTime(app.booking.slot.startTime)
                  : "—";

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
                    <td style={{ width: "120px", fontWeight: 700, whiteSpace: "nowrap" }}>
                      <Num>{app.user?.regNumber || "—"}</Num>
                    </td>
                    <td
                      style={{
                        maxWidth: "260px",
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
                        style={{
                          width: "140px",
                          fontSize: "0.78rem",
                          textTransform: "uppercase",
                          fontFamily: "var(--font-label)",
                          whiteSpace: "nowrap",
                        }}
                        title={DOMAIN_LABELS[app.domain]}
                      >
                        {DOMAIN_SHORT_LABELS[app.domain]}
                      </td>
                    )}
                    <td style={{ width: "130px", fontSize: "0.82rem", whiteSpace: "nowrap" }}>
                      <Num>{formatDate(app.submittedAt || "")}</Num>
                    </td>
                    <td style={{ width: "110px", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
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
                    <td style={{ width: "170px", whiteSpace: "nowrap" }}>
                      <StageStamp stage={app.stage} size="sm" />
                    </td>
                    <td style={{ width: "190px", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                      {interviewTime !== "—" ? <Num>{interviewTime}</Num> : "—"}
                    </td>
                    <td style={{ width: "110px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link
                        href={`/applicants/${app.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="ink-btn-secondary"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.72rem",
                          padding: "0.22rem 0.65rem",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          fontWeight: 600,
                          lineHeight: 1.2,
                        }}
                      >
                        OPEN →
                      </Link>
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
    </div>
  );
}
