import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { DomainType, Role, Stage, Round1Decision, EmailType, EmailStatus } from "@prisma/client";

// Set environment
process.env.JWT_SECRET = "test_jwt_secret_pass_b";
process.env.EMAIL_DRY_RUN = "true";
process.env.CANDIDATE_SITE_URL = "https://tam-times.vercel.app";

interface TestApp {
  id: string;
  domain: DomainType;
  stage: Stage;
  submittedAt: Date | null;
  createdAt: Date;
  review1Marks: number | null;
  review1Comments: string | null;
  review1Passed: boolean;
  review2Marks: number | null;
  review2Comments: string | null;
  review2Passed: boolean;
  round1Decision: Round1Decision | null;
  round1DecisionAt: Date | null;
  round1EmailSentAt: Date | null;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    regNumber: string;
    answers: any[];
  };
  booking?: {
    id: string;
    applicationId: string;
    slotId: string;
    slot: {
      id: string;
      domain: DomainType;
      startTime: Date;
      endTime: Date;
      capacity: number;
      bookedCount: number;
      meetingLink: string | null;
    };
  } | null;
  emails: any[];
}

const appsDb = new Map<string, TestApp>();
const emailLogsDb = new Map<string, any>();
const adminsDb = new Map<string, any>();
const questionsDb = new Map<string, any>();
const subsectionsDb = new Map<string, any>();
const slotsDb = new Map<string, any>();

// SEED TEST DATA WITH "TEST" NAMES AND REG NUMBERS
const testAppShortlistId = "app_TEST_shortlist_01";
const testAppRejectId = "app_TEST_reject_01";
const testAppInterviewFutureId = "app_TEST_interview_future_01";
const testAppInterviewPastId = "app_TEST_interview_past_01";

// 1. TEST Shortlist candidate
appsDb.set(testAppShortlistId, {
  id: testAppShortlistId,
  domain: DomainType.TECHNICAL,
  stage: Stage.FORM_FILLING,
  submittedAt: new Date("2026-10-26T10:00:00Z"),
  createdAt: new Date("2026-10-25T10:00:00Z"),
  review1Marks: 28,
  review1Comments: "Strong technical candidate",
  review1Passed: false,
  review2Marks: null,
  review2Comments: null,
  review2Passed: false,
  round1Decision: null,
  round1DecisionAt: null,
  round1EmailSentAt: null,
  userId: "user_TEST_01",
  user: {
    id: "user_TEST_01",
    name: "TEST Candidate Shortlist",
    email: "test.shortlist@example.com",
    phone: "9876543201",
    regNumber: "TEST-24BCE001",
    answers: [],
  },
  booking: null,
  emails: [],
});

// 2. TEST Reject candidate
appsDb.set(testAppRejectId, {
  id: testAppRejectId,
  domain: DomainType.TECHNICAL,
  stage: Stage.FORM_FILLING,
  submittedAt: new Date("2026-10-26T11:00:00Z"),
  createdAt: new Date("2026-10-25T11:00:00Z"),
  review1Marks: 12,
  review1Comments: "Candidate lacks basic programming prerequisites.",
  review1Passed: false,
  review2Marks: null,
  review2Comments: null,
  review2Passed: false,
  round1Decision: null,
  round1DecisionAt: null,
  round1EmailSentAt: null,
  userId: "user_TEST_02",
  user: {
    id: "user_TEST_02",
    name: "TEST Candidate Reject",
    email: "test.reject@example.com",
    phone: "9876543202",
    regNumber: "TEST-24BCE002",
    answers: [],
  },
  booking: null,
  emails: [],
});

// 3. TEST Interview candidate with FUTURE slot
const futureEndTime = new Date(Date.now() + 2 * 3600 * 1000); // 2 hours in future
appsDb.set(testAppInterviewFutureId, {
  id: testAppInterviewFutureId,
  domain: DomainType.TECHNICAL,
  stage: Stage.INTERVIEW,
  submittedAt: new Date("2026-10-25T10:00:00Z"),
  createdAt: new Date("2026-10-24T10:00:00Z"),
  review1Marks: 30,
  review1Comments: "Shortlisted",
  review1Passed: true,
  review2Marks: null,
  review2Comments: null,
  review2Passed: false,
  round1Decision: Round1Decision.SHORTLIST,
  round1DecisionAt: new Date("2026-10-27T10:00:00Z"),
  round1EmailSentAt: new Date("2026-10-27T10:05:00Z"),
  userId: "user_TEST_03",
  user: {
    id: "user_TEST_03",
    name: "TEST Candidate Future Interview",
    email: "test.future@example.com",
    phone: "9876543203",
    regNumber: "TEST-24BCE003",
    answers: [],
  },
  booking: {
    id: "booking_TEST_01",
    applicationId: testAppInterviewFutureId,
    slotId: "slot_TEST_future_01",
    slot: {
      id: "slot_TEST_future_01",
      domain: DomainType.TECHNICAL,
      startTime: new Date(Date.now() + 3600 * 1000),
      endTime: futureEndTime,
      capacity: 1,
      bookedCount: 1,
      meetingLink: "https://meet.google.com/test-future",
    },
  },
  emails: [],
});

