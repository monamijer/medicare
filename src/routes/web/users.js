const router = require('express').Router();
const controller = require('../../controllers/userController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { adminRules } = require('../../validators/user');

router.use(requireAuth, requireRole('admin'));

router.get('/', controller.index);
router.get('/new', controller.newForm);
router.post('/', adminRules, controller.create);
router.post('/:id/deactivate', controller.deactivate);
router.post('/:id/reactivate', controller.reactivate);

module.exports = router;
