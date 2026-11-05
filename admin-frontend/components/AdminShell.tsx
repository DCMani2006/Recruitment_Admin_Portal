"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { TopStripLogo } from "./TopStripLogo";
import { DOMAIN_LABELS } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  rootOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "Question Desk", href: "/form-builder" },
  { label: "Applicant Listings", href: "/applicants" },
  { label: "Interview Ledger", href: "/interviews" },
  { label: "Slot Planner", href: "/slots" },
  { label: "The Masthead (Team)", href: "/team", rootOnly: true },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isRoot = user?.role === "ROOT_ADMIN";
  const domainLabel = user?.domain ? DOMAIN_LABELS[user.domain] : "All Divisions";

  const userName = user?.name || user?.email || "Editor";
  const roleDisplay = isRoot
    ? "Root Admin"
    : `Domain Head · ${user?.domain ? DOMAIN_LABELS[user.domain] : "General"}`;

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#14100E",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "clamp(16px, 3vh, 32px) clamp(12px, 2vw, 24px)",
        paddingBottom: "calc(clamp(16px, 3vh, 32px) + env(safe-area-inset-bottom, 0px))",
        boxSizing: "border-box",
      }}
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Main broadsheet container - Capped at 1280px and centered */}
      <main
        id="main-content"
        className="paper"
        style={{
          width: "100%",
          maxWidth: "1280px",
          minHeight: "calc(100dvh - 64px)",
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem clamp(1rem, 2.5vw, 2rem)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px #2a201c",
          position: "relative",
          boxSizing: "border-box",
          margin: "0 auto",
        }}
      >
        {/* 1. Centred Top Strip Logo (LOCKED: exact logo component between double rules) */}
        <TopStripLogo />

        {/* 2. Masthead Row */}
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            padding: "0.25rem 0 0.5rem 0",
            borderBottom: "1px solid var(--ink)",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "var(--font-masthead)",
                fontSize: "1.85rem",
                color: "var(--ink)",
                lineHeight: 1,
              }}
            >
              The TAM Times
            </span>
            <span
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--ink-soft)",
              }}
            >
              Recruitment Edition · {domainLabel} Desk
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              className="admin-desktop-desk-tag"
              style={{
                fontFamily: "var(--font-headline)",
                fontSize: "1.2rem",
                letterSpacing: "0.12em",
                color: "var(--stamp)",
                textTransform: "uppercase",
              }}
            >
              The Editor&apos;s Desk
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="mobile-nav-toggle-btn"
              aria-label="Toggle section menu"
              aria-expanded={mobileMenuOpen}
              style={{
                background: "transparent",
                border: "1px solid var(--ink)",
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "0.3rem 0.6rem",
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              {mobileMenuOpen ? "✕ Close" : "✦ Menu"}
            </button>
          </div>
        </header>

        {/* 3. Section Nav (styled like newspaper section tabs) */}
        <nav
          className={`admin-section-nav ${mobileMenuOpen ? "mobile-open" : ""}`}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.2rem",
            rowGap: "0.35rem",
            marginTop: "0.5rem",
            marginBottom: "1.5rem",
            borderBottom: "2px solid var(--ink)",
            paddingBottom: "0",
          }}
        >
          {NAV_ITEMS.map((item) => {
            if (item.rootOnly && !isRoot) return null;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.76rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  padding: "0.4rem 0.65rem",
                  color: isActive ? "var(--paper)" : "var(--ink)",
                  backgroundColor: isActive ? "var(--ink)" : "transparent",
                  textDecoration: "none",
                  borderTop: isActive ? "2px solid var(--ink)" : "1px solid transparent",
                  borderLeft: "1px solid transparent",
                  borderRight: "1px solid transparent",
                  fontWeight: isActive ? 600 : 500,
                  transition: "all 0.15s ease",
                  display: "inline-block",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 4. Page Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {children}
        </div>

        {/* 5. Footer Bar */}
        <footer
          style={{
            marginTop: "2.5rem",
            paddingTop: "0.75rem",
            borderTop: "2px solid var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            fontFamily: "var(--font-label)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--ink-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 700, color: "var(--ink)" }}>THE TAM TIMES</span>
          </div>

          <div style={{ fontWeight: 700, letterSpacing: "0.2em", color: "var(--ink)" }}>
            ADMIN DESK
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span>
              {user ? (
                <>
                  <strong style={{ color: "var(--ink)" }}>{userName}</strong> · {roleDisplay}
                </>
              ) : (
                "NOT SIGNED IN"
              )}
            </span>
            {user && (
              <button
                type="button"
                onClick={logout}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--stamp)",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  textTransform: "uppercase",
                  letterSpacing: "inherit",
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                SIGN OUT
              </button>
            )}
            {process.env.NEXT_PUBLIC_BUILD_DISPLAY && (
              <span
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.05em",
                  color: "var(--ink-soft)",
                  opacity: 0.8,
                  marginLeft: "auto",
                }}
              >
                {process.env.NEXT_PUBLIC_BUILD_DISPLAY}
              </span>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
