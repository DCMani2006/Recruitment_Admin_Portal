import jwt from 'jsonwebtoken';
import { DomainType, Role, Stage, Round1Decision, EmailType, EmailStatus } from '@prisma/client';
import express from 'express';
import cors from 'cors';

// Configure test environment
process.env.JWT_SECRET = 'test_secret_for_checks';
process.env.EMAIL_DRY_RUN = 'true';
process.env.CANDIDATE_SITE_URL = 'https://tam-times.vercel.app';

// In-Memory Test State
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
const questionsDb = new Map<string, any>();
const subsectionsDb = new Map<string, any>();
const slotsDb = new Map<string, any>();

// Seed sample records
const techAppId = 'app_tech_001';
const designAppId = 'app_design_001';
const interviewAppId = 'app_interview_001';

// Seed 1: Tech Candidate in FORM_FILLING (submitted)
appsDb.set(techAppId, {
  id: techAppId,
  domain: DomainType.TECHNICAL,
  stage: Stage.FORM_FILLING,
  submittedAt: new Date('2026-10-26T10:00:00Z'),
  createdAt: new Date('2026-10-25T10:00:00Z'),
  review1Marks: null,
  review1Comments: null,
  review1Passed: false,
  review2Marks: null,
  review2Comments: null,
  review2Passed: false,
  round1Decision: null,
  round1DecisionAt: null,
  round1EmailSentAt: null,
  userId: 'user_tech_001',
  user: {
    id: 'user_tech_001',
    name: 'Aarav Patel',
    email: 'candidate-tech@test.vit.ac.in',
    phone: '9876543210',
    regNumber: '24BCE1001',
    answers: [],
  },
  booking: null,
  emails: [],
});

// Seed 2: Design Candidate in FORM_FILLING (submitted)
appsDb.set(designAppId, {
  id: designAppId,
  domain: DomainType.DESIGN,
  stage: Stage.FORM_FILLING,
  submittedAt: new Date('2026-10-26T11:00:00Z'),
  createdAt: new Date('2026-10-25T11:00:00Z'),
  review1Marks: null,
  review1Comments: null,
  review1Passed: false,
  review2Marks: null,
  review2Comments: null,
  review2Passed: false,
  round1Decision: null,
  round1DecisionAt: null,
  round1EmailSentAt: null,
  userId: 'user_design_001',
  user: {
    id: 'user_design_001',
    name: 'Diya Sharma',
    email: 'candidate-design@test.vit.ac.in',
    phone: '9876543211',
    regNumber: '24BDS1002',
    answers: [],
  },
  booking: null,
  emails: [],
});

// Seed 3: Interview Candidate with future slot endTime (interview not ended yet)
const futureSlotEndTime = new Date(Date.now() + 3600 * 1000 * 2); // 2 hours in future
appsDb.set(interviewAppId, {
  id: interviewAppId,
  domain: DomainType.TECHNICAL,
  stage: Stage.INTERVIEW,
  submittedAt: new Date('2026-10-25T10:00:00Z'),
  createdAt: new Date('2026-10-24T10:00:00Z'),
  review1Marks: 9,
  review1Comments: 'Shortlisted candidate',
  review1Passed: true,
  review2Marks: null,
  review2Comments: null,
  review2Passed: false,
  round1Decision: Round1Decision.SHORTLIST,
  round1DecisionAt: new Date('2026-10-27T10:00:00Z'),
  round1EmailSentAt: new Date('2026-10-27T10:05:00Z'),
  userId: 'user_interview_001',
  user: {
    id: 'user_interview_001',
    name: 'Rohan Verma',
    email: 'candidate-interview@test.vit.ac.in',
    phone: '9876543212',
    regNumber: '24BCE1003',
    answers: [],
  },
  booking: {
    id: 'booking_001',
    applicationId: interviewAppId,
    slotId: 'slot_future_001',
    slot: {
      id: 'slot_future_001',
      domain: DomainType.TECHNICAL,
      startTime: new Date(Date.now() + 3600 * 1000),
      endTime: futureSlotEndTime,
      capacity: 1,
      bookedCount: 1,
      meetingLink: 'https://meet.google.com/abc-defg-hij',
    },
  },
  emails: [],
});

