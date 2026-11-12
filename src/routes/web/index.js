const router = require('express').Router();
const authRoutes = require('./auth');
const specialtyRoutes = require('./specialties');
const doctorRoutes = require('./doctors');
const { requireAuth } = require('../../middleware/auth');

router.use(authRoutes);
router.use('/specialties', specialtyRoutes);
router.use('/doctors', doctorRoutes);

router.get('/', requireAuth, (req, res) => {
  res.render('pages/home', { title: 'Accueil' });
});

module.exports = router;
