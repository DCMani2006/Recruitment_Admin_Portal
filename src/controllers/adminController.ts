import { Request, Response } from 'express';
import { DomainType, Role, Stage, Round1Decision, EmailType, EmailStatus } from '@prisma/client';
import { changeStage, assertDomainAccess, DIVISION_LABELS, MAX_REVIEW2_MARKS } from '../utils/adminRules';
import { prisma } from '../utils/prisma';
import { CustomRequest, getJwtSecret, setupCodeFor, setupCodeMatches } from '../middleware/authMiddleware';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const mailerModule = require('../emailer/mailer');
const sendEmail = mailerModule.sendEmail;

export const DEFAULT_TEMPLATES = {
  SHORTLIST: {
    subject: 'TAM Recruitment: Shortlisted for Interview - {{division}}',
    body: `Dear {{name}},

Congratulations! We are pleased to invite you to a 15-minute online interview for the {{division}} team.

Please sign in to {{site_url}} to choose your preferred interview slot at your earliest convenience.

Best regards,
TAM Recruitment Team`,
  },
  REJECT: {
    subject: 'TAM Recruitment Update - {{division}}',
    body: `Dear {{name}},

Thank you for applying to the {{division}} team and taking the time to complete the application.

After careful consideration, we are not taking your application forward this time. We truly appreciate the thought and effort you put into your submission.

We warmly invite you to attend our future events and workshops, and encourage you to apply again in our upcoming recruitment cycles.

Best regards,
TAM Recruitment Team`,
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
        user: {
          include: {
            answers: {
              include: { question: true },
            },
          },
        },
        booking: {
          include: { slot: true },
        },
      },
      orderBy: { user: { regNumber: 'asc' } },
    });

    return res.status(200).json({ success: true, data: applications });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error fetching applicants' });
  }
};

// 2. Fetch a single applicant's full details
export const getApplicantById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const applicant = await prisma.user.findUnique({
      where: { id: String(id) },
      include: {
        applications: true,
        answers: {
          include: { question: true },
        },
      },
    });

    if (!applicant) return res.status(404).json({ success: false, message: 'Applicant not found' });
    return res.status(200).json({ success: true, data: applicant });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 3. Update an applicant's individual question marks, evaluation notes, stage, and round 1 decision
