const router = require('express').Router();
const controller = require('../../controllers/api/doctorController');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createRules, updateRules } = require('../../validators/doctor');

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', controller.show);
router.get('/:id/slots', controller.slots);
router.post('/', requireRole('admin'), createRules, validate, controller.create);
router.put('/:id', requireRole('admin'), updateRules, validate, controller.update);
router.delete('/:id', requireRole('admin'), controller.remove);
router.post('/:id/reactivate', requireRole('admin'), controller.reactivate);

module.exports = router;
