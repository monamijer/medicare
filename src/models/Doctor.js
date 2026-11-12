const mongoose = require('mongoose');

// Identity (name, email, password) lives on the linked User; the Doctor holds clinic data.
const doctorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    specialty: { type: mongoose.Schema.Types.ObjectId, ref: 'Specialty', required: true, index: true },
    licenseNumber: { type: String, required: true, trim: true, unique: true },
    phone: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Doctor', doctorSchema);
