const mongoose = require('mongoose');

// start/end are copied from the slot at booking time. A booked slot can no longer be edited
// or deleted, so the copy cannot drift, and lists/history need no join.
const appointmentSchema = new mongoose.Schema(
  {
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'AvailabilitySlot', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true }
);

// A slot has at most one CONFIRMED appointment (cancelled ones stay as history).
appointmentSchema.index({ slot: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } });
appointmentSchema.index({ doctor: 1, start: 1 });
appointmentSchema.index({ patient: 1, start: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
