const mongoose = require('mongoose');

// Identity (name, email, password) lives on the linked User; the Patient holds clinic data.
const patientSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    birthDate: { type: Date, required: true },
    phone: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);