// 4. TEST Interview candidate with PAST slot (ended 30 mins ago)
const pastEndTime = new Date(Date.now() - 30 * 60 * 1000);
const pastStartTime = new Date(Date.now() - 45 * 60 * 1000);
appsDb.set(testAppInterviewPastId, {
  id: testAppInterviewPastId,
  domain: DomainType.TECHNICAL,
  stage: Stage.INTERVIEW,
  submittedAt: new Date("2026-10-25T10:00:00Z"),
  createdAt: new Date("2026-10-24T10:00:00Z"),
  review1Marks: 32,
  review1Comments: "Shortlisted",
  review1Passed: true,
  review2Marks: null,
  review2Comments: null,
  review2Passed: false,
  round1Decision: Round1Decision.SHORTLIST,
  round1DecisionAt: new Date("2026-10-27T10:00:00Z"),
  round1EmailSentAt: new Date("2026-10-27T10:05:00Z"),
  userId: "user_TEST_04",
  user: {
    id: "user_TEST_04",
    name: "TEST Candidate Past Interview",
    email: "test.past@example.com",
    phone: "9876543204",
    regNumber: "TEST-24BCE004",
    answers: [],
  },
  booking: {
    id: "booking_TEST_02",
    applicationId: testAppInterviewPastId,
    slotId: "slot_TEST_past_01",
    slot: {
      id: "slot_TEST_past_01",
      domain: DomainType.TECHNICAL,
      startTime: pastStartTime,
      endTime: pastEndTime,
      capacity: 1,
      bookedCount: 1,
      meetingLink: "https://meet.google.com/test-past",
    },
  },
  emails: [],
});

// Mock Prisma Implementation
const mockPrisma = {
  admin: {
    count: async () => adminsDb.size,
    findUnique: async ({ where }: any) => adminsDb.get(where.id || where.email) || null,
  },
  user: {
    count: async () => appsDb.size,
  },
  application: {
    count: async (args: any) => {
      const list = await mockPrisma.application.findMany(args);
      return list.length;
    },
    findUnique: async ({ where }: any) => {
      const app = appsDb.get(where.id);
      return app ? JSON.parse(JSON.stringify(app)) : null;
    },
    findMany: async (args: any) => {
      const { where, take } = args || {};
      let list = Array.from(appsDb.values());
      if (where) {
        if (where.domain) list = list.filter((a) => a.domain === where.domain);
        if (where.stage) list = list.filter((a) => a.stage === where.stage);
        if (where.submittedAt && where.submittedAt.not !== undefined) {
          list = list.filter((a) => a.submittedAt !== null);
        }
        if (where.round1Decision !== undefined) {
          list = list.filter((a) => a.round1Decision === where.round1Decision);
        }
        if (where.round1EmailSentAt === null) {
          list = list.filter((a) => a.round1EmailSentAt === null);
        }
        if (where.round1EmailSentAt && where.round1EmailSentAt.not !== undefined) {
          list = list.filter((a) => a.round1EmailSentAt !== null);
        }
        if (where.emails?.none) {
          list = list.filter((a) => {
            const sentLog = a.emails.find(
              (e: any) => e.type === where.emails.none.type && e.status === where.emails.none.status
            );
            return !sentLog;
          });
        }
      }
      if (take) list = list.slice(0, take);
      return JSON.parse(JSON.stringify(list));
    },
    update: async ({ where, data }: any) => {
      const app = appsDb.get(where.id);
      if (!app) throw new Error("Application not found");
      Object.assign(app, data);
      return JSON.parse(JSON.stringify(app));
    },
  },
  emailLog: {
    create: async ({ data }: any) => {
      const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const record = { id, createdAt: new Date(), ...data };
      emailLogsDb.set(id, record);
      const app = appsDb.get(data.applicationId);
      if (app) app.emails.push(record);
      return JSON.parse(JSON.stringify(record));
    },
    update: async ({ where, data }: any) => {
      const record = emailLogsDb.get(where.id);
      if (!record) throw new Error("EmailLog not found");
      Object.assign(record, data);
      return JSON.parse(JSON.stringify(record));
    },
    count: async () => emailLogsDb.size,
  },
  answer: {
    update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    count: async () => 0,
  },
  question: {
    findUnique: async ({ where }: any) => questionsDb.get(where.id) || null,
    create: async ({ data }: any) => {
      const id = `q_${Date.now()}`;
      const q = { id, ...data };
      questionsDb.set(id, q);
      return q;
    },
    update: async ({ where, data }: any) => {
      const q = questionsDb.get(where.id) || { id: where.id, ...data };
      Object.assign(q, data);
      questionsDb.set(where.id, q);
      return q;
    },
    delete: async ({ where }: any) => {
      questionsDb.delete(where.id);
      return { id: where.id };
    },
    count: async () => questionsDb.size,
  },
  subsection: {
    findUnique: async ({ where }: any) => subsectionsDb.get(where.id) || null,
    update: async ({ where, data }: any) => {
      const sub = subsectionsDb.get(where.id) || { id: where.id, ...data };
      Object.assign(sub, data);
      subsectionsDb.set(where.id, sub);
      return sub;
    },
    delete: async ({ where }: any) => {
      subsectionsDb.delete(where.id);
      return { id: where.id };
    },
    count: async () => subsectionsDb.size,
  },
  slot: {
    findUnique: async ({ where }: any) => slotsDb.get(where.id) || null,
    delete: async ({ where }: any) => {
      slotsDb.delete(where.id);
      return { id: where.id };
    },
    count: async () => slotsDb.size,
  },
  slotBooking: {
    count: async () => 0,
  },
  $transaction: async (fnOrArray: any) => {
    if (typeof fnOrArray === "function") {
      return fnOrArray(mockPrisma);
    }
    return Promise.all(fnOrArray);
  },
};

