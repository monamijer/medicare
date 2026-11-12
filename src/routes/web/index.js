const router = require('express').Router();
const authRoutes = require('./auth');

router.use(authRoutes);

router.get('/', (req, res) => {
  res.render('pages/home', { title: 'Accueil' });
});

module.exports = router;
