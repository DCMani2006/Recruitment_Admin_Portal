import { Router } from 'express';
import {
  setupAdminAccount,
  loginAdmin,
  getAllApplicants,
  getApplicantById,
  updateApplicantReview,
  createInterviewSlots,
  updateInterviewSlot,
  deleteSlot,
  getMySchedule,
  getDomainHeads,
  assignDomainHead,
  createSubsection,
  updateSubsection,
  deleteSubsection,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getDomainForm,
  getRound1Summary,
  getRound1Templates,
  sendRound1Emails,
} from '../controllers/adminController';
import { authorizeRole, limitLoginAttempts, verifyToken } from '../middleware/authMiddleware';

const router = Router();
router.post('/setup', limitLoginAttempts, setupAdminAccount);
router.post('/login', limitLoginAttempts, loginAdmin);

router.use(verifyToken);

// Domain Heads & Root Admins can view and evaluate candidates
router.get('/applicants', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getAllApplicants);
router.get('/applicants/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getApplicantById);
router.put('/applicants/:applicationId/review', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), updateApplicantReview);

// Domain Heads create their slots, update slots, delete slots, and view their schedules
router.post('/slots', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), createInterviewSlots);
router.patch('/slots/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), updateInterviewSlot);
router.delete('/slots/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), deleteSlot);
router.get('/schedule/:adminId', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getMySchedule);

// Domain Heads build and view their domain's application form
router.get('/form', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getDomainForm);
router.post('/form/subsection', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), createSubsection);
router.put('/form/subsection/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), updateSubsection);
router.delete('/form/subsection/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), deleteSubsection);

router.post('/form/question', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), createQuestion);
router.put('/form/question/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), updateQuestion);
router.delete('/form/question/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), deleteQuestion);

// Round 1 Decisions & Email Workflow
router.get('/round1/summary', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getRound1Summary);
router.get('/round1/templates', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getRound1Templates);
router.post('/round1/send', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), sendRound1Emails);

// Only the Root Admin can view and assign Domain Heads
router.get('/domain-heads', authorizeRole(['ROOT_ADMIN']), getDomainHeads);
router.post('/domain-heads', authorizeRole(['ROOT_ADMIN']), assignDomainHead);

export default router;
