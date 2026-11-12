const router = require('express').Router();
const authRoutes = require('./auth');
const specialtyRoutes = require('./specialties');
const doctorRoutes = require('./doctors');
const patientRoutes = require('./patients');
const accountRoutes = require('./account');
const { requireAuth } = require('../../middleware/auth');

router.use(authRoutes);
router.use('/specialties', specialtyRoutes);
router.use('/doctors', doctorRoutes);
router.use('/patients', patientRoutes);
router.use(accountRoutes);

router.get('/', requireAuth, (req, res) => {
  res.render('pages/home', { title: 'Accueil' });
});

module.exports = router;
