const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const Complaint = require('../models/Complaint');
const ComplaintSupport = require('../models/ComplaintSupport');

function isOwner(user, doc) {
  if (!doc || !user) return false;
  return String(doc.createdBy) === String(user.id);
}

function parseSort(query) {
  const sortBy = (query && query.sortBy ? String(query.sortBy) : 'date').toLowerCase();
  const order = (query && query.order ? String(query.order) : 'desc').toLowerCase() === 'asc' ? 1 : -1;

  if (sortBy === 'supports' || sortBy === 'support') return { sort: { supportsCount: order, createdAt: -1 } };
  if (sortBy === 'importance' || sortBy === 'priority') return { sort: { importanceLevel: order, createdAt: -1 } };
  return { sort: { createdAt: order } };
}

const listComplaints = asyncHandler(async (req, res) => {
  const { status } = req.query || {};

  const filter = {};
  if (status) filter.status = status;
  if (req.query && req.query.minSupports !== undefined && String(req.query.minSupports).length) {
    const min = Number(req.query.minSupports);
    if (Number.isNaN(min) || min < 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'minSupports must be a number >= 0');
    }
    filter.supportsCount = { $gte: min };
  }
  const { sort } = parseSort(req.query);

  const complaints = await Complaint.find(filter)
    .sort(sort)
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');

  const ids = complaints.map((c) => c._id);
  const mySupports = await ComplaintSupport.find({ complaintId: { $in: ids }, userId: req.user.id }).select(
    'complaintId'
  );
  const supportedSet = new Set(mySupports.map((s) => String(s.complaintId)));

  const out = complaints.map((c) => {
    const obj = c.toObject({ virtuals: false });
    obj.supportedByMe = supportedSet.has(String(c._id));
    return obj;
  });

  res.status(200).json({ success: true, complaints: out });
});

const getComplaintById = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id)
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');

  if (!complaint) {
    throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');
  }
  const supported = await ComplaintSupport.findOne({ complaintId: complaint._id, userId: req.user.id }).select('_id');
  const out = complaint.toObject({ virtuals: false });
  out.supportedByMe = Boolean(supported);

  res.status(200).json({ success: true, complaint: out });
});

const createComplaint = asyncHandler(async (req, res) => {
  const { title, description, category, location } = req.body || {};

  if (!title || !description || !location) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'title, description and location are required');
  }

  const complaint = await Complaint.create({
    title: String(title).trim(),
    description: String(description).trim(),
    category: category ? String(category) : undefined,
    location: String(location).trim(),
    createdBy: req.user.id,
  });

  res.status(201).json({
    success: true,
    complaint: await Complaint.findById(complaint._id).populate('createdBy', 'name email role'),
  });
});

const updateComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) {
    throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');
  }

  const { title, description, category, location, status } = req.body || {};

  if (!isOwner(req.user, complaint)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the complaint creator can edit or close this complaint');
  }

  if (title !== undefined) complaint.title = String(title).trim();
  if (description !== undefined) complaint.description = String(description).trim();
  if (category !== undefined) complaint.category = String(category);
  if (location !== undefined) complaint.location = String(location).trim();

  // "Close" allowed only for creator (resolved).
  if (status !== undefined) {
    const next = String(status);
    if (!['submitted', 'in_progress', 'resolved'].includes(next)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid status value');
    }
    complaint.status = next;
  }

  await complaint.save();

  res.status(200).json({
    success: true,
    complaint: await Complaint.findById(complaint._id)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role'),
  });
});

const setComplaintImportance = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'FORBIDDEN', 'Only admin can set complaint importance');
  }

  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  const { importanceLevel } = req.body || {};
  const n = Number(importanceLevel);
  if (!Number.isInteger(n) || n < 0 || n > 3) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'importanceLevel must be an integer between 0 and 3');
  }

  complaint.importanceLevel = n;
  await complaint.save();

  res.status(200).json({ success: true, complaint });
});

const supportComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  if (String(complaint.createdBy) === String(req.user.id)) {
    throw new ApiError(400, 'INVALID_ACTION', 'You cannot support your own complaint');
  }

  try {
    await ComplaintSupport.create({ complaintId: complaint._id, userId: req.user.id });
    await Complaint.updateOne({ _id: complaint._id }, { $inc: { supportsCount: 1 } });
  } catch (err) {
    // Duplicate key => already supported (idempotent).
    if (!(err && err.code === 11000)) throw err;
  }

  const updated = await Complaint.findById(complaint._id).populate('createdBy', 'name email role');
  res.status(200).json({ success: true, complaint: { ...updated.toObject(), supportedByMe: true } });
});

const unsupportComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  const deleted = await ComplaintSupport.deleteOne({ complaintId: complaint._id, userId: req.user.id });
  if (deleted && deleted.deletedCount) {
    await Complaint.updateOne({ _id: complaint._id, supportsCount: { $gt: 0 } }, { $inc: { supportsCount: -1 } });
  }

  const updated = await Complaint.findById(complaint._id).populate('createdBy', 'name email role');
  res.status(200).json({ success: true, complaint: { ...updated.toObject(), supportedByMe: false } });
});

const deleteComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) {
    throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');
  }

  if (!isOwner(req.user, complaint)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the complaint creator can delete this complaint');
  }

  await ComplaintSupport.deleteMany({ complaintId: complaint._id });
  await Complaint.deleteOne({ _id: complaint._id });
  res.status(200).json({ success: true, message: 'Complaint deleted' });
});

module.exports = {
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  setComplaintImportance,
  supportComplaint,
  unsupportComplaint,
  deleteComplaint,
};

