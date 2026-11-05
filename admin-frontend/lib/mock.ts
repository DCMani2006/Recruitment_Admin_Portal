import {
  AdminUser,
  AuthResponse,
  Application,
  ApplicantUser,
  Slot,
  FormQuestionsResponse,
  ReviewPayload,
  CreateSlotPayload,
  DomainEnum,
  Subsection,
  Question,
  ApplicationStage,
  ALLOWED_STAGE_MOVES,
  DOMAINS,
  Booking,
  TeamMember,
  DOMAIN_LABELS,
} from "./types";

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
const STORAGE_KEY = "tam_admin_mock_store_v7"; // bumped for simplified slot planner and decision flow

interface MockStore {
  admins: {
    id: string;
    email: string;
    role: "ROOT_ADMIN" | "DOMAIN_HEAD";
    domain?: DomainEnum | null;
    name: string;
    passwordHash: string;
    claimed: boolean;
  }[];
  applications: Application[];
  users: ApplicantUser[];
  subsections: Subsection[];
  questions: Question[];
  slots: Slot[];
}

function getInitialStore(): MockStore {
  const admins: MockStore["admins"] = [
    {
      id: "admin-root",
      email: "root@tam.vit.ac.in",
      role: "ROOT_ADMIN",
      domain: null,
      name: "Arthur Pendelton",
      passwordHash: "password123",
      claimed: true,
    },
    {
      id: "admin-head-design",
      email: "design.head@tam.vit.ac.in",
      role: "DOMAIN_HEAD",
      domain: "DESIGN",
      name: "Clara Oswald",
      passwordHash: "password123",
      claimed: true,
    },
    {
      id: "admin-head-marketing",
      email: "marketing.head@tam.vit.ac.in",
      role: "DOMAIN_HEAD",
      domain: "MARKETING",
      name: "Barnaby Brooks",
      passwordHash: "password123",
      claimed: true,
    },
    {
      id: "admin-head-rd",
      email: "rd.head@tam.vit.ac.in",
      role: "DOMAIN_HEAD",
      domain: "R_AND_D",
      name: "Dr. Eleanor Vance",
      passwordHash: "password123",
      claimed: true,
    },
    {
      id: "admin-head-management",
      email: "management.head@tam.vit.ac.in",
      role: "DOMAIN_HEAD",
      domain: "MANAGEMENT",
      name: "Gideon Cross",
      passwordHash: "password123",
      claimed: true,
    },
    {
      id: "admin-head-editorial",
      email: "editorial.head@tam.vit.ac.in",
      role: "DOMAIN_HEAD",
      domain: "EDITORIAL",
      name: "Penelope Feather",
      passwordHash: "password123",
      claimed: true,
    },
    {
      id: "admin-head-tech",
      email: "tech.head@tam.vit.ac.in",
      role: "DOMAIN_HEAD",
      domain: "TECHNICAL",
      name: "Aman Talwar",
      passwordHash: "password123",
      claimed: true,
    },
  ];

  const subsections: Subsection[] = [];
  const questions: Question[] = [];

  DOMAINS.forEach((domain) => {
    const sub1: Subsection = {
      id: `sub-${domain.toLowerCase()}-1`,
      name: "General Aptitude & Motivation",
      domain,
      order: 1,
    };
    const sub2: Subsection = {
      id: `sub-${domain.toLowerCase()}-2`,
      name: `${domain} Core Competence`,
      domain,
      order: 2,
    };
    subsections.push(sub1, sub2);

    questions.push(
      {
        id: `q-${domain.toLowerCase()}-1`,
        domain,
        text: `Why do you wish to join The AI & ML Club's ${domain} division? Detail your background and previous projects.`,
        maxMarks: 10,
        subsectionId: sub1.id,
        order: 1,
        required: true,
        maxLength: 100000,
      },
      {
        id: `q-${domain.toLowerCase()}-2`,
        domain,
        text: `Describe a complex problem you tackled recently in ${domain}. What obstacles arose and how did you resolve them?`,
        maxMarks: 15,
        subsectionId: sub2.id,
        order: 2,
        required: true,
        maxLength: 100000,
      },
      {
        id: `q-${domain.toLowerCase()}-3`,
        domain,
        text: `How would you contribute to our upcoming flagship hackathons and club initiatives? Provide concrete ideas.`,
        maxMarks: 10,
        subsectionId: sub2.id,
        order: 3,
        required: true,
        maxLength: 100000,
      }
    );
  });

  // Staggered Slots across next 7 days in Asia/Kolkata
  const slots: Slot[] = [];
  const now = new Date();
  const domainHeadMap: Record<DomainEnum, string> = {
    DESIGN: "admin-head-design",
    MARKETING: "admin-head-marketing",
    R_AND_D: "admin-head-rd",
    MANAGEMENT: "admin-head-management",
    EDITORIAL: "admin-head-editorial",
    TECHNICAL: "admin-head-tech",
  };

  DOMAINS.forEach((domain) => {
    const headId = domainHeadMap[domain];
    for (let dayOffset = -4; dayOffset < 7; dayOffset++) {
      const slotBase = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      // Windows: 14:00, 14:15, 14:30, 14:45, 15:00, 15:15, 15:30, 15:45, 16:00, 16:15
      const times = [
        { h: 14, m: 0 },
        { h: 14, m: 15 },
        { h: 14, m: 30 },
        { h: 14, m: 45 },
        { h: 15, m: 0 },
        { h: 15, m: 15 },
        { h: 15, m: 30 },
        { h: 15, m: 45 },
        { h: 16, m: 0 },
        { h: 16, m: 15 },
      ];

      times.forEach((t, sIdx) => {
        const start = new Date(slotBase);
        start.setHours(t.h, t.m, 0, 0);
        const end = new Date(start.getTime() + 15 * 60 * 1000);

        const slotId = `slot-${domain.toLowerCase()}-d${dayOffset}-s${sIdx}`;
        slots.push({
          id: slotId,
          interviewerId: headId,
          domain,
          meetingLink: `https://meet.google.com/tam-${domain.toLowerCase()}-${dayOffset}${sIdx}`,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          capacity: 1,
          bookings: [],
        });
      });
    }
  });

  // Exactly 50 applicants with realistic distribution across divisions
  // Technical: 14, Design: 11, Management: 10, Marketing: 7, Editorial: 5, R&D: 3
  interface CandidateSeed {
    name: string;
    domain: DomainEnum;
    stage: ApplicationStage;
    submittedDaysAgo: number;
    round1Decision?: "SHORTLIST" | "REJECT" | null;
    q1Marks?: number;
    q2Marks?: number;
    q3Marks?: number;
    interviewDayOffset?: number;
    interviewSlotIdx?: number;
  }

  const seedSpecs: CandidateSeed[] = [
    // TECHNICAL (14 candidates)
    { name: "Aarav Sharma", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 11, round1Decision: "SHORTLIST", q1Marks: 8, q2Marks: 11, q3Marks: 7 },
    { name: "Ishaan Verma", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 9, round1Decision: "REJECT", q1Marks: 4, q2Marks: 5, q3Marks: 4 },
    { name: "Devansh Nair", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 7 },
    { name: "Kunal Sundaram", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 4 },
    { name: "Ronit Sengupta", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 2 },
    { name: "Rohan Gupta", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 10, round1Decision: "SHORTLIST", q1Marks: 7, q2Marks: 11, q3Marks: 7 },
    { name: "Kabir Sen", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 8, round1Decision: "SHORTLIST", q1Marks: 6, q2Marks: 12, q3Marks: 6 },
    { name: "Arjun Chawla", domain: "TECHNICAL", stage: "FORM_FILLING", submittedDaysAgo: 5, round1Decision: "SHORTLIST", q1Marks: 8, q2Marks: 10, q3Marks: 7 },
    { name: "Siddharth Roy", domain: "TECHNICAL", stage: "SLOT_CHOOSING", submittedDaysAgo: 9, q1Marks: 6, q2Marks: 10, q3Marks: 6 },
    { name: "Vikram Joshi", domain: "TECHNICAL", stage: "SLOT_CHOOSING", submittedDaysAgo: 6, q1Marks: 7, q2Marks: 11, q3Marks: 7 },
    { name: "Ayush Kulkarni", domain: "TECHNICAL", stage: "INTERVIEW", submittedDaysAgo: 8, q1Marks: 8, q2Marks: 13, q3Marks: 9, interviewDayOffset: 0, interviewSlotIdx: 2 }, // Today 14:30
    { name: "Varun Kashyap", domain: "TECHNICAL", stage: "INTERVIEW", submittedDaysAgo: 7, q1Marks: 9, q2Marks: 12, q3Marks: 8, interviewDayOffset: 0, interviewSlotIdx: 9 }, // Today 16:15
    { name: "Vihan Deshmukh", domain: "TECHNICAL", stage: "SELECTED", submittedDaysAgo: 11, q1Marks: 10, q2Marks: 15, q3Marks: 10, interviewDayOffset: -2, interviewSlotIdx: 2 }, // Single perfect 35/35
    { name: "Raghav Rastogi", domain: "TECHNICAL", stage: "REJECTED", submittedDaysAgo: 10, q1Marks: 4, q2Marks: 6, q3Marks: 4 }, // 14/35

    // DESIGN (11 candidates)
    { name: "Diya Patel", domain: "DESIGN", stage: "FORM_FILLING", submittedDaysAgo: 12, round1Decision: "SHORTLIST", q1Marks: 9, q2Marks: 12, q3Marks: 8 },
    { name: "Ananya Iyer", domain: "DESIGN", stage: "FORM_FILLING", submittedDaysAgo: 8, round1Decision: "REJECT", q1Marks: 3, q2Marks: 4, q3Marks: 3 },
    { name: "Meghna Nair", domain: "DESIGN", stage: "FORM_FILLING", submittedDaysAgo: 3 },
    { name: "Prisha Hegde", domain: "DESIGN", stage: "FORM_FILLING", submittedDaysAgo: 9, round1Decision: "SHORTLIST", q1Marks: 7, q2Marks: 11, q3Marks: 8 },
    { name: "Tara Deshmukh", domain: "DESIGN", stage: "FORM_FILLING", submittedDaysAgo: 6, round1Decision: "SHORTLIST", q1Marks: 6, q2Marks: 10, q3Marks: 7 },
    { name: "Sana Mirchandani", domain: "DESIGN", stage: "SLOT_CHOOSING", submittedDaysAgo: 8, q1Marks: 7, q2Marks: 12, q3Marks: 8 },
    { name: "Kavya Menon", domain: "DESIGN", stage: "SLOT_CHOOSING", submittedDaysAgo: 5, q1Marks: 6, q2Marks: 10, q3Marks: 6 },
    { name: "Shambhavi Kaul", domain: "DESIGN", stage: "INTERVIEW", submittedDaysAgo: 7, q1Marks: 9, q2Marks: 14, q3Marks: 8, interviewDayOffset: 0, interviewSlotIdx: 0 }, // Today 14:00
    { name: "Ritika Aggarwal", domain: "DESIGN", stage: "INTERVIEW", submittedDaysAgo: 6, q1Marks: 8, q2Marks: 11, q3Marks: 8, interviewDayOffset: 1, interviewSlotIdx: 6 }, // Tomorrow 15:30
    { name: "Anika Bhatnagar", domain: "DESIGN", stage: "SELECTED", submittedDaysAgo: 10, q1Marks: 10, q2Marks: 14, q3Marks: 10, interviewDayOffset: -1, interviewSlotIdx: 4 }, // 34/35
    { name: "Bhavna Pillai", domain: "DESIGN", stage: "REJECTED", submittedDaysAgo: 9, q1Marks: 7, q2Marks: 11, q3Marks: 7, interviewDayOffset: -3, interviewSlotIdx: 3 }, // Rejected after interview

    // MANAGEMENT (10 candidates)
    { name: "Rishabh Kapoor", domain: "MANAGEMENT", stage: "FORM_FILLING", submittedDaysAgo: 11, round1Decision: "SHORTLIST", q1Marks: 8, q2Marks: 10, q3Marks: 7 },
    { name: "Aditya Rao", domain: "MANAGEMENT", stage: "FORM_FILLING", submittedDaysAgo: 7, round1Decision: "REJECT", q1Marks: 4, q2Marks: 5, q3Marks: 4 },
    { name: "Neha Singhania", domain: "MANAGEMENT", stage: "FORM_FILLING", submittedDaysAgo: 4 },
    { name: "Faizan Ansari", domain: "MANAGEMENT", stage: "FORM_FILLING", submittedDaysAgo: 8, round1Decision: "SHORTLIST", q1Marks: 7, q2Marks: 10, q3Marks: 7 },
    { name: "Zoya Merchant", domain: "MANAGEMENT", stage: "FORM_FILLING", submittedDaysAgo: 5, round1Decision: "SHORTLIST", q1Marks: 6, q2Marks: 11, q3Marks: 6 },
    { name: "Pallavi Bose", domain: "MANAGEMENT", stage: "SLOT_CHOOSING", submittedDaysAgo: 6, q1Marks: 7, q2Marks: 11, q3Marks: 7 },
    { name: "Kritika Kamat", domain: "MANAGEMENT", stage: "INTERVIEW", submittedDaysAgo: 7, q1Marks: 7, q2Marks: 12, q3Marks: 7, interviewDayOffset: 0, interviewSlotIdx: 4 }, // Today 15:00
    { name: "Divya Padmanabhan", domain: "MANAGEMENT", stage: "INTERVIEW", submittedDaysAgo: 6, q1Marks: 9, q2Marks: 13, q3Marks: 9, interviewDayOffset: 2, interviewSlotIdx: 0 },
    { name: "Reyansh Khatri", domain: "MANAGEMENT", stage: "SELECTED", submittedDaysAgo: 9, q1Marks: 9, q2Marks: 14, q3Marks: 9, interviewDayOffset: -2, interviewSlotIdx: 5 }, // 32/35
    { name: "Naman Khanduja", domain: "MANAGEMENT", stage: "REJECTED", submittedDaysAgo: 8, q1Marks: 5, q2Marks: 6, q3Marks: 4 }, // 15/35

    // MARKETING (7 candidates)
    { name: "Tanvi Bhatia", domain: "MARKETING", stage: "FORM_FILLING", submittedDaysAgo: 9 },
    { name: "Avani Sharma", domain: "MARKETING", stage: "FORM_FILLING", submittedDaysAgo: 3 },
    { name: "Vivaan Kaushik", domain: "MARKETING", stage: "FORM_FILLING", submittedDaysAgo: 7, round1Decision: "SHORTLIST", q1Marks: 8, q2Marks: 11, q3Marks: 7 },
    { name: "Sneha Gokhale", domain: "MARKETING", stage: "SLOT_CHOOSING", submittedDaysAgo: 6, q1Marks: 6, q2Marks: 10, q3Marks: 7 },
    { name: "Armaan Singhania", domain: "MARKETING", stage: "INTERVIEW", submittedDaysAgo: 5, q1Marks: 8, q2Marks: 14, q3Marks: 8, interviewDayOffset: 0, interviewSlotIdx: 7 }, // Today 15:45
    { name: "Suhani Choudhury", domain: "MARKETING", stage: "SELECTED", submittedDaysAgo: 8, q1Marks: 10, q2Marks: 13, q3Marks: 10, interviewDayOffset: -1, interviewSlotIdx: 1 }, // 33/35
    { name: "Samar Nambiar", domain: "MARKETING", stage: "REJECTED", submittedDaysAgo: 7, q1Marks: 8, q2Marks: 12, q3Marks: 7, interviewDayOffset: -2, interviewSlotIdx: 6 }, // Rejected after interview

    // EDITORIAL (5 candidates)
    { name: "Pranav Kumar", domain: "EDITORIAL", stage: "FORM_FILLING", submittedDaysAgo: 8 },
    { name: "Jahnavi Ray", domain: "EDITORIAL", stage: "FORM_FILLING", submittedDaysAgo: 6, round1Decision: "SHORTLIST", q1Marks: 7, q2Marks: 9, q3Marks: 6 },
    { name: "Anmol Jain", domain: "EDITORIAL", stage: "SLOT_CHOOSING", submittedDaysAgo: 5, q1Marks: 7, q2Marks: 9, q3Marks: 6 },
    { name: "Juhi Ganguly", domain: "EDITORIAL", stage: "INTERVIEW", submittedDaysAgo: 4, q1Marks: 8, q2Marks: 12, q3Marks: 8, interviewDayOffset: 1, interviewSlotIdx: 2 }, // Tomorrow 14:30
    { name: "Akash Mathur", domain: "EDITORIAL", stage: "REJECTED", submittedDaysAgo: 6, q1Marks: 4, q2Marks: 7, q3Marks: 5 }, // 16/35

    // R_AND_D (3 candidates - very few)
    { name: "Harshit Verma", domain: "R_AND_D", stage: "FORM_FILLING", submittedDaysAgo: 5 },
    { name: "Vedant Saxena", domain: "R_AND_D", stage: "FORM_FILLING", submittedDaysAgo: 7, round1Decision: "SHORTLIST", q1Marks: 8, q2Marks: 13, q3Marks: 8 },
    { name: "Adil Parvez", domain: "R_AND_D", stage: "INTERVIEW", submittedDaysAgo: 4, q1Marks: 9, q2Marks: 14, q3Marks: 9, interviewDayOffset: 2, interviewSlotIdx: 8 },
  ];

  const users: ApplicantUser[] = [];
  const applications: Application[] = [];

  seedSpecs.forEach((spec, idx) => {
    const userId = `usr-${idx + 1}`;
    const appId = `app-${idx + 1}`;
    const regNumber = `24BCE${1100 + idx}`;
    const email = `${spec.name.toLowerCase().replace(/[\s.]+/g, "")}@vitstudent.ac.in`;
    const phone = `+91 98${Math.floor(10000000 + (idx * 179424673) % 90000000)}`;

    const domainQs = questions.filter((q) => q.domain === spec.domain);
    const answers = domainQs.map((q, qIdx) => {
      let marks: number | null = null;
      if (spec.q1Marks !== undefined && qIdx === 0) marks = spec.q1Marks;
      if (spec.q2Marks !== undefined && qIdx === 1) marks = spec.q2Marks;
      if (spec.q3Marks !== undefined && qIdx === 2) marks = spec.q3Marks;

      return {
        id: `ans-${appId}-${qIdx + 1}`,
        questionId: q.id,
        text: `In my work with ${spec.domain}, I focus on rigorous craftsmanship, attention to detail, and collaborative problem-solving. Regarding "${q.text.slice(0, 40)}...", I structured our methodology to achieve measurable outcomes with high reliability.`,
        marks,
        question: q,
      };
    });

    // Also attach answers for another division for half the candidates to test multi-domain answer filtering
    if (idx % 2 === 0) {
      const otherDomain = spec.domain === "DESIGN" ? "TECHNICAL" : "DESIGN";
      const otherQs = questions.filter((q) => q.domain === otherDomain);
      otherQs.forEach((oq, oqIdx) => {
        answers.push({
          id: `ans-other-${appId}-${oqIdx + 1}`,
          questionId: oq.id,
          text: `Cross-domain submission for ${otherDomain}. Note: This should NOT be visible when viewing the ${spec.domain} application.`,
          marks: null,
          question: oq,
        });
      });
    }

    const userObj: ApplicantUser = {
      id: userId,
      name: spec.name,
      email,
      phone,
      regNumber,
      answers,
    };
    users.push(userObj);

    // Booked slot for Interview, Selected, and Rejected-after-interview
    let bookingObj: Booking | null = null;
    if (spec.interviewDayOffset !== undefined && spec.interviewSlotIdx !== undefined) {
      const targetSlot = slots.find(
        (s) =>
          s.domain === spec.domain &&
          s.id === `slot-${spec.domain.toLowerCase()}-d${spec.interviewDayOffset}-s${spec.interviewSlotIdx}`
      );
      if (targetSlot) {
        bookingObj = {
          id: `book-${appId}`,
          slotId: targetSlot.id,
          applicationId: appId,
          slot: {
            startTime: targetSlot.startTime,
            endTime: targetSlot.endTime,
            meetingLink: targetSlot.meetingLink,
          },
          application: {
            id: appId,
            domain: spec.domain,
            userId,
            user: {
              id: userId,
              name: spec.name,
              email,
              phone,
              regNumber,
            },
          },
        };
        targetSlot.bookings = [bookingObj];
      }
    }

    const submittedDate = new Date(now.getTime() - (spec.submittedDaysAgo * 24 + (idx % 6) * 3) * 3600000);
    const totalReview1Marks = spec.q1Marks !== undefined ? (spec.q1Marks || 0) + (spec.q2Marks || 0) + (spec.q3Marks || 0) : null;

    const isSelected = spec.stage === "SELECTED";
    const isRejectedAfterInterview = spec.stage === "REJECTED" && spec.interviewDayOffset !== undefined;

    const r2Marks = isSelected
      ? (spec.q2Marks && spec.q2Marks >= 14 ? 10 : 9)
      : isRejectedAfterInterview
      ? 4
      : null;

    let round1Decision: "SHORTLIST" | "REJECT" | null = null;
    let round1DecisionAt: string | null = null;
    let round1EmailSentAt: string | null = null;

    if (spec.stage === "SHORTLISTED" || spec.stage === "SLOT_CHOOSING" || spec.stage === "INTERVIEW" || spec.stage === "SELECTED") {
      round1Decision = "SHORTLIST";
      round1DecisionAt = new Date(submittedDate.getTime() + 86400000).toISOString();
      round1EmailSentAt = new Date(submittedDate.getTime() + 172800000).toISOString();
    } else if (spec.stage === "REJECTED") {
      round1Decision = "REJECT";
      round1DecisionAt = new Date(submittedDate.getTime() + 86400000).toISOString();
      round1EmailSentAt = new Date(submittedDate.getTime() + 172800000).toISOString();
    } else if (spec.stage === "FORM_FILLING") {
      if (spec.round1Decision) {
        round1Decision = spec.round1Decision;
        round1DecisionAt = new Date(submittedDate.getTime() + 86400000).toISOString();
        round1EmailSentAt = null;
      }
    }

    const appObj: Application = {
      id: appId,
      domain: spec.domain,
      stage: spec.stage,
      submittedAt: submittedDate.toISOString(),
      review1Marks: totalReview1Marks,
      review1Comments: totalReview1Marks ? "Comprehensive responses with sound technical foundation." : null,
      review1Passed: round1Decision === "SHORTLIST" || spec.stage !== "FORM_FILLING" && (spec.stage !== "REJECTED" || isRejectedAfterInterview),
      review2Marks: r2Marks,
      review2Comments: isSelected
        ? "Exceptional discussion during live interview. Clear communication and strong domain depth."
        : isRejectedAfterInterview
        ? "Interview did not demonstrate adequate depth required for current cycle."
        : null,
      review2Passed: isSelected ? true : isRejectedAfterInterview ? false : null,
      round1Decision,
      round1DecisionAt,
      round1EmailSentAt,
      userId,
      user: userObj,
      booking: bookingObj,
    };

    applications.push(appObj);
  });

  return {
    admins,
    applications,
    users,
    subsections,
    questions,
    slots,
  };
}

