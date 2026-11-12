const { body } = require('express-validator');

const DURATIONS = ['0', '15', '20', '30', '45', '60'];

const dateRule = body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Saisissez une date valide.');
const fromRule = body('from').matches(/^\d{2}:\d{2}$/).withMessage("Saisissez l'heure de début.");
const toRule = body('to').matches(/^\d{2}:\d{2}$/).withMessage("Saisissez l'heure de fin.");

const createRules = [
  dateRule, fromRule, toRule,
  body('duration').isIn(DURATIONS).withMessage('Choisissez une durée de créneau.'),
];
const updateRules = [dateRule, fromRule, toRule];

module.exports = { createRules, updateRules, DURATIONS };
