const router = require('express').Router();
const authRoutes = require('./auth');
const { requireAuth } = require('../../middleware/auth');

router.use(authRoutes);

router.get('/', requireAuth, (req, res) => {
  res.render('pages/home', { title: 'Accueil' });
});

module.exports = router;