function loadStore(): MockStore {
  if (inMemoryStore) {
    return inMemoryStore;
  }
  if (typeof window === "undefined") {
    return getInitialStore();
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const init = getInitialStore();
    saveStore(init);
    return init;
  }
  try {
    const parsed: MockStore = JSON.parse(raw);
    const initial = getInitialStore();
    let updated = false;

    // Safety: ensure all 7 deterministic admins exist and are claimed
    if (!parsed.admins) parsed.admins = [];
    for (const initAdmin of initial.admins) {
      const existing = parsed.admins.find((a) => a.email.toLowerCase() === initAdmin.email.toLowerCase());
      if (!existing) {
        parsed.admins.push(initAdmin);
        updated = true;
      } else {
        if (!existing.claimed || existing.passwordHash !== initAdmin.passwordHash || existing.name !== initAdmin.name) {
          existing.claimed = true;
          existing.passwordHash = initAdmin.passwordHash;
          existing.name = initAdmin.name;
          existing.domain = initAdmin.domain;
          existing.role = initAdmin.role;
          updated = true;
        }
      }
    }

    if (updated) {
      saveStore(parsed);
    }
    return parsed;
  } catch (e) {
    const init = getInitialStore();
    saveStore(init);
    return init;
  }
}

let inMemoryStore: MockStore | null = null;

