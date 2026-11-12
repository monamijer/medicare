const router = require('express').Router();
const controller = require('../../controllers/authController');
const { redirectIfAuthenticated } = require('../../middleware/auth');
const { loginRules } = require('../../validators/auth');

router.get('/login', redirectIfAuthenticated, controller.showLogin);
router.post('/login', redirectIfAuthenticated, loginRules, controller.login);
router.post('/logout', controller.logout);

module.exports = router;
