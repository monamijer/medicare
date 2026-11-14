const Appointment = require('../models/Appointment');

// What may happen to a doctor or patient that appointments can refer to?
//  refuse     -> they still have upcoming confirmed appointments (cancel those first)
//  deactivate -> only past/cancelled appointments exist: keep the record so history stays readable
//  delete     -> no appointment ever refers to them: remove for good
async function removalPlan(filter) {
  const upcoming = await Appointment.countDocuments({ ...filter, status: 'confirmed', end: { $gt: new Date() } });
  if (upcoming) return { action: 'refuse', upcoming };
  if (await Appointment.exists(filter)) return { action: 'deactivate' };
  return { action: 'delete' };
}

module.exports = { removalPlan };
