const mongoose = require('mongoose');

const specialtySchema = new mongoose.Schema(
  { name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 } },
  { timestamps: true }
);

// Unique ignoring case and accents: "Pédiatrie" and "pediatrie" are the same specialty.
specialtySchema.index({ name: 1 }, { unique: true, collation: { locale: 'fr', strength: 1 } });

module.exports = mongoose.model('Specialty', specialtySchema);
