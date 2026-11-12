const router = require('express').Router();
const controller = require('../../controllers/accountController');
const { redirectIfAuthenticated, requireAuth, requireRole } = require('../../middleware/auth');
const { createRules, updateRules } = require('../../validators/patient');

router.get('/register', redirectIfAuthenticated, controller.showRegister);
router.post('/register', redirectIfAuthenticated, createRules, controller.register);

router.get('/profile', requireAuth, requireRole('patient'), controller.showProfile);
router.post('/profile', requireAuth, requireRole('patient'), updateRules, controller.updateProfile);

module.exports = router;
