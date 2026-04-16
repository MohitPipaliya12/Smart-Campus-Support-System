const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function seedStaffAdmin() {
  const email = process.env.DEFAULT_STAFF_EMAIL;
  const password = process.env.DEFAULT_STAFF_PASSWORD;

  if (!email || !password) return;

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    name: 'Campus Admin',
    email: email.toLowerCase().trim(),
    passwordHash,
    role: 'admin',
  });
}

module.exports = seedStaffAdmin;

