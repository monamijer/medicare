const router = require('express').Router();
const controller = require('../../controllers/appointmentController');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { bookRules } = require('../../validators/appointment');

router.use(requireAuth);

router.get('/', controller.index);

// Booking is for patients only.
router.get('/new', requireRole('patient'), controller.search);
router.get('/new/:doctorId', requireRole('patient'), controller.doctorSlots);
router.get('/book/:slotId', requireRole('patient'), controller.bookForm);
router.post('/', requireRole('patient'), bookRules, controller.book);

module.exports = router;
