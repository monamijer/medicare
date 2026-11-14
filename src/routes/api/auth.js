const router = require('express').Router();
const controller = require('../../controllers/api/authController');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const { loginRules } = require('../../validators/auth');
const { createRules: registerRules } = require('../../validators/patient');

router.post('/login', loginRules, validate, controller.login);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);
router.post('/register', registerRules, validate, controller.register);

module.exports = router;
