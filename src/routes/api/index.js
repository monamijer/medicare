const router = require('express').Router();
const apiJson = require('../../middleware/apiJson');

router.use(apiJson);

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', require('./auth'));
router.use('/specialties', require('./specialties'));
router.use('/doctors', require('./doctors'));

module.exports = router;