// Set mock prisma globally before requiring Express app
(globalThis as any).__mockPrisma = mockPrisma;

const adminRoutes = require("../src/routes/adminRoutes").default;

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/admin", adminRoutes);

// Auth tokens for test requests
const techHeadToken = jwt.sign(
  { id: "admin_tech_head", email: "techhead@tam.vit.ac.in", role: Role.DOMAIN_HEAD, domain: DomainType.TECHNICAL },
  process.env.JWT_SECRET!
);
const designHeadToken = jwt.sign(
  { id: "admin_design_head", email: "designhead@tam.vit.ac.in", role: Role.DOMAIN_HEAD, domain: DomainType.DESIGN },
  process.env.JWT_SECRET!
);
const rootToken = jwt.sign(
  { id: "admin_root", email: "root@tam.vit.ac.in", role: Role.ROOT_ADMIN },
  process.env.JWT_SECRET!
);

async function runRealBackendTests() {
  console.log("================================================================================");
  console.log("       TEST 2: REAL BACKEND VERIFICATION (HTTP REQUESTS & RESPONSES)           ");
  console.log("================================================================================\n");

  const server = app.listen(5001);
  console.log("✓ Real Express backend running on http://localhost:5001 with EMAIL_DRY_RUN=true\n");

  async function callApi(method: string, path: string, token: string, body?: any) {
    const url = `http://localhost:5001${path}`;
    const opts: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  let allPassed = true;

  // 1. Initial Counts check
  console.log("1. Checking DB counts before test...");
  const sumRes = await callApi("GET", "/api/admin/round1/summary?domain=TECHNICAL", techHeadToken);
  console.log(`GET /api/admin/round1/summary?domain=TECHNICAL -> HTTP ${sumRes.status}`);
  console.log("Payload:", JSON.stringify(sumRes.json, null, 2));

  // 2. Mark to Shortlist
  console.log("\n2. Mark candidate to Shortlist (round1Decision = 'SHORTLIST')");
  const r1 = await callApi("PUT", `/api/admin/applicants/${testAppShortlistId}/review`, techHeadToken, {
    round1Decision: "SHORTLIST",
    review1Marks: 28,
    review1Comments: "Strong technical background and problem-solving skills",
    review1Passed: true,
  });
  console.log(`PUT /api/admin/applicants/${testAppShortlistId}/review -> HTTP ${r1.status}`);
  console.log("Response:", JSON.stringify(r1.json, null, 2));
  if (r1.status === 200 && r1.json?.data?.round1Decision === "SHORTLIST" && r1.json?.data?.stage === "FORM_FILLING") {
    console.log("✅ PASS: Decision marked to SHORTLIST; stage remains FORM_FILLING");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 3. Mark to Reject (validation check: requires >= 10 chars)
  console.log("\n3a. Mark candidate to Reject without >= 10 char comment (should fail 400)");
  const rRejectShort = await callApi("PUT", `/api/admin/applicants/${testAppRejectId}/review`, techHeadToken, {
    round1Decision: "REJECT",
    review1Comments: "Too short",
  });
  console.log(`PUT /api/admin/applicants/${testAppRejectId}/review -> HTTP ${rRejectShort.status}`);
  console.log("Response:", JSON.stringify(rRejectShort.json, null, 2));
  if (rRejectShort.status === 400) {
    console.log("✅ PASS: Refused with HTTP 400 when rejection comment < 10 characters");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  console.log("\n3b. Mark candidate to Reject with >= 10 char comment (should pass 200)");
  const rRejectValid = await callApi("PUT", `/api/admin/applicants/${testAppRejectId}/review`, techHeadToken, {
    round1Decision: "REJECT",
    review1Comments: "Candidate lacks basic programming prerequisites for this track.",
    review1Passed: false,
  });
  console.log(`PUT /api/admin/applicants/${testAppRejectId}/review -> HTTP ${rRejectValid.status}`);
  console.log("Response:", JSON.stringify(rRejectValid.json, null, 2));
  if (rRejectValid.status === 200 && rRejectValid.json?.data?.round1Decision === "REJECT") {
    console.log("✅ PASS: Marked to REJECT with valid comment");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 4. Refuse direct stage change (USE_DECISION_FLOW)
  console.log("\n4. Attempt direct stage jump to SHORTLISTED from FORM_FILLING (should fail 409 USE_DECISION_FLOW)");
  const rDirectStage = await callApi("PUT", `/api/admin/applicants/${testAppShortlistId}/review`, techHeadToken, {
    stage: "SHORTLISTED",
  });
  console.log(`PUT /api/admin/applicants/${testAppShortlistId}/review -> HTTP ${rDirectStage.status}`);
  console.log("Response:", JSON.stringify(rDirectStage.json, null, 2));
  if (rDirectStage.status === 409 && rDirectStage.json?.code === "USE_DECISION_FLOW") {
    console.log("✅ PASS: Direct stage jump refused with 409 USE_DECISION_FLOW");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 5. Send Shortlist Emails (in batch chunk of 20 with EMAIL_DRY_RUN=true)
  console.log("\n5. Send Round 1 Shortlist Emails (POST /api/admin/round1/send)");
  const rSend = await callApi("POST", "/api/admin/round1/send", techHeadToken, {
    domain: "TECHNICAL",
    decision: "SHORTLIST",
    subject: "TAM Recruitment: Shortlisted for Interview - {{division}}",
    body: "Dear {{name}},\n\nCongratulations! You have been shortlisted for the {{division}} team. Sign in to {{site_url}} to pick your interview slot.",
    limit: 20,
  });
  console.log(`POST /api/admin/round1/send -> HTTP ${rSend.status}`);
  console.log("Response:", JSON.stringify(rSend.json, null, 2));
  if (rSend.status === 200 && rSend.json?.sent === 1 && rSend.json?.processed === 1) {
    console.log("✅ PASS: Emails dispatched successfully in dry run mode");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // Verify stage change on DB
  const sentApp = appsDb.get(testAppShortlistId);
  console.log(`\nVerified Application State: stage = ${sentApp?.stage}, round1EmailSentAt = ${sentApp?.round1EmailSentAt?.toISOString()}`);
  if (sentApp?.stage === Stage.SHORTLISTED && sentApp?.round1EmailSentAt !== null) {
    console.log("✅ PASS: Application stage transitioned to SHORTLISTED and round1EmailSentAt is recorded");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 6. Verify Decision is LOCKED after send
  console.log("\n6. Attempt to modify review marks after email send (should fail 409 DECISION_LOCKED)");
  const rLocked = await callApi("PUT", `/api/admin/applicants/${testAppShortlistId}/review`, techHeadToken, {
    review1Marks: 35,
  });
  console.log(`PUT /api/admin/applicants/${testAppShortlistId}/review -> HTTP ${rLocked.status}`);
  console.log("Response:", JSON.stringify(rLocked.json, null, 2));
  if (rLocked.status === 409 && rLocked.json?.code === "DECISION_LOCKED") {
    console.log("✅ PASS: Review modifications locked with 409 DECISION_LOCKED");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 7. Verify Idempotency: Second Send does nothing
  console.log("\n7. Trigger second send call for Shortlist (idempotency check)");
  const rSecondSend = await callApi("POST", "/api/admin/round1/send", techHeadToken, {
    domain: "TECHNICAL",
    decision: "SHORTLIST",
    subject: "TAM Recruitment: Shortlisted for Interview - {{division}}",
    body: "Dear {{name}},\n\nCongratulations! Sign in to {{site_url}}.",
    limit: 20,
  });
  console.log(`POST /api/admin/round1/send -> HTTP ${rSecondSend.status}`);
  console.log("Response:", JSON.stringify(rSecondSend.json, null, 2));
  if (rSecondSend.status === 200 && rSecondSend.json?.processed === 0 && rSecondSend.json?.sent === 0) {
    console.log("✅ PASS: Second send skipped already notified candidates (idempotent)");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 8. Cross-Domain Access Check (Design Head on Tech domain)
  console.log("\n8. Cross-domain authorization check (Design Head attempting Tech candidate review)");
  const rCrossDomain = await callApi("PUT", `/api/admin/applicants/${testAppShortlistId}/review`, designHeadToken, {
    review1Comments: "Hacking attempt",
  });
  console.log(`PUT /api/admin/applicants/${testAppShortlistId}/review -> HTTP ${rCrossDomain.status}`);
  console.log("Response:", JSON.stringify(rCrossDomain.json, null, 2));
  if (rCrossDomain.status === 403 && rCrossDomain.json?.code === "WRONG_DOMAIN") {
    console.log("✅ PASS: Cross-domain attempt refused with 403 WRONG_DOMAIN");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 9. Interview marks before slot endTime (409 INTERVIEW_NOT_DONE)
  console.log("\n9. Interview marks entry before slot end time (should fail 409 INTERVIEW_NOT_DONE)");
  const rInterviewEarly = await callApi("PUT", `/api/admin/applicants/${testAppInterviewFutureId}/review`, techHeadToken, {
    review2Marks: 8,
    review2Comments: "Too early score",
  });
  console.log(`PUT /api/admin/applicants/${testAppInterviewFutureId}/review -> HTTP ${rInterviewEarly.status}`);
  console.log("Response:", JSON.stringify(rInterviewEarly.json, null, 2));
  if (rInterviewEarly.status === 409 && rInterviewEarly.json?.code === "INTERVIEW_NOT_DONE") {
    console.log("✅ PASS: Early interview marks rejected with 409 INTERVIEW_NOT_DONE");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 10. Interview marks after slot endTime (should succeed 200)
  console.log("\n10. Interview marks entry after slot end time has passed (should succeed 200)");
  const rInterviewPassed = await callApi("PUT", `/api/admin/applicants/${testAppInterviewPastId}/review`, techHeadToken, {
    review2Marks: 9,
    review2Comments: "Excellent performance in live discussion.",
  });
  console.log(`PUT /api/admin/applicants/${testAppInterviewPastId}/review -> HTTP ${rInterviewPassed.status}`);
  console.log("Response:", JSON.stringify(rInterviewPassed.json, null, 2));
  if (rInterviewPassed.status === 200 && rInterviewPassed.json?.data?.review2Marks === 9) {
    console.log("✅ PASS: Interview marks saved successfully after slot end time passed");
  } else {
    console.log("❌ FAIL");
    allPassed = false;
  }

  // 11. Clean up TEST data
  console.log("\n11. Cleaning up all TEST data...");
  appsDb.delete(testAppShortlistId);
  appsDb.delete(testAppRejectId);
  appsDb.delete(testAppInterviewFutureId);
  appsDb.delete(testAppInterviewPastId);
  emailLogsDb.clear();
  console.log(`✓ All TEST data cleaned up. Remaining apps in store: ${appsDb.size}`);

  console.log("\n================================================================================");
  console.log(`FINAL TEST 2 RESULT: ${allPassed ? "✅ ALL BACKEND CHECKS PASSED (100% SPEC & MOCK PARITY)" : "❌ FAILED"}`);
  console.log("================================================================================\n");

  server.close(() => {
    process.exitCode = allPassed ? 0 : 1;
  });
}

runRealBackendTests().catch((err) => {
  console.error("Test 2 error:", err);
  process.exit(1);
});
