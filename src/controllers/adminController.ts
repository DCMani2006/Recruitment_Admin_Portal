import { Request, Response } from 'express';
import { PrismaClient, DomainType, Role, Stage } from '@prisma/client';
import { changeStage } from '../utils/adminRules';
import { CustomRequest } from '../middleware/authMiddleware';
import { sendShortlistEmail } from '../emailer';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reusable safe user selection to prevent sending passwordHash to admins
const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  regNumber: true,
  image: true,
  createdAt: true,
  updatedAt: true,
  answers: {
    include: { question: true },
  },
};

// 1. Fetch all submitted applicants
export const getAllApplicants = async (req: CustomRequest, res: Response) => {
  try {
    const queryDomain = req.query.domain as string | undefined;
    const admin = req.user as any;

    const effectiveDomain =
      admin?.role === 'DOMAIN_HEAD' && admin?.domain
        ? (admin.domain as DomainType)
        : queryDomain && queryDomain !== 'ALL'
        ? (queryDomain as DomainType)
        : undefined;

    const applications = await prisma.application.findMany({
      where: {
        ...(effectiveDomain ? { domain: effectiveDomain } : {}),
        submittedAt: { not: null },
      },
      include: {
        user: { select: safeUserSelect },
        booking: {
          include: {
            slot: {
              include: { interviewer: { select: { id: true, name: true, email: true } } },
            },
          },
        },
        emails: true,
      },
      orderBy: { user: { regNumber: 'asc' } },
    });

    return res.status(200).json({ success: true, data: applications });
  } catch (error) {
    console.error('getAllApplicants failed:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching applicants' });
  }
};

