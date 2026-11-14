const router = require('express').Router();
const controller = require('../../controllers/appointmentController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { bookRules, modifyRules } = require('../../validators/appointment');

router.use(requireAuth);

router.get('/', controller.index);
router.get('/day', requireRole('doctor', 'admin'), controller.day);

// Booking is for patients only.
router.get('/new', requireRole('patient'), controller.search);
router.get('/new/:doctorId', requireRole('patient'), controller.doctorSlots);
router.get('/book/:slotId', requireRole('patient'), controller.bookForm);
router.post('/', requireRole('patient'), bookRules, controller.book);

// Patients (their own) and admins (any) may move an appointment; doctors may not.
router.get('/:id/edit', requireRole('patient', 'admin'), controller.modifyForm);
router.post('/:id', requireRole('patient', 'admin'), modifyRules, controller.modify);

// Any signed-in role may cancel what it owns (admins: anything).
router.post('/:id/cancel', controller.cancel);

module.exports = router;
