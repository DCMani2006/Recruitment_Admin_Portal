import { Router } from 'express';
import { 
  setupAdminAccount,
  loginAdmin,
  getAllApplicants, 
  getApplicantById, 
  updateApplicantReview,
  releaseShortlistBatch,
  createInterviewSlots,
  getMySchedule,
  deleteInterviewSlot,
  assignDomainHead,
  getDomainHeads,
  createSubsection, 
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getDomainForm
} from '../controllers/adminController';
import { authorizeRole, verifyToken } from '../middleware/authMiddleware';

const router = Router();

// Public Auth Routes
router.post('/setup', setupAdminAccount);
router.post('/login', loginAdmin);

// Protect all routes below with verifyToken
router.use(verifyToken);

// Domain Heads & Root Admins can view, evaluate, and batch-release candidates
router.get('/applicants', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getAllApplicants);
router.get('/applicants/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getApplicantById);
router.put('/applicants/:applicationId/review', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), updateApplicantReview);
router.post('/applicants/release-shortlist', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), releaseShortlistBatch);

// Domain Heads create, view, and delete their interview slots
router.post('/slots', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), createInterviewSlots);
router.get('/schedule/:adminId', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getMySchedule);
router.delete('/slots/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), deleteInterviewSlot);

// Domain Heads build, view, edit, and delete their domain's application form questions
router.get('/form', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), getDomainForm);
router.post('/form/subsection', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), createSubsection);
router.post('/form/question', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), createQuestion);
router.put('/form/question/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), updateQuestion);
router.delete('/form/question/:id', authorizeRole(['DOMAIN_HEAD', 'ROOT_ADMIN']), deleteQuestion);

// Only the Root Admin can view and assign Domain Heads
router.get('/domain-heads', authorizeRole(['ROOT_ADMIN']), getDomainHeads);
router.post('/domain-heads', authorizeRole(['ROOT_ADMIN']), assignDomainHead);

export default router;