// 2. Fetch a single applicant's full details
export const getApplicantById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const applicant = await prisma.user.findUnique({
      where: { id: String(id) },
      select: {
        ...safeUserSelect,
        applications: true,
      },
    });

    if (!applicant) return res.status(404).json({ success: false, message: 'Applicant not found' });

    return res.status(200).json({ success: true, data: applicant });
  } catch (error) {
    console.error('getApplicantById failed:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 3. Update applicant review
export const updateApplicantReview = async (req: CustomRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const { stage, review1Marks, review1Comments, review1Passed, review2Marks, review2Comments, review2Passed, answerScores } = req.body;
    const admin = req.user as any;

    const currentApp = await prisma.application.findUnique({
      where: { id: String(applicationId) },
      include: { booking: true },
    });

    if (!currentApp) return res.status(404).json({ success: false, message: 'Application not found' });

    // Strict backend domain isolation check
    if (admin.role !== 'ROOT_ADMIN' && currentApp.domain !== admin.domain) {
      return res.status(403).json({ success: false, message: 'Access Denied: You can only modify candidates in your own domain.' });
    }

    if (Array.isArray(answerScores) && answerScores.length > 0) {
      await Promise.all(
        answerScores.map(async (item: { answerId: string; marks: number }) => {
          const answerRecord = await prisma.answer.findUnique({ where: { id: String(item.answerId) }, include: { question: true } });
          
          // Prevent marks from exceeding maxMarks at the API level
          if (answerRecord && answerRecord.question) {
            const finalMarks = Math.min(Number(item.marks) || 0, answerRecord.question.maxMarks);
            return prisma.answer.update({
              where: { id: String(item.answerId) },
              data: { marks: finalMarks },
            });
          }
        })
      );
    }

    if (stage && stage !== currentApp.stage) {
      if (currentApp.booking && (stage === 'SELECTED' || stage === 'REJECTED')) {
        await prisma.application.update({ where: { id: String(applicationId) }, data: { stage: stage as Stage } });
      } else {
        try { await changeStage(String(applicationId), stage as Stage, admin); } 
        catch { await prisma.application.update({ where: { id: String(applicationId) }, data: { stage: stage as Stage } }); }
      }
    }

    const updatedApplication = await prisma.application.update({
      where: { id: String(applicationId) },
      data: {
        ...(review1Marks !== undefined ? { review1Marks: Number(review1Marks) } : {}),
        ...(review1Comments !== undefined ? { review1Comments } : {}),
        ...(review1Passed !== undefined ? { review1Passed: Boolean(review1Passed) } : {}),
        ...(review2Marks !== undefined ? { review2Marks: Number(review2Marks) } : {}),
        ...(review2Comments !== undefined ? { review2Comments } : {}),
        ...(review2Passed !== undefined ? { review2Passed: Boolean(review2Passed) } : {}),
      },
      include: { user: { select: safeUserSelect }, booking: { include: { slot: true } } },
    });

    return res.status(200).json({ success: true, data: updatedApplication });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// Domain heads always work on their own domain; root admins must pick one
const resolveDomain = (admin: any, domain: unknown): DomainType | undefined =>
  admin?.role === 'DOMAIN_HEAD' && admin?.domain
    ? (admin.domain as DomainType)
    : typeof domain === 'string' && (Object.values(DomainType) as string[]).includes(domain)
    ? (domain as DomainType)
    : undefined;

// Shortlisted = waiting to book a slot; Rejected = turned down at Review 1 (not after an interview,
// because the rejection email says they weren't moved to the interview stage)
const RESULT_GROUPS = {
  SHORTLISTED: { stages: ['SHORTLISTED', 'SLOT_CHOOSING'] as Stage[], shortlisted: true },
  REJECTED: { stages: ['REJECTED'] as Stage[], shortlisted: false },
} as const;
type ResultGroup = keyof typeof RESULT_GROUPS;

async function findGroup(domain: DomainType, group: ResultGroup) {
  const apps = await prisma.application.findMany({
    where: { domain, submittedAt: { not: null }, stage: { in: RESULT_GROUPS[group].stages } },
    include: { user: { select: { name: true, email: true, regNumber: true } }, emails: true },
    orderBy: { user: { regNumber: 'asc' } },
  });
  return group === 'REJECTED' ? apps.filter((a) => a.review1Passed !== true) : apps;
}

// Latest email status for one group's email type: SENT once any attempt succeeded
function emailStatus(emails: { type: string; status: string; sentAt: Date | null; error: string | null; createdAt: Date }[], type: ResultGroup) {
  const mine = emails.filter((e) => e.type === type).sort((a, b) => +b.createdAt - +a.createdAt);
  const sent = mine.find((e) => e.status === 'SENT');
  if (sent) return { status: 'SENT', sentAt: sent.sentAt, error: null };
  if (mine[0]) return { status: 'FAILED', sentAt: null, error: mine[0].error };
  return { status: 'NOT_SENT', sentAt: null, error: null };
}

// 3B. Release Review 1 results: moves stages only. Emails are sent separately from the result lists.
export const releaseShortlistBatch = async (req: CustomRequest, res: Response) => {
  try {
    const effectiveDomain = resolveDomain(req.user, req.body?.domain);
    if (!effectiveDomain) return res.status(400).json({ success: false, message: 'Please select a specific domain.' });

    const apps = await prisma.application.findMany({
      where: { domain: effectiveDomain, submittedAt: { not: null }, stage: 'FORM_FILLING' },
    });
    // only candidates still at the form stage; anyone already moved on keeps their stage
    const toShortlist = apps.filter((a) => a.review1Passed === true);
    const toReject = apps.filter((a) => a.review1Passed !== true && a.review1Marks !== null);

    if (toShortlist.length) {
      await prisma.application.updateMany({ where: { id: { in: toShortlist.map((a) => a.id) } }, data: { stage: 'SLOT_CHOOSING' } });
    }
    if (toReject.length) {
      await prisma.application.updateMany({ where: { id: { in: toReject.map((a) => a.id) } }, data: { stage: 'REJECTED' } });
    }

    return res.status(200).json({
      success: true,
      shortlisted: toShortlist.length,
      rejected: toReject.length,
      message: `Results released: ${toShortlist.length} shortlisted, ${toReject.length} rejected. No emails were sent yet — send them from the Results & Emails tab.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3C. The two result lists (Shortlisted, Rejected) with each candidate's email status
export const getResultLists = async (req: CustomRequest, res: Response) => {
  try {
    const effectiveDomain = resolveDomain(req.user, req.query.domain);
    if (!effectiveDomain) return res.status(400).json({ success: false, message: 'Please select a specific domain.' });

    const toRow = (group: ResultGroup) => (a: Awaited<ReturnType<typeof findGroup>>[number]) => {
      const mail = emailStatus(a.emails, group);
      return {
        applicationId: a.id,
        name: a.user?.name,
        email: a.user?.email,
        regNumber: a.user?.regNumber,
        stage: a.stage,
        review1Marks: a.review1Marks,
        emailStatus: mail.status,
        emailSentAt: mail.sentAt,
        emailError: mail.error,
      };
    };
    const [shortlisted, rejected] = await Promise.all([findGroup(effectiveDomain, 'SHORTLISTED'), findGroup(effectiveDomain, 'REJECTED')]);
    return res.status(200).json({
      success: true,
      domain: effectiveDomain,
      data: { shortlisted: shortlisted.map(toRow('SHORTLISTED')), rejected: rejected.map(toRow('REJECTED')) },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3D. Send the shortlist or rejection email to everyone in that list who hasn't received it yet
// body: { domain, group: "SHORTLISTED" | "REJECTED" }. Safe to press again: already-sent candidates are skipped,
// failed ones are retried.
export const sendResultEmails = async (req: CustomRequest, res: Response) => {
  try {
    const effectiveDomain = resolveDomain(req.user, req.body?.domain);
    if (!effectiveDomain) return res.status(400).json({ success: false, message: 'Please select a specific domain.' });
    const group = req.body?.group as ResultGroup;
    if (group !== 'SHORTLISTED' && group !== 'REJECTED') {
      return res.status(400).json({ success: false, message: 'group must be SHORTLISTED or REJECTED.' });
    }

    const apps = await findGroup(effectiveDomain, group);
    const pending = apps.filter((a) => emailStatus(a.emails, group).status !== 'SENT' && a.user?.email);

    let sent = 0, failed = 0;
    for (const app of pending) {
      const attempts = app.emails.filter((e) => e.type === group).length + 1;
      try {
        await sendShortlistEmail({ name: app.user.name || 'Candidate', email: app.user.email, shortlisted: RESULT_GROUPS[group].shortlisted });
        await prisma.emailLog.create({ data: { applicationId: app.id, type: group, status: 'SENT', attempts, sentAt: new Date() } });
        sent++;
        await sleep(600); // stay under Gmail's sending rate
      } catch (err: any) {
        await prisma.emailLog.create({ data: { applicationId: app.id, type: group, status: 'FAILED', attempts, error: String(err?.message ?? err).slice(0, 500) } });
        failed++;
      }
    }

    const label = group === 'SHORTLISTED' ? 'shortlist' : 'rejection';
    return res.status(200).json({
      success: true,
      sent,
      failed,
      alreadySent: apps.length - pending.length,
      message: pending.length === 0
        ? `Everyone in this list already has the ${label} email.`
        : `${sent} ${label} email(s) sent${failed ? `, ${failed} failed (press again to retry)` : ''}.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. Create Interview Slots
export const createInterviewSlots = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { interviewerId, domain, meetingLink, startTime, endTime, durationMinutes, capacity } = req.body;

    const effectiveInterviewerId = interviewerId || admin?.id;
    // Prevent Domain Heads from creating slots in other domains via API
    const effectiveDomain = admin?.role === 'ROOT_ADMIN' ? (domain || admin.domain) : admin?.domain;

    if (!effectiveInterviewerId || !effectiveDomain) return res.status(400).json({ success: false, message: 'Missing interviewer or domain.' });

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return res.status(400).json({ success: false, message: 'Invalid times.' });

    const totalRangeMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const slotDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : totalRangeMinutes;

    const slotsToCreate = [];
    let currentStart = new Date(start);

    while (currentStart < end) {
      const currentEnd = new Date(currentStart.getTime() + slotDuration * 60000);
      if (currentEnd > end) break;
      slotsToCreate.push({
        interviewerId: String(effectiveInterviewerId),
        domain: effectiveDomain as DomainType,
        meetingLink: meetingLink ? String(meetingLink).trim() : null,
        startTime: new Date(currentStart),
        endTime: new Date(currentEnd),
        capacity: Number(capacity) > 0 ? Number(capacity) : 1,
      });
      currentStart = currentEnd;
    }

    if (slotsToCreate.length === 0) return res.status(400).json({ success: false, message: 'Time window is shorter than slot duration.' });

    const createdSlots = await prisma.slot.createMany({ data: slotsToCreate });
    return res.status(201).json({ success: true, message: `Created ${createdSlots.count} slots!` });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error creating slots' });
  }
};

// 5. Get My Schedule
export const getMySchedule = async (req: CustomRequest, res: Response) => {
  try {
    const { adminId } = req.params;
    const { all, domain } = req.query;

    const mySchedule = await prisma.slot.findMany({
      where: {
        ...(adminId && adminId !== 'ALL' ? { interviewerId: String(adminId) } : {}),
        ...(domain && domain !== 'ALL' ? { domain: String(domain) as DomainType } : {}),
        ...(all === 'true' ? {} : { bookedCount: { gt: 0 } }),
      },
      include: { bookings: { include: { application: { include: { user: { select: safeUserSelect } } } } } },
      orderBy: { startTime: 'asc' },
    });

    return res.status(200).json({ success: true, data: mySchedule });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 5B. Delete an Interview Slot
export const deleteInterviewSlot = async (req: CustomRequest, res: Response) => {
  try {
    const { id } = req.params;
    const admin = req.user as any;

    const slot = await prisma.slot.findUnique({ where: { id: String(id) }, include: { bookings: true } });
    if (!slot) return res.status(404).json({ success: false, message: 'Slot not found.' });

    if (admin?.role !== 'ROOT_ADMIN' && slot.interviewerId !== admin?.id) {
      return res.status(403).json({ success: false, message: 'You can only delete slots that you created.' });
    }

    if (slot.bookings.length > 0) return res.status(400).json({ success: false, message: 'Slot is booked.' });

    await prisma.slot.delete({ where: { id: String(id) } });
    return res.status(200).json({ success: true, message: 'Slot deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// 6A. Get All Whitelisted Domain Heads
export const getDomainHeads = async (req: Request, res: Response) => {
  try {
    const admins = await prisma.admin.findMany({ orderBy: { email: 'asc' } });
    const formatted = admins.map((a) => ({ id: a.id, email: a.email, name: a.name, role: a.role, domain: a.domain, hasPassword: Boolean(a.password) }));
    return res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
};

// 6B. Assign or Update Domain Heads
export const assignDomainHead = async (req: Request, res: Response) => {
  try {
    const { emails, email, domain } = req.body;
    const rawList = Array.isArray(emails) ? emails : typeof emails === 'string' ? emails.split(',') : typeof email === 'string' ? email.split(',') : [];
    const normalizedEmails = rawList.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean);

    if (normalizedEmails.length === 0) return res.status(400).json({ success: false, message: 'Provide a valid email.' });

    const allAdmins = await prisma.admin.findMany();
    let createdCount = 0, updatedCount = 0;

    for (const em of normalizedEmails) {
      const existing = allAdmins.find((a) => a.email.trim().toLowerCase() === em);
      if (existing) {
        await prisma.admin.update({ where: { id: existing.id }, data: { email: em, domain: domain as DomainType } });
        updatedCount++;
      } else {
        await prisma.admin.create({ data: { email: em, role: 'DOMAIN_HEAD' as Role, domain: domain as DomainType } });
        createdCount++;
      }
    }
    return res.status(201).json({ success: true, message: `Whitelisted ${createdCount} new, updated ${updatedCount}.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 7. Get Domain Form Questions & Subsections
export const getDomainForm = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const queryDomain = req.query.domain as string | undefined;

    const effectiveDomain = queryDomain && queryDomain !== 'ALL' ? (queryDomain as DomainType) : admin?.domain ? (admin.domain as DomainType) : undefined;

    const [subsections, questions] = await Promise.all([
      prisma.subsection.findMany({ where: effectiveDomain ? { domain: effectiveDomain } : undefined, orderBy: { order: 'asc' } }),
      prisma.question.findMany({ where: effectiveDomain ? { domain: effectiveDomain } : undefined, include: { subsection: true }, orderBy: { order: 'asc' } }),
    ]);

    return res.status(200).json({ success: true, data: { subsections, questions } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 8. Create a Form Subsection
export const createSubsection = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { name, domain, order } = req.body;
    const effectiveDomain = (domain || admin?.domain) as DomainType;

    if (!name || !effectiveDomain) return res.status(400).json({ success: false, message: 'Name and domain required.' });

    const subsection = await prisma.subsection.create({ data: { name: String(name).trim(), domain: effectiveDomain, order: Number(order) || 0 } });
    return res.status(201).json({ success: true, data: subsection });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 9A. Create a Question
export const createQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { text, domain, subsectionId, required, order, maxLength, maxMarks } = req.body;
    const effectiveDomain = (domain || admin?.domain) as DomainType;

    if (!text || !effectiveDomain) return res.status(400).json({ success: false, message: 'Text and domain required.' });

    let validSubsectionId: string | null = null;
    if (subsectionId) {
      const subsection = await prisma.subsection.findUnique({ where: { id: String(subsectionId) } });
      if (!subsection || subsection.domain !== effectiveDomain) return res.status(400).json({ success: false, message: 'Invalid subsection.' });
      validSubsectionId = subsection.id;
    }

    const question = await prisma.question.create({
      data: { text: String(text).trim(), domain: effectiveDomain, subsectionId: validSubsectionId, required: required !== undefined ? Boolean(required) : true, order: Number(order) || 0, maxLength: Number(maxLength) || 2000, maxMarks: Number(maxMarks) || 10 },
    });
    return res.status(201).json({ success: true, data: question });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 9B. Edit / Update an Existing Question
export const updateQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { text, maxMarks, order, subsectionId, required } = req.body;

    const existing = await prisma.question.findUnique({ where: { id: String(id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Not found.' });

    const updated = await prisma.question.update({
      where: { id: String(id) },
      data: {
        ...(text !== undefined ? { text: String(text).trim() } : {}),
        ...(maxMarks !== undefined ? { maxMarks: Number(maxMarks) || 10 } : {}),
        ...(order !== undefined ? { order: Number(order) || 0 } : {}),
        ...(subsectionId !== undefined ? { subsectionId: subsectionId ? String(subsectionId) : null } : {}),
        ...(required !== undefined ? { required: Boolean(required) } : {}),
      },
    });
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 9C. Delete a Question
export const deleteQuestion = async (req: CustomRequest, res: Response) => {
  try {
    await prisma.question.delete({ where: { id: String(req.params.id) } });
    return res.status(200).json({ success: true, message: 'Deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 10. Setup Admin Account
export const setupAdminAccount = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const allMatching = await prisma.admin.findMany();
    const admin = allMatching.find((a) => a.email.trim().toLowerCase() === normalizedEmail);

    if (!admin) return res.status(403).json({ success: false, message: 'Access Denied: Not whitelisted.' });
    if (admin.password) return res.status(400).json({ success: false, message: 'Password already set. Please login.' });

    const hashedPassword = await bcrypt.hash(String(password), 10);
    
    // Kept safe by NOT updating the email field (preventing MongoDB P2002 casing collisions)
    const updatedAdmin = await prisma.admin.update({
      where: { id: String(admin.id) },
      data: { password: hashedPassword, ...(name ? { name: String(name) } : {}) },
    });

    // Maintained fallback_secret as requested by you for critical uptime stability
    const secret = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'fallback_secret';

    const token = jwt.sign(
      { id: updatedAdmin.id, email: updatedAdmin.email, role: updatedAdmin.role, domain: updatedAdmin.domain }, 
      secret, 
      { expiresIn: '12h' }
    );
    
    return res.status(200).json({ 
      success: true, 
      message: 'Password created!', 
      token, 
      id: updatedAdmin.id, 
      email: updatedAdmin.email, 
      role: updatedAdmin.role, 
      domain: updatedAdmin.domain 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 11. Login Admin
export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const allMatching = await prisma.admin.findMany();
    const admin = allMatching.find((a) => a.email.trim().toLowerCase() === normalizedEmail);

    if (!admin) return res.status(401).json({ success: false, message: 'Not registered.' });
    if (!admin.password) return res.status(400).json({ success: false, message: 'Click "Create First-Time Password" to set up.' });

    const isMatch = await bcrypt.compare(String(password), admin.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Incorrect password.' });

    const secret = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'fallback_secret';

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, domain: admin.domain }, 
      secret, 
      { expiresIn: '12h' }
    );
    
    return res.status(200).json({ 
      success: true, 
      token, 
      id: admin.id, 
      email: admin.email, 
      role: admin.role, 
      domain: admin.domain 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};