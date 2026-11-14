const router = require('express').Router();
const controller = require('../../controllers/api/availabilityController');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { apiCreateRules, updateRules } = require('../../validators/availability');

router.use(requireAuth, requireRole('admin', 'doctor'));

router.get('/', controller.list);
router.post('/', apiCreateRules, validate, controller.create);
router.get('/:id', controller.show);
router.put('/:id', updateRules, validate, controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