function saveStore(store: MockStore) {
  inMemoryStore = store;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // In-memory fallback if localStorage quota exceeded
    }
  }
}

export const mockApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    await delay();
    const store = loadStore();
    const admin = store.admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!admin) {
      throw new Error("No account found for this email address. Please ask the Root Admin to register you.");
    }
    if (!admin.claimed) {
      throw new Error("Account has not been claimed yet. Please complete First-time Setup.");
    }
    if (admin.passwordHash !== password) {
      throw new Error("Invalid password provided.");
    }

    const token = `mock-jwt-token-${admin.id}-${Date.now()}`;
    return {
      success: true,
      token,
      id: admin.id,
      email: admin.email,
      role: admin.role,
      domain: admin.domain,
      name: admin.name,
    };
  },

  async setup(email: string, password: string, name?: string, setupCode?: string): Promise<AuthResponse> {
    await delay();
    const store = loadStore();
    const admin = store.admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!admin) {
      throw new Error("This email is not authorized for setup. Only emails registered by the Root Admin can claim an account.");
    }
    admin.claimed = true;
    admin.passwordHash = password;
    if (name) admin.name = name;
    saveStore(store);

    const token = `mock-jwt-token-${admin.id}-${Date.now()}`;
    return {
      success: true,
      token,
      id: admin.id,
      email: admin.email,
      role: admin.role,
      domain: admin.domain,
      name: admin.name,
    };
  },

  async getApplicants(domain: string = "ALL"): Promise<Application[]> {
    await delay();
    const store = loadStore();
    let apps = store.applications;
    if (domain && domain !== "ALL") {
      apps = apps.filter((a) => a.domain === domain);
    }
    return apps;
  },

  async getApplication(applicationId: string): Promise<Application> {
    await delay();
    const store = loadStore();
    const found = store.applications.find((a) => a.id === applicationId);
    if (!found) {
      const err: any = new Error("Application not found");
      err.status = 404;
      throw err;
    }
    return found;
  },

  async getApplicantById(userId: string): Promise<ApplicantUser> {
    await delay();
    const store = loadStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) {
      throw new Error("Applicant not found");
    }
    return user;
  },

  async updateReview(applicationId: string, payload: ReviewPayload): Promise<Application> {
    await delay();
    const store = loadStore();
    const appIndex = store.applications.findIndex((a) => a.id === applicationId);
    if (appIndex === -1) {
      throw new Error("Application not found");
    }
    const app = store.applications[appIndex];

    // Refuse direct stage jump from FORM_FILLING to SHORTLISTED or REJECTED
    if (payload.stage && payload.stage !== app.stage) {
      if (app.stage === "FORM_FILLING" && (payload.stage === "SHORTLISTED" || payload.stage === "REJECTED")) {
        const err: any = new Error("Stage changes from FORM_FILLING must go through the decision and email workflow");
        err.code = "USE_DECISION_FLOW";
        err.status = 409;
        throw err;
      }

      if (payload.stage === "SHORTLISTED" && !app.submittedAt) {
        throw new Error("NOT_SUBMITTED: Cannot shortlist an unsubmitted application");
      }

      const allowed = ALLOWED_STAGE_MOVES[app.stage] || [];
      if (!allowed.includes(payload.stage)) {
        throw new Error(`INVALID_STAGE_CHANGE: Cannot transition from ${app.stage} to ${payload.stage}`);
      }

      if (payload.stage === "REJECTED" || payload.stage === "SLOT_CHOOSING") {
        if (app.booking) {
          const slot = store.slots.find((s) => s.id === app.booking?.slotId);
          if (slot) {
            slot.bookings = (slot.bookings || []).filter((b) => b.applicationId !== app.id);
          }
          app.booking = null;
        }
      }
      app.stage = payload.stage;
    }

    // Refuse round 1 changes if email already sent
    if (app.round1EmailSentAt) {
      const isAttemptingRound1 =
        payload.review1Marks !== undefined ||
        payload.review1Comments !== undefined ||
        payload.review1Passed !== undefined ||
        payload.round1Decision !== undefined ||
        (payload.answerScores && payload.answerScores.length > 0);

      if (isAttemptingRound1) {
        const err: any = new Error("Round 1 review is locked after decision emails have been sent.");
        err.code = "DECISION_LOCKED";
        err.status = 409;
        throw err;
      }
    }

    // Round 1 Decision setting
    if (payload.round1Decision !== undefined) {
      if (!app.submittedAt || app.stage !== "FORM_FILLING" || app.round1EmailSentAt) {
        const err: any = new Error("Round 1 decision can only be updated for submitted applications in FORM_FILLING before emails are dispatched.");
        err.code = "DECISION_LOCKED";
        err.status = 409;
        throw err;
      }
      if (payload.round1Decision === "REJECT" && payload.review1Comments !== undefined) {
        if (!payload.review1Comments || payload.review1Comments.trim().length < 10) {
          const err: any = new Error("A comment of at least 10 characters is required for rejection.");
          err.status = 400;
          throw err;
        }
      }
      app.round1Decision = payload.round1Decision;
      app.round1DecisionAt = payload.round1Decision ? new Date().toISOString() : null;
      app.review1Passed = payload.round1Decision === "SHORTLIST";
    }

    // Interview Marks check
    const isAttemptingInterview =
      payload.review2Marks !== undefined || payload.review2Comments !== undefined || payload.review2Passed !== undefined;
    if (isAttemptingInterview) {
      const allowedStages = ["INTERVIEW", "SELECTED", "REJECTED"];
      if (!allowedStages.includes(app.stage)) {
        const err: any = new Error("Interview marks can only be entered for candidates in interview stage.");
        err.code = "INTERVIEW_NOT_ALLOWED";
        err.status = 409;
        throw err;
      }
    }

    if (payload.review1Marks !== undefined) app.review1Marks = payload.review1Marks;
    if (payload.review1Comments !== undefined) app.review1Comments = payload.review1Comments;
    if (payload.review1Passed !== undefined) app.review1Passed = payload.review1Passed;
    if (payload.review2Marks !== undefined) app.review2Marks = payload.review2Marks;
    if (payload.review2Comments !== undefined) app.review2Comments = payload.review2Comments;
    if (payload.review2Passed !== undefined) app.review2Passed = payload.review2Passed;

    if (payload.answerScores && payload.answerScores.length > 0) {
      payload.answerScores.forEach(({ answerId, marks }) => {
        const user = store.users.find((u) => u.id === app.userId);
        if (user) {
          const ans = user.answers.find((a) => a.id === answerId);
          if (ans) ans.marks = marks;
        }
        const appAns = app.user.answers.find((a) => a.id === answerId);
        if (appAns) appAns.marks = marks;
      });
    }

    store.applications[appIndex] = { ...app };
    saveStore(store);
    return app;
  },

  async createSlots(payload: CreateSlotPayload): Promise<{ success: boolean; message: string }> {
    await delay();
    const store = loadStore();
    const duration = payload.durationMinutes || 15;
    const startMs = new Date(payload.startTime).getTime();
    const endMs = new Date(payload.endTime).getTime();
    const stepMs = duration * 60 * 1000;

    let createdCount = 0;
    for (let t = startMs; t + stepMs <= endMs; t += stepMs) {
      const slotStart = new Date(t).toISOString();
      const slotEnd = new Date(t + stepMs).toISOString();
      const newSlot: Slot = {
        id: `slot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        interviewerId: payload.interviewerId || "admin-head",
        domain: payload.domain,
        meetingLink: payload.meetingLink || "https://meet.google.com/tam-general",
        startTime: slotStart,
        endTime: slotEnd,
        capacity: payload.capacity || 1,
        bookings: [],
      };
      store.slots.push(newSlot);
      createdCount++;
    }

    saveStore(store);
    return { success: true, message: `Successfully created ${createdCount} slots.` };
  },

  async getSchedule(adminId: string = "ALL", all: boolean = true, domain?: string): Promise<Slot[]> {
    await delay();
    const store = loadStore();
    let result = store.slots;

    if (domain && domain !== "ALL") {
      result = result.filter((s) => s.domain === domain);
    }
    if (adminId && adminId !== "ALL") {
      result = result.filter((s) => s.interviewerId === adminId);
    }
    if (!all) {
      result = result.filter((s) => s.bookings && s.bookings.length > 0);
    }

    result.forEach((slot) => {
      (slot.bookings || []).forEach((b) => {
        if (!b.application) {
          const app = store.applications.find((a) => a.id === b.applicationId);
          if (app) b.application = app;
        }
      });
    });

    return result;
  },

  async getForm(domain?: string): Promise<FormQuestionsResponse> {
    await delay();
    const store = loadStore();
    let subs = store.subsections;
    let qs = store.questions;

    if (domain && domain !== "ALL") {
      subs = subs.filter((s) => s.domain === domain);
      qs = qs.filter((q) => q.domain === domain);
    }

    return { subsections: subs, questions: qs };
  },

  async createSubsection(name: string, domain?: DomainEnum, order: number = 0): Promise<Subsection> {
    await delay();
    const store = loadStore();
    const newSub: Subsection = {
      id: `sub-${Date.now()}`,
      name,
      domain: domain || "TECHNICAL",
      order,
    };
    store.subsections.push(newSub);
    saveStore(store);
    return newSub;
  },

  async createQuestion(payload: Partial<Question>): Promise<Question> {
    await delay();
    const store = loadStore();
    const newQ: Question = {
      id: `q-${Date.now()}`,
      domain: payload.domain || "TECHNICAL",
      text: payload.text || "New Question",
      maxMarks: payload.maxMarks || 10,
      subsectionId: payload.subsectionId || null,
      order: payload.order || store.questions.length + 1,
      required: payload.required ?? true,
      maxLength: 100000,
    };
    store.questions.push(newQ);
    saveStore(store);
    return newQ;
  },

  async deleteSlot(slotId: string): Promise<{ success: boolean; message: string }> {
    await delay();
    const store = loadStore();
    const idx = store.slots.findIndex((s) => s.id === slotId);
    if (idx === -1) {
      throw new Error("Slot not found");
    }
    const slot = store.slots[idx];
    if (slot.bookings && slot.bookings.length > 0) {
      throw new Error("Cannot delete a booked interview slot");
    }
    store.slots.splice(idx, 1);
    saveStore(store);
    return { success: true, message: "Slot deleted successfully." };
  },

  async updateSlot(slotId: string, payload: { meetingLink?: string }): Promise<Slot> {
    await delay();
    const store = loadStore();
    const idx = store.slots.findIndex((s) => s.id === slotId);
    if (idx === -1) throw new Error("Slot not found");
    store.slots[idx] = { ...store.slots[idx], ...payload };
    store.applications.forEach((app) => {
      if (app.booking?.slotId === slotId) {
        if (app.booking.slot && payload.meetingLink) {
          app.booking.slot.meetingLink = payload.meetingLink;
        }
      }
    });
    saveStore(store);
    return store.slots[idx];
  },

  async updateQuestion(id: string, payload: Partial<Question>): Promise<Question> {
    await delay();
    const store = loadStore();
    const idx = store.questions.findIndex((q) => q.id === id);
    if (idx === -1) throw new Error("Question not found");
    store.questions[idx] = { ...store.questions[idx], ...payload };
    saveStore(store);
    return store.questions[idx];
  },

  async deleteQuestion(id: string): Promise<{ success: boolean }> {
    await delay();
    const store = loadStore();
    store.questions = store.questions.filter((q) => q.id !== id);
    saveStore(store);
    return { success: true };
  },

  async updateSubsection(id: string, name: string, order?: number): Promise<Subsection> {
    await delay();
    const store = loadStore();
    const idx = store.subsections.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error("Subsection not found");
    store.subsections[idx].name = name;
    if (order !== undefined) store.subsections[idx].order = order;
    saveStore(store);
    return store.subsections[idx];
  },

  async deleteSubsection(id: string): Promise<{ success: boolean }> {
    await delay();
    const store = loadStore();
    store.subsections = store.subsections.filter((s) => s.id !== id);
    saveStore(store);
    return { success: true };
  },

  async getDomainHeads(): Promise<TeamMember[]> {
    await delay();
    const store = loadStore();
    return store.admins.map((a) => ({
      id: a.id,
      email: a.email,
      role: a.role,
      domain: a.domain,
      name: a.name,
      claimed: a.claimed,
    }));
  },

  async addDomainHeads(
    emails: string[] | string,
    domain: DomainEnum
  ): Promise<{ message: string; assignedEmails: string[]; alreadyExisting?: string[] }> {
    await delay();
    const store = loadStore();
    const emailList = Array.isArray(emails)
      ? emails
      : emails.split(/[,;\n]/).map((e) => e.trim().toLowerCase()).filter(Boolean);

    const assigned: string[] = [];
    const alreadyExisting: string[] = [];
    for (const email of emailList) {
      if (store.admins.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
        alreadyExisting.push(email);
        continue;
      }
      store.admins.push({
        id: `admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        email,
        role: "DOMAIN_HEAD",
        domain,
        name: `${DOMAIN_LABELS[domain]} Head (${email.split("@")[0]})`,
        passwordHash: "password123",
        claimed: false,
      });
      assigned.push(email);
    }

    saveStore(store);

    if (alreadyExisting.length > 0 && assigned.length === 0) {
      const err: any = new Error(`The following emails already have admin accounts: ${alreadyExisting.join(", ")}`);
      err.alreadyExisting = alreadyExisting;
      throw err;
    }

    return {
      message: `Assigned ${assigned.length} head(s) to ${DOMAIN_LABELS[domain]}.`,
      assignedEmails: assigned,
      alreadyExisting,
    };
  },

  async getRound1Summary(domain?: string): Promise<{
    undecided: number;
    pendingShortlist: number;
    pendingReject: number;
    sentShortlist: number;
    sentReject: number;
  }> {
    await new Promise((r) => setTimeout(r, 120));
    const store = loadStore();
    const effectiveDomain = domain && domain !== "ALL" ? domain : undefined;

    let undecided = 0;
    let pendingShortlist = 0;
    let pendingReject = 0;
    let sentShortlist = 0;
    let sentReject = 0;

    store.applications.forEach((app: any) => {
      if (effectiveDomain && app.domain !== effectiveDomain) return;
      if (!app.submittedAt) return;

      if (app.round1EmailSentAt) {
        if (app.round1Decision === "SHORTLIST") sentShortlist++;
        else if (app.round1Decision === "REJECT") sentReject++;
      } else {
        if (app.round1Decision === "SHORTLIST") pendingShortlist++;
        else if (app.round1Decision === "REJECT") pendingReject++;
        else undecided++;
      }
    });

    return { undecided, pendingShortlist, pendingReject, sentShortlist, sentReject };
  },

  async getRound1Templates(decision?: string): Promise<any> {
    await new Promise((r) => setTimeout(r, 80));
    const templates = {
      SHORTLIST: {
        decision: "SHORTLIST",
        subject: "TAM Recruitment: Shortlisted for Interview - {{division}}",
        body: "Dear {{name}},\n\nCongratulations! We are pleased to invite you to a 15-minute online interview for the {{division}} team.\n\nPlease sign in to {{site_url}} to choose your preferred interview slot at your earliest convenience.\n\nBest regards,\nTAM Recruitment Team",
      },
      REJECT: {
        decision: "REJECT",
        subject: "TAM Recruitment: Application Status Update - {{division}}",
        body: "Dear {{name}},\n\nThank you for applying to the {{division}} team at The AI & ML Club, IIT Roorkee. We enjoyed reviewing your dossier.\n\nAfter careful evaluation, we are unable to take your application forward to the interview stage this recruitment cycle. We encourage you to participate in our open workshops and apply again next term.\n\nWarm regards,\nTAM Recruitment Team",
      },
    };
    if (decision === "SHORTLIST") return templates.SHORTLIST;
    if (decision === "REJECT") return templates.REJECT;
    return templates;
  },

  async sendRound1Emails(payload: {
    domain: string;
    decision: "SHORTLIST" | "REJECT";
    subject: string;
    body: string;
    limit?: number;
  }): Promise<{ processed: number; sent: number; failed: any[]; remaining: number }> {
    await new Promise((r) => setTimeout(r, 400));
    const store = loadStore();
    const batchLimit = Math.min(Number(payload.limit) || 20, 50);

    const candidates = store.applications.filter(
      (app: any) =>
        (payload.domain === "ALL" || app.domain === payload.domain) &&
        app.submittedAt &&
        (app.stage === "FORM_FILLING" || app.stage === "SHORTLISTED" || app.stage === "REJECTED") &&
        app.round1Decision === payload.decision &&
        !app.round1EmailSentAt
    );

    const toProcess = candidates.slice(0, batchLimit);
    toProcess.forEach((app: any) => {
      app.stage = payload.decision === "SHORTLIST" ? "SHORTLISTED" : "REJECTED";
      app.round1EmailSentAt = new Date().toISOString();
    });

    saveStore(store);

    return {
      processed: toProcess.length,
      sent: toProcess.length,
      failed: [],
      remaining: Math.max(0, candidates.length - toProcess.length),
    };
  },
};