const mockPrisma = {
  application: {
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
    count: async (args: any) => {
      const list = await mockPrisma.application.findMany(args);
      return list.length;
    },
    update: async ({ where, data }: any) => {
      const app = appsDb.get(where.id);
      if (!app) throw new Error('Application not found');
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
      if (app) {
        app.emails.push(record);
      }
      return JSON.parse(JSON.stringify(record));
    },
    update: async ({ where, data }: any) => {
      const record = emailLogsDb.get(where.id);
      if (!record) throw new Error('EmailLog not found');
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
    updateMany: async ({ data }: any) => {
      for (const q of questionsDb.values()) {
        Object.assign(q, data);
      }
      return { count: questionsDb.size };
    },
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
  },
  slot: {
    findUnique: async ({ where }: any) => slotsDb.get(where.id) || null,
    delete: async ({ where }: any) => {
      slotsDb.delete(where.id);
      return { id: where.id };
    },
  },
  slotBooking: {
    count: async () => 0,
  },
  $transaction: async (fnOrArray: any) => {
    if (typeof fnOrArray === 'function') {
      return fnOrArray(mockPrisma);
    }
    return Promise.all(fnOrArray);
  },
};

// Set mock before importing routes
globalThis.__mockPrisma = mockPrisma;

// Now dynamically import adminRoutes
const adminRoutes = require('../src/routes/adminRoutes').default;

// Start Express Test Server
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/admin', adminRoutes);

const TEST_PORT = 5099;
const server = app.listen(TEST_PORT);

// Tokens
const rootToken = jwt.sign(
  { id: 'admin_root', email: 'root@admin.internal', role: Role.ROOT_ADMIN },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const designHeadToken = jwt.sign(
  { id: 'admin_design', email: 'design@admin.internal', role: Role.DOMAIN_HEAD, domain: DomainType.DESIGN },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const techHeadToken = jwt.sign(
  { id: 'admin_tech', email: 'tech@admin.internal', role: Role.DOMAIN_HEAD, domain: DomainType.TECHNICAL },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

async function runChecks() {
  console.log('================================================================================');
  console.log('       RECRUITMENT BACKEND: SHORTLIST & EMAIL WORKFLOW VERIFICATION SUITE       ');
  console.log('================================================================================\n');

  let passedAll = true;

  // Helper request function
  async function testReq(method: string, path: string, token: string, body?: any) {
    const url = `http://localhost:${TEST_PORT}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, url, method, body };
  }

  // ---------------------------------------------------------------------------
  // CHECK 1: Marking and changing a decision (allowed)
  // ---------------------------------------------------------------------------
  console.log('👉 CHECK 1: Marking and changing a decision (allowed)');
  console.log(`curl -X PUT http://localhost:5000/api/admin/applicants/${techAppId}/review \\`);
  console.log(`  -H "Authorization: Bearer <TECH_HEAD_TOKEN>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"review1Marks":8,"review1Comments":"Solid background","round1Decision":"SHORTLIST"}'\n`);

  const r1a = await testReq('PUT', `/api/admin/applicants/${techAppId}/review`, techHeadToken, {
    review1Marks: 8,
    review1Comments: 'Solid background',
    round1Decision: 'SHORTLIST',
  });
  console.log(`HTTP ${r1a.status}`);
  console.log(JSON.stringify(r1a.json, null, 2));

  const pass1a =
    r1a.status === 200 &&
    r1a.json?.data?.round1Decision === 'SHORTLIST' &&
    r1a.json?.data?.review1Passed === true &&
    r1a.json?.data?.review1Marks === 8;

  console.log(`\ncurl -X PUT http://localhost:5000/api/admin/applicants/${techAppId}/review \\`);
  console.log(`  -H "Authorization: Bearer <TECH_HEAD_TOKEN>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"round1Decision":"REJECT"}'\n`);

  const r1b = await testReq('PUT', `/api/admin/applicants/${techAppId}/review`, techHeadToken, {
    round1Decision: 'REJECT',
  });
  console.log(`HTTP ${r1b.status}`);
  console.log(JSON.stringify(r1b.json, null, 2));

  const pass1b =
    r1b.status === 200 &&
    r1b.json?.data?.round1Decision === 'REJECT' &&
    r1b.json?.data?.review1Passed === false;

  console.log('\n(Resetting decision to "SHORTLIST" for subsequent send test)');
  const r1c = await testReq('PUT', `/api/admin/applicants/${techAppId}/review`, techHeadToken, {
    round1Decision: 'SHORTLIST',
  });
  const pass1c = r1c.status === 200 && r1c.json?.data?.round1Decision === 'SHORTLIST';

  const check1Passed = pass1a && pass1b && pass1c;
  console.log(`Result: ${check1Passed ? '✅ PASS: Decision marking and modification succeeded' : '❌ FAIL'}\n`);
  if (!check1Passed) passedAll = false;

  // ---------------------------------------------------------------------------
  // CHECK 2: PUT with stage SHORTLISTED directly (refused with 409 USE_DECISION_FLOW)
  // ---------------------------------------------------------------------------
  console.log('👉 CHECK 2: PUT with stage SHORTLISTED (refused directly)');
  console.log(`curl -X PUT http://localhost:5000/api/admin/applicants/${techAppId}/review \\`);
  console.log(`  -H "Authorization: Bearer <TECH_HEAD_TOKEN>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"stage":"SHORTLISTED"}'\n`);

  const r2 = await testReq('PUT', `/api/admin/applicants/${techAppId}/review`, techHeadToken, {
    stage: 'SHORTLISTED',
  });
  console.log(`HTTP ${r2.status}`);
  console.log(JSON.stringify(r2.json, null, 2));

  const check2Passed = r2.status === 409 && r2.json?.code === 'USE_DECISION_FLOW';
  console.log(`Result: ${check2Passed ? '✅ PASS: Refused with 409 USE_DECISION_FLOW' : '❌ FAIL'}\n`);
  if (!check2Passed) passedAll = false;

  // ---------------------------------------------------------------------------
  // CHECK 3: Sending with EMAIL_DRY_RUN=true (stage changes, locked afterwards, second send does nothing)
  // ---------------------------------------------------------------------------
  console.log('👉 CHECK 3: Sending with EMAIL_DRY_RUN=true');
  console.log('curl -X POST http://localhost:5000/api/admin/round1/send \\');
  console.log('  -H "Authorization: Bearer <TECH_HEAD_TOKEN>" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"domain":"TECHNICAL","decision":"SHORTLIST","subject":"TAM Shortlist - {{division}}","body":"Hello {{name}}, you are invited! Sign in at {{site_url}}."}\'\n');

  const r3a = await testReq('POST', '/api/admin/round1/send', techHeadToken, {
    domain: 'TECHNICAL',
    decision: 'SHORTLIST',
    subject: 'TAM Shortlist - {{division}}',
    body: 'Hello {{name}}, you are invited! Sign in at {{site_url}}.',
    limit: 20,
  });
  console.log(`HTTP ${r3a.status}`);
  console.log(JSON.stringify(r3a.json, null, 2));

  const pass3a = r3a.status === 200 && r3a.json?.processed === 1 && r3a.json?.sent === 1;

  const r3bApp = appsDb.get(techAppId);
  const pass3b = r3bApp?.stage === Stage.SHORTLISTED && r3bApp?.round1EmailSentAt !== null;
  console.log(`\nVerified Application on DB: stage = ${r3bApp?.stage}, round1EmailSentAt = ${r3bApp?.round1EmailSentAt?.toISOString()}`);

  console.log(`\ncurl -X PUT http://localhost:5000/api/admin/applicants/${techAppId}/review \\`);
  console.log(`  -H "Authorization: Bearer <TECH_HEAD_TOKEN>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"review1Marks":10}'\n`);

  const r3c = await testReq('PUT', `/api/admin/applicants/${techAppId}/review`, techHeadToken, {
    review1Marks: 10,
  });
  console.log(`HTTP ${r3c.status}`);
  console.log(JSON.stringify(r3c.json, null, 2));
  const pass3c = r3c.status === 409 && r3c.json?.code === 'DECISION_LOCKED';

  console.log('\n(Triggering second send call for idempotency test)');
  const r3d = await testReq('POST', '/api/admin/round1/send', techHeadToken, {
    domain: 'TECHNICAL',
    decision: 'SHORTLIST',
    subject: 'TAM Shortlist - {{division}}',
    body: 'Hello {{name}}, you are invited! Sign in at {{site_url}}.',
    limit: 20,
  });
  console.log(`HTTP ${r3d.status}`);
  console.log(JSON.stringify(r3d.json, null, 2));
  const pass3d = r3d.status === 200 && r3d.json?.processed === 0 && r3d.json?.sent === 0;

  const check3Passed = pass3a && pass3b && pass3c && pass3d;
  console.log(`Result: ${check3Passed ? '✅ PASS: Stage moved to SHORTLISTED, review locked, second send skipped' : '❌ FAIL'}\n`);
  if (!check3Passed) passedAll = false;

  // ---------------------------------------------------------------------------
  // CHECK 4: A Design head attempting another domain (403 WRONG_DOMAIN)
  // ---------------------------------------------------------------------------
  console.log('👉 CHECK 4: Design head attempting another domain (403 WRONG_DOMAIN)');
  console.log(`curl -X PUT http://localhost:5000/api/admin/applicants/${techAppId}/review \\`);
  console.log(`  -H "Authorization: Bearer <DESIGN_HEAD_TOKEN>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"review1Marks":5}'\n`);

  const r4a = await testReq('PUT', `/api/admin/applicants/${techAppId}/review`, designHeadToken, {
    review1Marks: 5,
  });
  console.log(`HTTP ${r4a.status}`);
  console.log(JSON.stringify(r4a.json, null, 2));

  console.log('\ncurl -X POST http://localhost:5000/api/admin/round1/send \\');
  console.log('  -H "Authorization: Bearer <DESIGN_HEAD_TOKEN>" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"domain":"TECHNICAL","decision":"SHORTLIST","subject":"Test","body":"Test"}\'\n');

  const r4b = await testReq('POST', '/api/admin/round1/send', designHeadToken, {
    domain: 'TECHNICAL',
    decision: 'SHORTLIST',
    subject: 'Test',
    body: 'Test',
  });
  console.log(`HTTP ${r4b.status}`);
  console.log(JSON.stringify(r4b.json, null, 2));

  const check4Passed =
    r4a.status === 403 &&
    r4a.json?.code === 'WRONG_DOMAIN' &&
    r4b.status === 403 &&
    r4b.json?.code === 'WRONG_DOMAIN';
  console.log(`Result: ${check4Passed ? '✅ PASS: Both cross-domain attempts refused with 403 WRONG_DOMAIN' : '❌ FAIL'}\n`);
  if (!check4Passed) passedAll = false;

  // ---------------------------------------------------------------------------
  // CHECK 5: An interview mark before the interview ended (409 INTERVIEW_NOT_DONE)
  // ---------------------------------------------------------------------------
  console.log('👉 CHECK 5: Interview mark before interview ended (409 INTERVIEW_NOT_DONE)');
  console.log(`curl -X PUT http://localhost:5000/api/admin/applicants/${interviewAppId}/review \\`);
  console.log(`  -H "Authorization: Bearer <TECH_HEAD_TOKEN>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"review2Marks":8,"review2Comments":"Early mark attempt","review2Passed":true}'\n`);

  const r5 = await testReq('PUT', `/api/admin/applicants/${interviewAppId}/review`, techHeadToken, {
    review2Marks: 8,
    review2Comments: 'Early mark attempt',
    review2Passed: true,
  });
  console.log(`HTTP ${r5.status}`);
  console.log(JSON.stringify(r5.json, null, 2));

  const check5Passed = r5.status === 409 && r5.json?.code === 'INTERVIEW_NOT_DONE';
  console.log(`Result: ${check5Passed ? '✅ PASS: Refused with 409 INTERVIEW_NOT_DONE' : '❌ FAIL'}\n`);
  if (!check5Passed) passedAll = false;

  // ---------------------------------------------------------------------------
  // CHECK 6: Summary and Templates Endpoints
  // ---------------------------------------------------------------------------
  console.log('👉 CHECK 6: Summary & Templates inspection');
  const rSummary = await testReq('GET', '/api/admin/round1/summary?domain=TECHNICAL', techHeadToken);
  console.log(`Summary Status: ${rSummary.status}`);
  console.log(JSON.stringify(rSummary.json, null, 2));

  const rTemplates = await testReq('GET', '/api/admin/round1/templates?decision=SHORTLIST', techHeadToken);
  console.log(`\nTemplates Status: ${rTemplates.status}`);
  console.log(JSON.stringify(rTemplates.json, null, 2));

  console.log('\n================================================================================');
  console.log(`FINAL RESULT: ${passedAll ? '✅ ALL CHECKS PASSED (100% SPEC CONFORMANCE)' : '❌ SOME CHECKS FAILED'}`);
  console.log('================================================================================\n');

  server.close(() => {
    process.exitCode = passedAll ? 0 : 1;
  });
}

runChecks().catch((err) => {
  console.error('Fatal test error:', err);
  server.close(() => {
    process.exitCode = 1;
  });
});
