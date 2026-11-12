const router = require('express').Router();
const controller = require('../../controllers/specialtyController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { specialtyRules } = require('../../validators/specialty');

router.use(requireAuth, requireRole('admin'));

router.get('/', controller.index);
router.get('/new', controller.newForm);
router.post('/', specialtyRules, controller.create);
router.get('/:id/edit', controller.editForm);
router.post('/:id', specialtyRules, controller.update);
router.post('/:id/delete', controller.remove);

module.exports = router;
