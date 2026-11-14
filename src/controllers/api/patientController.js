const patientService = require('../../services/patientService');
const { patientDto } = require('../../utils/serializers');

const FIELDS = ['firstName', 'lastName', 'email', 'password', 'birthDate', 'phone'];
const pick = (body) => Object.fromEntries(FIELDS.map((f) => [f, body[f] === undefined || body[f] === null ? '' : String(body[f]).trim()]));

async function list(req, res) {
  res.json({ patients: (await patientService.list()).map(patientDto) });
}

async function show(req, res) {
  res.json({ patient: patientDto(await patientService.get(req.params.id)) });
}

async function create(req, res) {
  const created = await patientService.create(pick(req.body));
  res.status(201).json({ patient: patientDto(await patientService.get(created.id)) });
}

async function update(req, res) {
  await patientService.update(req.params.id, pick(req.body));
  res.json({ patient: patientDto(await patientService.get(req.params.id)) });
}

// 200 { result: 'deleted' | 'deactivated' }; 409 while upcoming appointments exist.
async function remove(req, res) {
  const { deactivated } = await patientService.remove(req.params.id);
  res.json({ result: deactivated ? 'deactivated' : 'deleted' });
}

async function reactivate(req, res) {
  await patientService.reactivate(req.params.id);
  res.json({ patient: patientDto(await patientService.get(req.params.id)) });
}

// A patient's own profile.
async function showMe(req, res) {
  res.json({ patient: patientDto(await patientService.getByUser(req.session.user.id)) });
}

async function updateMe(req, res) {
  const own = await patientService.getByUser(req.session.user.id);
  const { user } = await patientService.update(own._id, pick(req.body));
  req.session.user.fullName = user.fullName; // keep the session in sync
  res.json({ patient: patientDto(await patientService.get(own._id)) });
}

module.exports = { list, show, create, update, remove, reactivate, showMe, updateMe };
