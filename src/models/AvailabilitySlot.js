const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: { type: String, enum: ['free', 'booked'], default: 'free' },
  },
  { timestamps: true }
);

// A doctor cannot have two slots starting at the same instant (backstop for the overlap check).
slotSchema.index({ doctor: 1, start: 1 }, { unique: true });

module.exports = mongoose.model('AvailabilitySlot', slotSchema);
