const router = require('express').Router();
const controller = require('../../controllers/api/specialtyController');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { specialtyRules } = require('../../validators/specialty');

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:id', controller.show);
router.post('/', requireRole('admin'), specialtyRules, validate, controller.create);
router.put('/:id', requireRole('admin'), specialtyRules, validate, controller.update);
router.delete('/:id', requireRole('admin'), controller.remove);

module.exports = router;
