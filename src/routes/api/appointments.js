const router = require('express').Router();
const controller = require('../../controllers/api/appointmentController');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { bookRules, apiModifyRules } = require('../../validators/appointment');

router.use(requireAuth);

router.get('/', controller.list);
router.get('/day', requireRole('doctor', 'admin'), controller.day); // before /:id
router.post('/', requireRole('patient'), bookRules, validate, controller.book);
router.get('/:id', controller.show);
router.put('/:id', requireRole('patient', 'admin'), apiModifyRules, validate, controller.modify);
router.post('/:id/cancel', controller.cancel);

module.exports = router;