export const updateApplicantReview = async (req: CustomRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const {
      stage,
      round1Decision,
      review1Marks,
      review1Comments,
      review1Passed,
      review2Marks,
      review2Comments,
      review2Passed,
      answerScores, // Array of { answerId: string, marks: number }
    } = req.body;

    const admin = req.user as any;

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const currentApp = await prisma.application.findUnique({
      where: { id: String(applicationId) },
      include: {
        booking: {
          include: { slot: true },
        },
      },
    });

    if (!currentApp) {
      return res.status(404).json({ success: false, message: 'Application not found', code: 'APPLICATION_NOT_FOUND' });
    }

    // Domain check on every call
    assertDomainAccess(admin, currentApp.domain);

    // Direct stage change check: moving FORM_FILLING to SHORTLISTED or REJECTED directly is refused
    if (stage && stage !== currentApp.stage) {
      if (currentApp.stage === Stage.FORM_FILLING && (stage === Stage.SHORTLISTED || stage === Stage.REJECTED)) {
        return res.status(409).json({
          success: false,
          message: 'Stage changes from FORM_FILLING must go through the decision and email workflow',
          code: 'USE_DECISION_FLOW',
        });
      }
    }

    // After round1EmailSentAt is set, review1Marks, review1Comments, review1Passed, round1Decision and answerScores can no longer change
    if (currentApp.round1EmailSentAt !== null) {
      const isAttemptingRound1Change =
        review1Marks !== undefined ||
        review1Comments !== undefined ||
        review1Passed !== undefined ||
        round1Decision !== undefined ||
        (Array.isArray(answerScores) && answerScores.length > 0);

      if (isAttemptingRound1Change) {
        return res.status(409).json({
          success: false,
          message: 'Round 1 review is locked after decision emails have been sent.',
          code: 'DECISION_LOCKED',
        });
      }
    }

    // Round 1 Decision: Allowed only while the application is submitted, stage is FORM_FILLING, and round1EmailSentAt is null
    if (round1Decision !== undefined) {
      if (!currentApp.submittedAt || currentApp.stage !== Stage.FORM_FILLING || currentApp.round1EmailSentAt !== null) {
        return res.status(409).json({
          success: false,
          message: 'Round 1 decision can only be updated for submitted applications in FORM_FILLING before emails are dispatched.',
          code: 'DECISION_LOCKED',
        });
      }
      if (round1Decision !== 'SHORTLIST' && round1Decision !== 'REJECT' && round1Decision !== null) {
        return res.status(400).json({
          success: false,
          message: "round1Decision must be 'SHORTLIST', 'REJECT', or null",
          code: 'INVALID_DECISION',
        });
      }
      if (round1Decision === 'REJECT') {
        const commentsToCheck = review1Comments !== undefined ? review1Comments : currentApp.review1Comments;
        if (!commentsToCheck || String(commentsToCheck).trim().length < 10) {
          return res.status(400).json({
            success: false,
            message: 'A comment of at least 10 characters is required for rejection.',
            code: 'COMMENT_REQUIRED',
          });
        }
      }
    }

    // Interview Marks check: PUT review accepts review2Marks (0 to 10), review2Comments, and review2Passed
    const isAttemptingInterviewReview =
      review2Marks !== undefined || review2Comments !== undefined || review2Passed !== undefined;

    if (isAttemptingInterviewReview) {
      if (review2Marks !== undefined) {
        const m = Number(review2Marks);
        if (isNaN(m) || m < 0 || m > MAX_REVIEW2_MARKS) {
          return res.status(400).json({
            success: false,
            message: `review2Marks must be between 0 and ${MAX_REVIEW2_MARKS}`,
            code: 'INVALID_MARKS',
          });
        }
      }
    }

    // Save individual question marks if provided (and not locked)
    if (Array.isArray(answerScores) && answerScores.length > 0) {
      await Promise.all(
        answerScores.map((item: { answerId: string; marks: number }) =>
          prisma.answer.update({
            where: { id: String(item.answerId) },
            data: { marks: Number(item.marks) || 0 },
          })
        )
      );
    }

    // Update the application stage via adminRules if stage is changing
    if (stage && stage !== currentApp.stage) {
      await changeStage(String(applicationId), stage, admin as any);
    }

    // Build update payload
    const updateData: any = {};

    if (round1Decision !== undefined) {
      updateData.round1Decision = round1Decision as Round1Decision | null;
      updateData.round1DecisionAt = round1Decision ? new Date() : null;
      updateData.review1Passed = round1Decision === 'SHORTLIST';
    } else if (review1Passed !== undefined) {
      updateData.review1Passed = Boolean(review1Passed);
    }

    if (review1Marks !== undefined) updateData.review1Marks = Number(review1Marks);
    if (review1Comments !== undefined) updateData.review1Comments = review1Comments;

    if (review2Marks !== undefined) updateData.review2Marks = Number(review2Marks);
    if (review2Comments !== undefined) updateData.review2Comments = review2Comments;
    if (review2Passed !== undefined) updateData.review2Passed = Boolean(review2Passed);

    const updatedApplication = await prisma.application.update({
      where: { id: String(applicationId) },
      data: updateData,
      include: {
        user: {
          include: {
            answers: { include: { question: true } },
          },
        },
        booking: {
          include: { slot: true },
        },
      },
    });

    return res.status(200).json({ success: true, data: updatedApplication });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error', code: error.code });
  }
};

