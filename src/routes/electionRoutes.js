const { Router } = require('express');
const authCtrl    = require('../controllers/authController');
const elecCtrl    = require('../controllers/electionController');
const adminCtrl   = require('../controllers/adminController');
const { requireStudent, requireAdmin } = require('../middleware/auth');

const router = Router();

// ── Auth routes ─────────────────────────────────────────────────
router.post('/auth/register',       authCtrl.registerStudent);
router.post('/auth/login',          authCtrl.loginStudent);
router.post('/auth/admin/login',    authCtrl.loginAdmin);
router.get ('/auth/me',             requireStudent, authCtrl.getMe);

// ── Student election routes (scoped by JWT faculty) ─────────────
router.get ('/elections',           requireStudent, elecCtrl.getMyElections);
router.get ('/elections/:id',       requireStudent, elecCtrl.getElectionById);
router.post('/elections/:id/vote',  requireStudent, elecCtrl.castVote);
router.get ('/elections/:id/results', requireStudent, elecCtrl.getResults);

// ── Admin routes ────────────────────────────────────────────────
router.post('/admin/seed',                      adminCtrl.seedAdmin);
router.post('/admin/elections',                 requireAdmin, adminCtrl.createElection);
router.get ('/admin/elections',                 requireAdmin, adminCtrl.listAllElections);
router.patch('/admin/elections/:id/publish',    requireAdmin, adminCtrl.togglePublish);
router.patch('/admin/candidates/:id/approve',   requireAdmin, adminCtrl.approveCandidate);
router.get ('/admin/elections/:id/stats',       requireAdmin, adminCtrl.getElectionStats);

module.exports = router;