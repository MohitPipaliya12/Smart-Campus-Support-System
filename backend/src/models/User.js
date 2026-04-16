const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Optional profile fields collected during signup/profile.
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    year: { type: Number, min: 1, max: 8 },
    hostel: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 280 },
    role: {
      type: String,
      enum: ['student', 'staff', 'admin'],
      default: 'student',
      required: true,
    },
  },
  { timestamps: true }
);

userSchema.methods.verifyPassword = async function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);

