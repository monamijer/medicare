const router = require('express').Router();
const controller = require('../../controllers/api/patientController');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createRules, updateRules } = require('../../validators/patient');

router.use(requireAuth);

// A patient's own profile. Declared before /:id so "me" is not read as an id.
router.get('/me', requireRole('patient'), controller.showMe);
router.put('/me', requireRole('patient'), updateRules, validate, controller.updateMe);

router.use(requireRole('admin'));
router.get('/', controller.list);
router.get('/:id', controller.show);
router.post('/', createRules, validate, controller.create);
router.put('/:id', updateRules, validate, controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/reactivate', controller.reactivate);

module.exports = router;
