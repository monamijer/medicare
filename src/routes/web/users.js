const router = require('express').Router();
const controller = require('../../controllers/userController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createRules, updateRules } = require('../../validators/user');

router.use(requireAuth, requireRole('admin'));

router.get('/', controller.index);
router.get('/new', controller.newForm);
router.post('/', createRules, controller.create);
router.get('/:id/edit', controller.editForm);
router.post('/:id', updateRules, controller.update);
router.post('/:id/deactivate', controller.deactivate);
router.post('/:id/reactivate', controller.reactivate);

module.exports = router;