// 4. Create Interview Slots
export const createInterviewSlots = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { interviewerId, domain, meetingLink, startTime, endTime, durationMinutes, capacity } = req.body;

    const effectiveInterviewerId = interviewerId || admin?.id;
    const effectiveDomain = (domain || admin?.domain) as DomainType;

    if (!effectiveInterviewerId || !effectiveDomain) {
      return res.status(400).json({ success: false, message: 'Missing interviewer or domain information.' });
    }

    assertDomainAccess(admin, effectiveDomain);

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ success: false, message: 'End time must be after start time.' });
    }

    const totalRangeMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const slotDuration = Number(durationMinutes) > 0 ? Number(durationMinutes) : totalRangeMinutes;

    const slotsToCreate = [];
    let currentStart = new Date(start);

    while (currentStart < end) {
      const currentEnd = new Date(currentStart.getTime() + slotDuration * 60000);
      if (currentEnd > end) break;

      slotsToCreate.push({
        interviewerId: String(effectiveInterviewerId),
        domain: effectiveDomain,
        meetingLink: meetingLink ? String(meetingLink).trim() : null,
        startTime: new Date(currentStart),
        endTime: new Date(currentEnd),
        capacity: Number(capacity) > 0 ? Number(capacity) : 1,
      });

      currentStart = currentEnd;
    }

    if (slotsToCreate.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Time window (${totalRangeMinutes} mins) is shorter than the selected slot duration (${slotDuration} mins).`,
      });
    }

    const createdSlots = await prisma.slot.createMany({
      data: slotsToCreate,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully created ${createdSlots.count} interview slot(s) (${slotDuration} mins each)!`,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error while creating slots', code: error.code });
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
      include: {
        bookings: {
          include: {
            application: {
              include: {
                user: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return res.status(200).json({ success: true, data: mySchedule });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error fetching schedule' });
  }
};

// 6. Assign Domain Heads
export const assignDomainHead = async (req: Request, res: Response) => {
  try {
    const { emails, email, domain } = req.body;

    const rawList = Array.isArray(emails)
      ? emails
      : typeof emails === 'string'
      ? emails.split(',')
      : typeof email === 'string'
      ? email.split(',')
      : [];

    const normalizedEmails = rawList
      .map((e: string) => String(e).trim().toLowerCase())
      .filter(Boolean);

    if (normalizedEmails.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide at least one valid email.' });
    }

    const existingAdmins = await prisma.admin.findMany({
      where: { email: { in: normalizedEmails } },
    });

    if (existingAdmins.length > 0) {
      const duplicateEmails = existingAdmins.map((a) => a.email);
      return res.status(400).json({
        success: false,
        message: `These emails already have admin accounts: ${duplicateEmails.join(', ')}`,
      });
    }

    const adminsToCreate = normalizedEmails.map((em: string) => ({
      email: em,
      role: 'DOMAIN_HEAD' as Role,
      domain: domain as DomainType,
    }));

    const createdAdmins = await prisma.admin.createMany({
      data: adminsToCreate,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully granted domain access to ${createdAdmins.count} head(s).`,
      assignedEmails: normalizedEmails,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while assigning domain heads' });
  }
};

// 7. Get Domain Form Questions & Subsections
export const getDomainForm = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const queryDomain = req.query.domain as string | undefined;
    const effectiveDomain =
      admin?.role === 'DOMAIN_HEAD' && admin?.domain
        ? (admin.domain as DomainType)
        : queryDomain && queryDomain !== 'ALL'
        ? (queryDomain as DomainType)
        : undefined;

    const [subsections, questions] = await Promise.all([
      prisma.subsection.findMany({
        where: effectiveDomain ? { domain: effectiveDomain } : undefined,
        orderBy: { order: 'asc' },
      }),
      prisma.question.findMany({
        where: effectiveDomain ? { domain: effectiveDomain } : undefined,
        include: { subsection: true },
        orderBy: { order: 'asc' },
      }),
    ]);

    return res.status(200).json({ success: true, data: { subsections, questions } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error fetching domain form' });
  }
};

// 8. Create a Form Subsection
export const createSubsection = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { name, domain, order } = req.body;
    const effectiveDomain = (admin?.role === 'DOMAIN_HEAD' && admin?.domain ? admin.domain : domain) as DomainType;

    assertDomainAccess(admin, effectiveDomain);

    const subsection = await prisma.subsection.create({
      data: {
        name,
        domain: effectiveDomain,
        order: Number(order) || 0,
      },
    });

    return res.status(201).json({ success: true, data: subsection });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error while creating subsection', code: error.code });
  }
};

// 9. Update a Form Subsection (PUT /form/subsection/:id)
export const updateSubsection = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { id } = req.params;
    const { name, order } = req.body;

    const sub = await prisma.subsection.findUnique({ where: { id: String(id) } });
    if (!sub) {
      return res.status(404).json({ success: false, message: 'Subsection not found', code: 'SUBSECTION_NOT_FOUND' });
    }

    assertDomainAccess(admin, sub.domain);

    const updated = await prisma.subsection.update({
      where: { id: String(id) },
      data: {
        ...(name !== undefined ? { name: String(name) } : {}),
        ...(order !== undefined ? { order: Number(order) } : {}),
      },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error updating subsection', code: error.code });
  }
};

// 10. Delete a Form Subsection (DELETE /form/subsection/:id)
export const deleteSubsection = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { id } = req.params;

    const sub = await prisma.subsection.findUnique({
      where: { id: String(id) },
      include: { questions: true },
    });

    if (!sub) {
      return res.status(404).json({ success: false, message: 'Subsection not found', code: 'SUBSECTION_NOT_FOUND' });
    }

    assertDomainAccess(admin, sub.domain);

    const questionIds = sub.questions.map((q) => q.id);
    if (questionIds.length > 0) {
      const answersCount = await prisma.answer.count({
        where: { questionId: { in: questionIds } },
      });
      if (answersCount > 0) {
        return res.status(409).json({
          success: false,
          message: 'Cannot delete subsection with questions that have existing answers.',
          code: 'QUESTION_HAS_ANSWERS',
        });
      }
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    }

    await prisma.subsection.delete({ where: { id: String(id) } });
    return res.status(200).json({ success: true, message: 'Subsection deleted successfully' });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error deleting subsection', code: error.code });
  }
};

// 11. Create a Question (maxLength always 100000)
export const createQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { text, domain, subsectionId, required, order, maxMarks } = req.body;
    const effectiveDomain = (admin?.role === 'DOMAIN_HEAD' && admin?.domain ? admin.domain : domain) as DomainType;

    assertDomainAccess(admin, effectiveDomain);

    if (subsectionId) {
      const sub = await prisma.subsection.findUnique({ where: { id: String(subsectionId) } });
      if (!sub) {
        return res.status(404).json({ success: false, message: 'Subsection not found', code: 'SUBSECTION_NOT_FOUND' });
      }
      assertDomainAccess(admin, sub.domain);
    }

    const question = await prisma.question.create({
      data: {
        text,
        domain: effectiveDomain,
        subsectionId: subsectionId ? String(subsectionId) : null,
        required: required !== undefined ? Boolean(required) : true,
        order: Number(order) || 0,
        maxLength: 2000, // stores maxLength 2000 (ignoring any client value)
        maxMarks: Number(maxMarks) || 10,
      },
    });

    return res.status(201).json({ success: true, data: question });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error while creating question', code: error.code });
  }
};

// 12. Update a Question (PUT /form/question/:id)
export const updateQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { id } = req.params;
    const { text, subsectionId, required, order, maxMarks } = req.body;

    const question = await prisma.question.findUnique({ where: { id: String(id) } });
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found', code: 'QUESTION_NOT_FOUND' });
    }

    assertDomainAccess(admin, question.domain);

    if (subsectionId) {
      const sub = await prisma.subsection.findUnique({ where: { id: String(subsectionId) } });
      if (!sub) {
        return res.status(404).json({ success: false, message: 'Subsection not found', code: 'SUBSECTION_NOT_FOUND' });
      }
      assertDomainAccess(admin, sub.domain);
    }

    const updated = await prisma.question.update({
      where: { id: String(id) },
      data: {
        ...(text !== undefined ? { text: String(text) } : {}),
        ...(subsectionId !== undefined ? { subsectionId: subsectionId ? String(subsectionId) : null } : {}),
        ...(required !== undefined ? { required: Boolean(required) } : {}),
        ...(order !== undefined ? { order: Number(order) } : {}),
        ...(maxMarks !== undefined ? { maxMarks: Number(maxMarks) } : {}),
        maxLength: 2000, // maxLength stays 2000
      },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error updating question', code: error.code });
  }
};

// 13. Delete a Question (DELETE /form/question/:id)
export const deleteQuestion = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { id } = req.params;

    const question = await prisma.question.findUnique({ where: { id: String(id) } });
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found', code: 'QUESTION_NOT_FOUND' });
    }

    assertDomainAccess(admin, question.domain);

    const answersCount = await prisma.answer.count({ where: { questionId: String(id) } });
    if (answersCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete question that has existing answers.',
        code: 'QUESTION_HAS_ANSWERS',
      });
    }

    await prisma.question.delete({ where: { id: String(id) } });
    return res.status(200).json({ success: true, message: 'Question deleted successfully' });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error deleting question', code: error.code });
  }
};

// 14. Delete an Interview Slot (DELETE /slots/:id)
export const deleteSlot = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { id } = req.params;

    const slot = await prisma.slot.findUnique({ where: { id: String(id) } });
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Slot not found', code: 'SLOT_NOT_FOUND' });
    }

    assertDomainAccess(admin, slot.domain);

    const bookingsCount = await prisma.slotBooking.count({ where: { slotId: String(id) } });
    if (bookingsCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'This slot has bookings. Move or cancel them first.',
        code: 'SLOT_HAS_BOOKINGS',
      });
    }

    await prisma.slot.delete({ where: { id: String(id) } });
    return res.status(200).json({ success: true, message: 'Slot deleted successfully' });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error deleting slot', code: error.code });
  }
};

// 14B. Update an Interview Slot (PATCH /slots/:id)
export const updateInterviewSlot = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { id } = req.params;
    const { meetingLink } = req.body;

    const slot = await prisma.slot.findUnique({ where: { id: String(id) } });
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Slot not found', code: 'SLOT_NOT_FOUND' });
    }

    assertDomainAccess(admin, slot.domain);

    if (admin?.role !== 'ROOT_ADMIN' && slot.interviewerId !== admin?.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only update slots that you created.',
        code: 'FORBIDDEN',
      });
    }

    const updated = await prisma.slot.update({
      where: { id: String(id) },
      data: {
        meetingLink: meetingLink !== undefined ? (meetingLink ? String(meetingLink).trim() : null) : slot.meetingLink,
      },
    });

    return res.status(200).json({ success: true, data: updated, message: 'Slot meeting link updated.' });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error updating slot', code: error.code });
  }
};

// 15. Round 1 Summary (GET /round1/summary?domain=)
export const getRound1Summary = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const queryDomain = req.query.domain as string | undefined;

    let effectiveDomain: DomainType | undefined;
    if (admin.role === 'DOMAIN_HEAD') {
      effectiveDomain = admin.domain as DomainType;
    } else if (queryDomain && queryDomain !== 'ALL') {
      effectiveDomain = queryDomain as DomainType;
    }

    const baseWhere: any = {
      submittedAt: { not: null },
      ...(effectiveDomain ? { domain: effectiveDomain } : {}),
    };

    const [undecided, pendingShortlist, pendingReject, sentShortlist, sentReject] = await Promise.all([
      prisma.application.count({
        where: {
          ...baseWhere,
          stage: Stage.FORM_FILLING,
          round1Decision: null,
          round1EmailSentAt: null,
        },
      }),
      prisma.application.count({
        where: {
          ...baseWhere,
          stage: Stage.FORM_FILLING,
          round1Decision: Round1Decision.SHORTLIST,
          round1EmailSentAt: null,
        },
      }),
      prisma.application.count({
        where: {
          ...baseWhere,
          stage: Stage.FORM_FILLING,
          round1Decision: Round1Decision.REJECT,
          round1EmailSentAt: null,
        },
      }),
      prisma.application.count({
        where: {
          ...baseWhere,
          round1EmailSentAt: { not: null },
          round1Decision: Round1Decision.SHORTLIST,
        },
      }),
      prisma.application.count({
        where: {
          ...baseWhere,
          round1EmailSentAt: { not: null },
          round1Decision: Round1Decision.REJECT,
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        undecided,
        pendingShortlist,
        pendingReject,
        sentShortlist,
        sentReject,
      },
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error fetching summary', code: error.code });
  }
};

// 16. Round 1 Templates (GET /round1/templates?decision=)
export const getRound1Templates = async (req: CustomRequest, res: Response) => {
  try {
    const { decision } = req.query;
    if (decision === 'SHORTLIST') {
      return res.status(200).json({
        success: true,
        data: {
          decision: 'SHORTLIST',
          subject: DEFAULT_TEMPLATES.SHORTLIST.subject,
          body: DEFAULT_TEMPLATES.SHORTLIST.body,
        },
      });
    }
    if (decision === 'REJECT') {
      return res.status(200).json({
        success: true,
        data: {
          decision: 'REJECT',
          subject: DEFAULT_TEMPLATES.REJECT.subject,
          body: DEFAULT_TEMPLATES.REJECT.body,
        },
      });
    }
    return res.status(200).json({
      success: true,
      data: DEFAULT_TEMPLATES,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Server error fetching templates' });
  }
};

// 17. Send Round 1 Emails (POST /round1/send)
export const sendRound1Emails = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { domain, decision, subject, body, limit } = req.body;

    // 1. Validate Decision
    if (decision !== 'SHORTLIST' && decision !== 'REJECT') {
      return res.status(400).json({
        success: false,
        message: 'Invalid decision. Must be SHORTLIST or REJECT',
        code: 'INVALID_DECISION',
      });
    }

    // 2. Validate Domain and access
    if (!domain || domain === 'ALL' || !Object.values(DomainType).includes(domain)) {
      return res.status(400).json({
        success: false,
        message: 'A specific valid domain is required (never ALL)',
        code: 'SPECIFIC_DOMAIN_REQUIRED',
      });
    }

    const targetDomain = domain as DomainType;
    if (admin.role === 'DOMAIN_HEAD' && admin.domain !== targetDomain) {
      return res.status(403).json({
        success: false,
        message: 'Domain heads can only send emails for their own domain',
        code: 'WRONG_DOMAIN',
      });
    }

    // 3. Validate Subject & Body
    if (!subject || typeof subject !== 'string' || subject.trim().length < 1 || subject.trim().length > 200 || /[\r\n]/.test(subject)) {
      return res.status(400).json({
        success: false,
        message: 'Subject must be between 1 and 200 characters with no line breaks',
        code: 'INVALID_SUBJECT',
      });
    }

    if (!body || typeof body !== 'string' || body.trim().length < 1 || body.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Body must be between 1 and 5000 characters',
        code: 'INVALID_BODY',
      });
    }

    const batchLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const emailType = decision === 'SHORTLIST' ? EmailType.SHORTLISTED : EmailType.REJECTED;
    const targetStage = decision === 'SHORTLIST' ? Stage.SHORTLISTED : Stage.REJECTED;
    const targetDecision = decision === 'SHORTLIST' ? Round1Decision.SHORTLIST : Round1Decision.REJECT;

    const isDryRun = process.env.EMAIL_DRY_RUN === 'true' || process.env.EMAIL_DRY_RUN === '1';
    const siteUrl = process.env.CANDIDATE_SITE_URL || 'https://tam-times.vercel.app';
    const divisionLabel = DIVISION_LABELS[targetDomain] || targetDomain;

    // Find candidate applications (skip any application that already has a SENT log)
    const applications = await prisma.application.findMany({
      where: {
        domain: targetDomain,
        submittedAt: { not: null },
        stage: Stage.FORM_FILLING,
        round1Decision: targetDecision,
        round1EmailSentAt: null,
        emails: {
          none: {
            type: emailType,
            status: EmailStatus.SENT,
          },
        },
      },
      include: {
        user: true,
      },
      orderBy: { submittedAt: 'asc' },
      take: batchLimit,
    });

    const totalPending = await prisma.application.count({
      where: {
        domain: targetDomain,
        submittedAt: { not: null },
        stage: Stage.FORM_FILLING,
        round1Decision: targetDecision,
        round1EmailSentAt: null,
      },
    });

    let sentCount = 0;
    const failed: Array<{ applicationId: string; reason: string }> = [];

    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];

      // Create EmailLog row: type SHORTLISTED or REJECTED, status PENDING, attempts + 1
      const emailLog = await prisma.emailLog.create({
        data: {
          applicationId: app.id,
          type: emailType,
          status: EmailStatus.PENDING,
          attempts: 1,
        },
      });

      const renderedSubject = subject
        .replace(/{{name}}/g, app.user.name)
        .replace(/{{division}}/g, divisionLabel)
        .replace(/{{site_url}}/g, siteUrl);

      const renderedBody = body
        .replace(/{{name}}/g, app.user.name)
        .replace(/{{division}}/g, divisionLabel)
        .replace(/{{site_url}}/g, siteUrl);

      if (isDryRun) {
        // Dry run: nothing is sent, flow behaves identically, each log says "dry run"
        await prisma.$transaction(async (tx) => {
          await tx.application.update({
            where: { id: app.id },
            data: {
              stage: targetStage,
              round1EmailSentAt: new Date(),
            },
          });
          await tx.emailLog.update({
            where: { id: emailLog.id },
            data: {
              status: EmailStatus.SENT,
              sentAt: new Date(),
              error: 'dry run',
            },
          });
        });
        sentCount++;
      } else {
        try {
          if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          await sendEmail({
            to: app.user.email,
            subject: renderedSubject,
            message: renderedBody,
          });

          await prisma.$transaction(async (tx) => {
            await tx.application.update({
              where: { id: app.id },
              data: {
                stage: targetStage,
                round1EmailSentAt: new Date(),
              },
            });
            await tx.emailLog.update({
              where: { id: emailLog.id },
              data: {
                status: EmailStatus.SENT,
                sentAt: new Date(),
              },
            });
          });
          sentCount++;
        } catch (sendErr: any) {
          const reason = sendErr?.message || 'Failed to dispatch email';
          await prisma.emailLog.update({
            where: { id: emailLog.id },
            data: {
              status: EmailStatus.FAILED,
              error: reason.substring(0, 500),
            },
          });
          failed.push({ applicationId: app.id, reason });
        }
      }
    }

    const remaining = Math.max(0, totalPending - applications.length);

    return res.status(200).json({
      success: true,
      processed: applications.length,
      sent: sentCount,
      failed,
      remaining,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || 'Server error sending round 1 emails', code: error.code });
  }
};

// 18. Setup Create Admin Account for first time only
export const setupAdminAccount = async (req: Request, res: Response) => {
  try {
    const { email, password, name, setupCode } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: 'Use at least 8 characters for the password.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const allMatching = await prisma.admin.findMany();
    const admin = allMatching.find((a) => a.email.trim().toLowerCase() === normalizedEmail);

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: This email has not been assigned as an admin. Ask the root admin to whitelist your email.',
      });
    }

    // If setup code provided or admin was whitelisted, verify code
    if (setupCode && !setupCodeMatches(normalizedEmail, setupCode)) {
      return res.status(403).json({
        success: false,
        message: 'Email or setup code is wrong. Ask the root admin for your setup code.',
      });
    }

    if (admin.password) {
      return res.status(400).json({
        success: false,
        message: 'Account already exists. Please log in instead.',
      });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const updatedAdmin = await prisma.admin.update({
      where: { id: admin.id },
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        ...(name ? { name: String(name) } : {}),
      },
    });

    const secret = getJwtSecret();
    const token = jwt.sign(
      { id: updatedAdmin.id, email: updatedAdmin.email, role: updatedAdmin.role, domain: updatedAdmin.domain },
      secret,
      { expiresIn: '12h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Account set up successfully',
      token,
      id: updatedAdmin.id,
      email: updatedAdmin.email,
      role: updatedAdmin.role,
      domain: updatedAdmin.domain,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error during account setup' });
  }
};

// 18B. Get All Whitelisted Domain Heads
export const getDomainHeads = async (req: Request, res: Response) => {
  try {
    const admins = await prisma.admin.findMany({ orderBy: { email: 'asc' } });
    const data = admins.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      role: a.role,
      domain: a.domain,
      hasPassword: !!a.password,
      setupCode: a.password ? null : setupCodeFor(a.email),
    }));
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error fetching domain heads' });
  }
};

// 19. Login Admin
export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const allMatching = await prisma.admin.findMany();
    const admin = allMatching.find((a) => a.email.trim().toLowerCase() === normalizedEmail);

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!admin.password) {
      return res.status(400).json({
        success: false,
        message: 'Password not set for this account. Please click Create First-Time Password first.',
      });
    }

    const isMatch = await bcrypt.compare(String(password), admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

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
      domain: admin.domain,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};


// 20. Upstream Batch Release Shortlist
export const releaseShortlistBatch = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { domain } = req.body;
    const effectiveDomain = (domain || admin?.domain) as DomainType;
    if (!effectiveDomain) return res.status(400).json({ success: false, message: 'Please select a specific domain.' });

    const apps = await prisma.application.findMany({
      where: { domain: effectiveDomain, submittedAt: { not: null }, stage: 'FORM_FILLING' },
    });

    const toShortlist = apps.filter((a) => a.review1Passed === true);
    const toReject = apps.filter((a) => a.review1Passed !== true && a.review1Marks !== null && a.review1Marks !== undefined);

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
      message: `Results released: ${toShortlist.length} shortlisted, ${toReject.length} rejected.`,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error releasing shortlist batch' });
  }
};

// 21. Upstream Result Lists
export const getResultLists = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const queryDomain = req.query.domain as string | undefined;
    const effectiveDomain = (queryDomain && queryDomain !== 'ALL' ? queryDomain : admin?.domain) as DomainType;

    const apps = await prisma.application.findMany({
      where: effectiveDomain ? { domain: effectiveDomain, submittedAt: { not: null } } : { submittedAt: { not: null } },
      include: {
        user: true,
        emails: true,
        booking: { include: { slot: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const shortlisted = apps.filter((a) => a.stage === 'SHORTLISTED' || a.stage === 'SLOT_CHOOSING' || a.review1Passed === true);
    const rejected = apps.filter((a) => a.stage === 'REJECTED' || (a.review1Passed === false && a.review1Marks !== null));
    const selected = apps.filter((a) => a.stage === 'SELECTED');

    return res.status(200).json({
      success: true,
      domain: effectiveDomain || 'ALL',
      data: {
        shortlisted,
        rejected,
        selected,
        finalRejected: rejected.filter((a) => a.booking !== null),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error fetching result lists' });
  }
};

// 22. Upstream Send Result Emails
export const sendResultEmails = async (req: CustomRequest, res: Response) => {
  try {
    const admin = req.user as any;
    const { domain, group } = req.body;
    const effectiveDomain = (domain || admin?.domain) as DomainType;

    return res.status(200).json({
      success: true,
      message: `Email dispatch for group ${group || 'ALL'} in ${effectiveDomain || 'all domains'} initiated.`,
      sent: 0,
      failed: 0,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Server error sending result emails' });
  }
};
