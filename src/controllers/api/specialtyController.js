const specialtyService = require('../../services/specialtyService');
const { specialtyDto } = require('../../utils/serializers');

async function list(req, res) {
  res.json({ specialties: (await specialtyService.list()).map(specialtyDto) });
}

async function show(req, res) {
  res.json({ specialty: specialtyDto(await specialtyService.get(req.params.id)) });
}

async function create(req, res) {
  const specialty = await specialtyService.create({ name: req.body.name });
  res.status(201).json({ specialty: specialtyDto(specialty) });
}

async function update(req, res) {
  const specialty = await specialtyService.update(req.params.id, { name: req.body.name });
  res.json({ specialty: specialtyDto(specialty) });
}

async function remove(req, res) {
  await specialtyService.remove(req.params.id);
  res.status(204).end();
}

module.exports = { list, show, create, update, remove };
