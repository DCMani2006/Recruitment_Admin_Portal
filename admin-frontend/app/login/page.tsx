"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { IS_MOCK } from "@/lib/config";
import { useToast } from "@/components/TickerToast";
import { DOMAIN_LABELS, DomainEnum } from "@/lib/types";

const DEMO_USERS = [
  {
    key: "root",
    label: "Root Admin (all divisions)",
    email: "root@tam.vit.ac.in",
    role: "ROOT_ADMIN",
    domain: null,
  },
  {
    key: "DESIGN",
    label: DOMAIN_LABELS.DESIGN,
    email: "design.head@tam.vit.ac.in",
    role: "DOMAIN_HEAD",
    domain: "DESIGN" as DomainEnum,
  },
  {
    key: "MARKETING",
    label: DOMAIN_LABELS.MARKETING,
    email: "marketing.head@tam.vit.ac.in",
    role: "DOMAIN_HEAD",
    domain: "MARKETING" as DomainEnum,
  },
  {
    key: "R_AND_D",
    label: DOMAIN_LABELS.R_AND_D,
    email: "rd.head@tam.vit.ac.in",
    role: "DOMAIN_HEAD",
    domain: "R_AND_D" as DomainEnum,
  },
  {
    key: "MANAGEMENT",
    label: DOMAIN_LABELS.MANAGEMENT,
    email: "management.head@tam.vit.ac.in",
    role: "DOMAIN_HEAD",
    domain: "MANAGEMENT" as DomainEnum,
  },
  {
    key: "EDITORIAL",
    label: DOMAIN_LABELS.EDITORIAL,
    email: "editorial.head@tam.vit.ac.in",
    role: "DOMAIN_HEAD",
    domain: "EDITORIAL" as DomainEnum,
  },
  {
    key: "TECHNICAL",
    label: DOMAIN_LABELS.TECHNICAL,
    email: "tech.head@tam.vit.ac.in",
    role: "DOMAIN_HEAD",
    domain: "TECHNICAL" as DomainEnum,
  },
];

function mapErrorMessage(err: any): string {
  const msg = (err?.message || String(err || "")).toLowerCase();
  const status = err?.status;

  if (
    status === 401 ||
    msg.includes("401") ||
    msg.includes("invalid password") ||
    msg.includes("no account found") ||
    msg.includes("unauthorized")
  ) {
    return "Invalid email or password. Please verify your credentials.";
  }
  if (
    status === 403 ||
    msg.includes("403") ||
    msg.includes("forbidden") ||
    msg.includes("not authorized") ||
    msg.includes("clearance")
  ) {
    return "Access forbidden. Your account does not have editorial clearance.";
  }
  if (
    status === 400 ||
    msg.includes("400") ||
    msg.includes("bad request") ||
    msg.includes("validation")
  ) {
    return "Invalid request. Please check the entered details.";
  }
  if (
    msg.includes("rate") ||
    msg.includes("too many") ||
    msg.includes("slow down") ||
    msg.includes("limit")
  ) {
    return "Too many attempts. Please pause a moment before retrying.";
  }
  if (msg.includes("claimed")) {
    return "This account has not been claimed yet. Please complete First-time Setup.";
  }
  return err?.message || "Authentication dispatch failed.";
}

