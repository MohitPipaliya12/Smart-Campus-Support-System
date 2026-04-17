const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const User = require('../models/User');
const LostItem = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');
const Complaint = require('../models/Complaint');
const Claim = require('../models/Claim');
const ComplaintSupport = require('../models/ComplaintSupport');

function toPublicUser(userDoc) {
  if (!userDoc) return null;
  return {
    id: userDoc._id,
    name: userDoc.name,
    email: userDoc.email,
    role: userDoc.role,
    phone: userDoc.phone,
    department: userDoc.department,
    year: userDoc.year,
    hostel: userDoc.hostel,
    bio: userDoc.bio,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt,
  };
}

const signup = asyncHandler(async (req, res) => {
  const { name, email, password, phone, department, year, hostel, bio } = req.body || {};

  if (!name || !email || !password) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'name, email and password are required');
  }
  if (String(password).length < 6) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Password must be at least 6 characters');
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new ApiError(400, 'EMAIL_ALREADY_EXISTS', 'User with this email already exists');
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'student',
    phone: phone ? String(phone).trim() : undefined,
    department: department ? String(department).trim() : undefined,
    year: year !== undefined && year !== null && String(year).length ? Number(year) : undefined,
    hostel: hostel ? String(hostel).trim() : undefined,
    bio: bio ? String(bio).trim() : undefined,
  });

  const token = jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      subject: String(user._id),
    }
  );

  return sendResponse(res, {
    statusCode: 201,
    message: 'Signup successful',
    data: { token, user: toPublicUser(user) },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'email and password are required');
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const ok = await user.verifyPassword(String(password));
  if (!ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const token = jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      subject: String(user._id),
    }
  );

  return sendResponse(res, {
    statusCode: 200,
    message: 'Login successful',
    data: { token, user: toPublicUser(user) },
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-passwordHash');
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const [lostCount, foundCount, complaintsCount, supportsGivenCount, claimsCount] = await Promise.all([
    LostItem.countDocuments({ createdBy: req.user.id }),
    FoundItem.countDocuments({ createdBy: req.user.id }),
    Complaint.countDocuments({ createdBy: req.user.id }),
    ComplaintSupport.countDocuments({ userId: req.user.id }),
    Claim.countDocuments({ claimedBy: req.user.id }),
  ]);

  return sendResponse(res, {
    statusCode: 200,
    message: 'Profile fetched',
    data: {
      user: toPublicUser(user),
      activity: {
        lostItemsReported: lostCount,
        foundItemsPosted: foundCount,
        complaintsRaised: complaintsCount,
        supportsGiven: supportsGivenCount,
        claimsSubmitted: claimsCount,
      },
    },
  });
});

module.exports = { signup, login, me };

