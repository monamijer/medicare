const router = require('express').Router();
const controller = require('../../controllers/patientController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createRules, updateRules } = require('../../validators/patient');

router.use(requireAuth, requireRole('admin'));

router.get('/', controller.index);
router.get('/new', controller.newForm);
router.post('/', createRules, controller.create);
router.get('/:id', controller.show);
router.get('/:id/edit', controller.editForm);
router.post('/:id', updateRules, controller.update);
router.post('/:id/delete', controller.remove);

module.exports = router;