function LoginFormContent() {
  const [tab, setTab] = useState<"signin" | "setup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [selectedDemoKey, setSelectedDemoKey] = useState<string>("root");

  const { login, setup, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const redirectUrl = searchParams.get("redirect") || "/";
  const queryMsg = searchParams.get("msg");

  useEffect(() => {
    document.title = "Sign In · The TAM Times Admin";
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push(redirectUrl);
    }
  }, [authLoading, isAuthenticated, redirectUrl, router]);

  useEffect(() => {
    if (queryMsg === "session_expired") {
      setErrorMsg("Your editorial session has expired. Please sign in again.");
    } else if (queryMsg === "logged_out") {
      showToast("You have been signed out from the Editor's Desk.", "info");
    } else if (queryMsg === "unauthorized_desk") {
      setErrorMsg("You do not have credentials for that desk.");
    }
  }, [queryMsg, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setErrorMsg(null);
    const errors: Record<string, string | null> = {};

    if (!email.trim()) {
      errors.email = "Email address is required.";
    }

    if (!password) {
      errors.password = "Password is required.";
    }

    if (tab === "setup") {
      if (!name.trim() || name.trim().length < 2) {
        errors.name = "Full name is required (at least 2 characters).";
      }
      if (!setupCode.trim()) {
        errors.setupCode = "Setup code is required (provided by Root Admin).";
      }
      if (password.length < 8 || password.length > 72) {
        errors.password = "Password must be between 8 and 72 characters.";
      }
      if (password !== confirmPassword) {
        errors.confirmPassword = "Passwords do not match.";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);

    try {
      if (tab === "signin") {
        await login(email.trim(), password);
        showToast("Signed in successfully to the Editor's Desk.", "success");
      } else {
        await setup(email.trim(), password, name.trim(), setupCode.trim().toUpperCase());
        showToast("Account claimed and password registered successfully.", "success");
      }
      router.push(redirectUrl);
    } catch (err: any) {
      setErrorMsg(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    if (loading) return;
    const target =
      DEMO_USERS.find(
        (u) =>
          u.key === selectedDemoKey ||
          u.email === selectedDemoKey ||
          u.label === selectedDemoKey
      ) || DEMO_USERS[0];

    setLoading(true);
    setErrorMsg(null);
    setFieldErrors({});
    try {
      await login(target.email, "password123");
      if (target.role === "ROOT_ADMIN") {
        showToast("Signed in as Root Admin (All Desks).", "success");
      } else {
        const dLabel = target.domain ? DOMAIN_LABELS[target.domain] : "Division";
        showToast(`Signed in as Domain Head (${dLabel}).`, "success");
      }
      router.push(redirectUrl);
    } catch (err: any) {
      setErrorMsg(mapErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="paper slide-up"
      style={{
        width: "100%",
        maxWidth: "450px",
        padding: "1.25rem 1.75rem",
        boxShadow: "0 16px 50px rgba(0,0,0,0.8), 0 0 0 1px #2a201c",
        border: "2px solid var(--ink)",
        margin: "auto 0",
        boxSizing: "border-box",
      }}
    >
      {/* Top Strip Logo - THE TAM LOGO STRIP IS LOCKED: do not move, resize or change the height of the logo or its strip */}
      <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
        <hr className="rule-double" style={{ margin: "0 0 0.5rem 0" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "54px",
            lineHeight: 0,
          }}
        >
          <Image
            src="/images/logo.png"
            alt="The AI & ML Club"
            width={120}
            height={116}
            priority
            style={{
              height: "50px",
              width: "auto",
              objectFit: "contain",
              mixBlendMode: "multiply",
            }}
          />
        </div>
        <hr className="rule-double" style={{ margin: "0.5rem 0 0.75rem 0" }} />
      </div>

      {/* Masthead Header */}
      <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-masthead)",
            fontSize: "2.1rem",
            lineHeight: 1,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          The TAM Times
        </h1>
        <div
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--stamp)",
            fontWeight: 700,
            marginTop: "0.2rem",
          }}
        >
          The Editor's Desk
        </div>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontStyle: "italic",
            fontSize: "0.9rem",
            color: "var(--ink-soft)",
            marginTop: "0.2rem",
          }}
        >
          It's a place for everyone to learn
        </p>
      </div>

      {/* Tab Switcher */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid var(--ink)",
          marginBottom: "0.85rem",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setTab("signin");
            setErrorMsg(null);
            setFieldErrors({});
          }}
          style={{
            flex: 1,
            padding: "0.45rem 0.5rem",
            fontFamily: "var(--font-label)",
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontWeight: tab === "signin" ? 700 : 500,
            backgroundColor: tab === "signin" ? "var(--ink)" : "transparent",
            color: tab === "signin" ? "var(--paper)" : "var(--ink)",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("setup");
            setErrorMsg(null);
            setFieldErrors({});
          }}
          style={{
            flex: 1,
            padding: "0.45rem 0.5rem",
            fontFamily: "var(--font-label)",
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontWeight: tab === "setup" ? 700 : 500,
            backgroundColor: tab === "setup" ? "var(--ink)" : "transparent",
            color: tab === "setup" ? "var(--paper)" : "var(--ink)",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          First-time Setup
        </button>
      </div>

      {/* Error Notification Banner */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            padding: "0.55rem 0.75rem",
            border: "1.5px solid var(--stamp)",
            backgroundColor: "rgba(139, 30, 30, 0.08)",
            marginBottom: "0.85rem",
            color: "var(--stamp)",
            fontSize: "0.82rem",
            fontFamily: "var(--font-body)",
            lineHeight: 1.35,
          }}
        >
          <strong style={{ fontFamily: "var(--font-label)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            ✦ Editorial Notice:
          </strong>{" "}
          {errorMsg}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {tab === "setup" && (
          <div>
            <label
              htmlFor="fullName"
              style={{
                display: "block",
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "0.2rem",
                color: "var(--ink)",
                fontWeight: 600,
              }}
            >
              FULL NAME
            </label>
            <input
              id="fullName"
              name="name"
              type="text"
              required
              autoComplete="name"
              className="newspaper-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: null }));
              }}
            />
            {fieldErrors.name && (
              <span
                role="alert"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-body)",
                  color: "var(--stamp)",
                  marginTop: "0.2rem",
                  display: "block",
                }}
              >
                ✦ {fieldErrors.name}
              </span>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="emailAddress"
            style={{
              display: "block",
              fontFamily: "var(--font-label)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "0.2rem",
              color: "var(--ink)",
              fontWeight: 600,
            }}
          >
            EMAIL ADDRESS
          </label>
          <input
            id="emailAddress"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="newspaper-input"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
            }}
          />
          {tab === "setup" && (
            <span
              style={{
                fontSize: "0.72rem",
                fontFamily: "var(--font-body)",
                fontStyle: "italic",
                color: "var(--ink-soft)",
                marginTop: "0.2rem",
                display: "block",
              }}
            >
              Use the email the Root Admin registered for you.
            </span>
          )}
          {fieldErrors.email && (
            <span
              role="alert"
              style={{
                fontSize: "0.72rem",
                fontFamily: "var(--font-body)",
                color: "var(--stamp)",
                marginTop: "0.2rem",
                display: "block",
              }}
            >
              ✦ {fieldErrors.email}
            </span>
          )}
        </div>

        {tab === "setup" && (
          <div>
            <label
              htmlFor="setupCodeInput"
              style={{
                display: "block",
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "0.2rem",
                color: "var(--ink)",
                fontWeight: 600,
              }}
            >
              SETUP CODE (10 CHARACTERS)
            </label>
            <input
              id="setupCodeInput"
              name="setupCode"
              type="text"
              required
              placeholder="e.g. 7F3A9BC210"
              className="newspaper-input"
              value={setupCode}
              onChange={(e) => {
                setSetupCode(e.target.value.toUpperCase());
                if (fieldErrors.setupCode) setFieldErrors((prev) => ({ ...prev, setupCode: null }));
              }}
            />
            <span
              style={{
                fontSize: "0.72rem",
                fontFamily: "var(--font-body)",
                fontStyle: "italic",
                color: "var(--ink-soft)",
                marginTop: "0.2rem",
                display: "block",
              }}
            >
              Provided by the Root Admin when your account was assigned.
            </span>
            {fieldErrors.setupCode && (
              <span
                role="alert"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-body)",
                  color: "var(--stamp)",
                  marginTop: "0.2rem",
                  display: "block",
                }}
              >
                ✦ {fieldErrors.setupCode}
              </span>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="passwordInput"
            style={{
              display: "block",
              fontFamily: "var(--font-label)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "0.2rem",
              color: "var(--ink)",
              fontWeight: 600,
            }}
          >
            PASSWORD
          </label>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              id="passwordInput"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              className="newspaper-input"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: null }));
              }}
              style={{ paddingRight: "3.8rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: "4px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--ink-soft)",
                fontFamily: "var(--font-label)",
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              {showPassword ? "HIDE" : "SHOW"}
            </button>
          </div>
          {tab === "setup" && (
            <span
              style={{
                fontSize: "0.72rem",
                fontFamily: "var(--font-body)",
                fontStyle: "italic",
                color: "var(--ink-soft)",
                marginTop: "0.2rem",
                display: "block",
              }}
            >
              Must be between 8 and 72 characters.
            </span>
          )}
          {fieldErrors.password && (
            <span
              role="alert"
              style={{
                fontSize: "0.72rem",
                fontFamily: "var(--font-body)",
                color: "var(--stamp)",
                marginTop: "0.2rem",
                display: "block",
              }}
            >
              ✦ {fieldErrors.password}
            </span>
          )}
        </div>

        {tab === "setup" && (
          <div>
            <label
              htmlFor="confirmPasswordInput"
              style={{
                display: "block",
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "0.2rem",
                color: "var(--ink)",
                fontWeight: 600,
              }}
            >
              CONFIRM PASSWORD
            </label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                id="confirmPasswordInput"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                className="newspaper-input"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword)
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: null }));
                }}
                style={{ paddingRight: "3.8rem" }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "4px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "var(--ink-soft)",
                  fontFamily: "var(--font-label)",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                {showConfirmPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <span
                role="alert"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-body)",
                  color: "var(--stamp)",
                  marginTop: "0.2rem",
                  display: "block",
                }}
              >
                ✦ {fieldErrors.confirmPassword}
              </span>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="ink-btn"
          style={{
            marginTop: "0.35rem",
            width: "100%",
            textAlign: "center",
            padding: "0.55rem 1rem",
            fontSize: "0.82rem",
          }}
        >
          {loading
            ? tab === "signin"
              ? "VERIFYING CREDENTIALS..."
              : "CLAIMING ACCOUNT..."
            : tab === "signin"
            ? "ENTER THE EDITOR'S DESK"
            : "CLAIM & REGISTER ACCOUNT"}
        </button>
      </form>

      {/* Demo Access: Render ONLY in mock mode */}
      {process.env.NEXT_PUBLIC_USE_MOCK !== "false" && (
        <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px solid var(--ink)" }}>
          <span
            style={{
              display: "block",
              textAlign: "center",
              fontFamily: "var(--font-label)",
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--ink-soft)",
              marginBottom: "0.45rem",
              fontWeight: 600,
            }}
          >
            ✦ DEMO ACCESS ✦
          </span>
          <div className="demo-access-control" style={{ width: "100%", boxSizing: "border-box" }}>
            <label
              htmlFor="demoUserSelect"
              style={{
                display: "block",
                fontFamily: "var(--font-label)",
                fontSize: "0.74rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: "0.3rem",
                color: "var(--ink)",
                fontWeight: 700,
              }}
            >
              SIGN IN AS
            </label>
            <div className="demo-control-row">
              <select
                id="demoUserSelect"
                value={selectedDemoKey}
                onChange={(e) => setSelectedDemoKey(e.target.value)}
                className="newspaper-select demo-select"
                disabled={loading}
                style={{
                  height: "36px",
                  padding: "0.3rem 0.5rem",
                  fontSize: "0.76rem",
                }}
              >
                {DEMO_USERS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={loading}
                className="ink-btn demo-btn"
                style={{
                  height: "36px",
                  padding: "0.35rem 0.8rem",
                  fontSize: "0.74rem",
                  letterSpacing: "0.08em",
                }}
              >
                {loading ? "ENTERING..." : "ENTER AS SELECTED"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#14100E",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.75rem 1rem",
        boxSizing: "border-box",
      }}
    >
      <Suspense fallback={<div style={{ color: "var(--paper)", fontStyle: "italic" }}>Loading Editor's Desk...</div>}>
        <LoginFormContent />
      </Suspense>
    </div>
  );
}
