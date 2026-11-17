const router = require('express').Router();
const apiJson = require('../../middleware/apiJson');

router.use(apiJson);

// Who may do what, in plain words, for people who open the API address in a browser.
const RESOURCES = {
  health: { path: '/api/v1/health', access: 'public' },
  auth: { path: '/api/v1/auth/me', access: 'connexion et inscription publiques, profil : connecté' },
  specialties: { path: '/api/v1/specialties', access: 'lecture : connecté, écriture : administrateur' },
  doctors: { path: '/api/v1/doctors', access: 'lecture : connecté, écriture : administrateur' },
  patients: { path: '/api/v1/patients', access: 'administrateur (un patient utilise /api/v1/patients/me)' },
  availability: { path: '/api/v1/availability', access: 'médecin (les siennes) et administrateur' },
  appointments: { path: '/api/v1/appointments', access: 'connecté (chacun voit ses rendez-vous), réservation : patient' },
};

router.get('/', (req, res) => {
  res.json({
    name: 'MediCare API',
    version: 'v1',
    status: 'ok',
    documentation: 'docs/API.md dans le dépôt du projet',
    authentication: 'Session par cookie. POST /api/v1/auth/login, ou connectez-vous d\'abord dans l\'application web : la session est la même, et les adresses GET ci-dessous s\'ouvrent alors directement dans le navigateur.',
    resources: RESOURCES,
  });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', require('./auth'));
router.use('/specialties', require('./specialties'));
router.use('/doctors', require('./doctors'));
router.use('/patients', require('./patients'));
router.use('/availability', require('./availability'));
router.use('/appointments', require('./appointments'));

module.exports = router;
