const router = require('express').Router();
const authRoutes = require('./auth');
const specialtyRoutes = require('./specialties');
const doctorRoutes = require('./doctors');
const patientRoutes = require('./patients');
const userRoutes = require('./users');
const accountRoutes = require('./account');
const availabilityRoutes = require('./availability');
const appointmentRoutes = require('./appointments');
const { requireAuth } = require('../../middleware/auth');

router.use(authRoutes);
router.use('/specialties', specialtyRoutes);
router.use('/doctors', doctorRoutes);
router.use('/patients', patientRoutes);
router.use('/users', userRoutes);
router.use(accountRoutes);
router.use('/availability', availabilityRoutes);
router.use('/appointments', appointmentRoutes);

router.get('/', requireAuth, (req, res) => {
  res.render('pages/home', { title: 'Accueil' });
});

module.exports = router;
