const router = require('express').Router();
const controller = require('../../controllers/availabilityController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createRules, updateRules } = require('../../validators/availability');

router.use(requireAuth, requireRole('admin', 'doctor'));

router.get('/', controller.index);
router.get('/new', controller.newForm);
router.post('/', createRules, controller.create);
router.get('/:id/edit', controller.editForm);
router.post('/:id', updateRules, controller.update);
router.post('/:id/delete', controller.remove);

module.exports = router;
