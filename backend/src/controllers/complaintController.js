const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');

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
  if (sortBy === 'updated') return { sort: { updatedAt: order } };
  return { sort: { createdAt: order } };
}

function normalizeStatus(status) {
  // Existing data used "submitted"; treat it as "created" for the new timeline flow.
  if (!status) return status;
  return String(status) === 'submitted' ? 'created' : String(status);
}

function defaultPriorityForCategory(category) {
  switch (String(category || 'other')) {
    case 'infrastructure':
      return 'high';
    case 'maintenance':
      return 'medium';
    case 'services':
      return 'medium';
    case 'other':
    default:
      return 'low';
  }
}

function maxPriority(a, b) {
  const rank = { low: 1, medium: 2, high: 3 };
  const pa = String(a || 'low');
  const pb = String(b || 'low');
  return (rank[pb] || 0) > (rank[pa] || 0) ? pb : pa;
}

const listComplaints = asyncHandler(async (req, res) => {
  const { status, category, priority, assignedTo, q } = req.query || {};

  const filter = {};
  if (status) filter.status = normalizeStatus(status);
  if (category) filter.category = String(category);
  if (priority) filter.priority = String(priority);
  if (assignedTo) filter.assignedTo = String(assignedTo);

  // Students only see their own complaints by default (campus-level visibility can be expanded later).
  if (req.user.role === 'student') {
    filter.createdBy = req.user.id;
  }

  if (q && String(q).trim().length) {
    filter.$text = { $search: String(q).trim() };
  }
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
    obj.status = normalizeStatus(obj.status);
    return obj;
  });

  return sendResponse(res, { statusCode: 200, message: 'Complaints fetched', data: { complaints: out } });
});

const getComplaintById = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id)
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');

  if (!complaint) {
    throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');
  }
  if (req.user.role === 'student' && String(complaint.createdBy) !== String(req.user.id)) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this complaint');
  }
  const supported = await ComplaintSupport.findOne({ complaintId: complaint._id, userId: req.user.id }).select('_id');
  const out = complaint.toObject({ virtuals: false });
  out.supportedByMe = Boolean(supported);
  out.status = normalizeStatus(out.status);

  return sendResponse(res, { statusCode: 200, message: 'Complaint fetched', data: { complaint: out } });
});

const createComplaint = asyncHandler(async (req, res) => {
  // Enforce role behavior: only students can submit complaints.
  if (req.user.role !== 'student') {
    throw new ApiError(403, 'FORBIDDEN', 'Only students can create complaints');
  }

  const { title, description, category, location, urgency } = req.body || {};

  if (!title || !description || !location) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'title, description and location are required');
  }

  const cat = category ? String(category) : undefined;
  const basePriority = defaultPriorityForCategory(cat || 'other');
  const urgencyPriority = urgency ? String(urgency) : null;
  const allowedUrgency = !urgencyPriority || ['low', 'medium', 'high'].includes(urgencyPriority);
  if (!allowedUrgency) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'urgency must be one of: low, medium, high');
  }
  const computedPriority = maxPriority(basePriority, urgencyPriority);

  const complaint = await Complaint.create({
    title: String(title).trim(),
    description: String(description).trim(),
    category: cat,
    location: String(location).trim(),
    priority: computedPriority,
    status: 'created',
    timeline: [{ status: 'created', at: new Date(), by: req.user.id }],
    createdBy: req.user.id,
  });

  const populated = await Complaint.findById(complaint._id).populate('createdBy', 'name email role');
  return sendResponse(res, {
    statusCode: 201,
    message: 'Complaint created',
    data: { complaint: populated },
  });
});

const updateComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) {
    throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');
  }

  const { title, description, category, location } = req.body || {};

  if (req.user.role !== 'student' || !isOwner(req.user, complaint)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the complaint creator (student) can edit complaint details');
  }

  if (title !== undefined) complaint.title = String(title).trim();
  if (description !== undefined) complaint.description = String(description).trim();
  if (category !== undefined) complaint.category = String(category);
  if (location !== undefined) complaint.location = String(location).trim();

  await complaint.save();

  const populated = await Complaint.findById(complaint._id)
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');
  return sendResponse(res, { statusCode: 200, message: 'Complaint updated', data: { complaint: populated } });
});

const setComplaintImportance = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  const { importanceLevel } = req.body || {};
  const n = Number(importanceLevel);
  if (!Number.isInteger(n) || n < 0 || n > 3) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'importanceLevel must be an integer between 0 and 3');
  }

  complaint.importanceLevel = n;
  await complaint.save();

  return sendResponse(res, { statusCode: 200, message: 'Importance updated', data: { complaint } });
});

const setComplaintPriority = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  const { priority } = req.body || {};
  const p = String(priority || '');
  if (!['low', 'medium', 'high'].includes(p)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'priority must be one of: low, medium, high');
  }

  complaint.priority = p;
  await complaint.save();

  return sendResponse(res, { statusCode: 200, message: 'Priority updated', data: { complaint } });
});

const assignComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  const { assignedTo } = req.body || {};
  const assignee = assignedTo ? String(assignedTo) : String(req.user.id);

  complaint.assignedTo = assignee;
  const nextStatus = 'assigned';
  complaint.status = nextStatus;
  complaint.timeline = [
    ...(complaint.timeline || []),
    { status: nextStatus, at: new Date(), by: req.user.id, note: 'Assigned' },
  ];
  await complaint.save();

  const populated = await Complaint.findById(complaint._id)
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');
  return sendResponse(res, { statusCode: 200, message: 'Complaint assigned', data: { complaint: populated } });
});

const updateComplaintStatus = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  const { status, note } = req.body || {};
  const next = normalizeStatus(status);
  if (!['created', 'assigned', 'in_progress', 'resolved'].includes(next)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid status value');
  }

  complaint.status = next;
  complaint.timeline = [
    ...(complaint.timeline || []),
    { status: next, at: new Date(), by: req.user.id, note: note ? String(note).trim() : undefined },
  ];
  await complaint.save();

  const populated = await Complaint.findById(complaint._id)
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role');
  return sendResponse(res, { statusCode: 200, message: 'Complaint status updated', data: { complaint: populated } });
});

const getComplaintSummary = asyncHandler(async (req, res) => {
  const scope = (req.query && req.query.scope ? String(req.query.scope) : 'auto').toLowerCase();
  const baseMatch = {};
  if (scope === 'mine' || (scope === 'auto' && req.user.role === 'student')) {
    baseMatch.createdBy = req.user.id;
  }

  const match = baseMatch;
  const counts = await Complaint.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const map = { total: 0, pending: 0, resolved: 0, byStatus: {} };
  counts.forEach((x) => {
    const st = normalizeStatus(x._id);
    map.byStatus[st] = x.count;
    map.total += x.count;
  });
  map.resolved = map.byStatus.resolved || 0;
  map.pending = map.total - map.resolved;

  return sendResponse(res, { statusCode: 200, message: 'Complaint summary fetched', data: map });
});

const getComplaintAnalytics = asyncHandler(async (req, res) => {
  const byCategory = await Complaint.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const byStatus = await Complaint.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return sendResponse(res, {
    statusCode: 200,
    message: 'Complaint analytics fetched',
    data: {
      complaintsPerCategory: byCategory.map((x) => ({ category: x._id, count: x.count })),
      complaintsPerStatus: byStatus.map((x) => ({ status: normalizeStatus(x._id), count: x.count })),
    },
  });
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
  return sendResponse(res, {
    statusCode: 200,
    message: 'Complaint supported',
    data: { complaint: { ...updated.toObject(), status: normalizeStatus(updated.status), supportedByMe: true } },
  });
});

const unsupportComplaint = asyncHandler(async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'NOT_FOUND', 'Complaint not found');

  const deleted = await ComplaintSupport.deleteOne({ complaintId: complaint._id, userId: req.user.id });
  if (deleted && deleted.deletedCount) {
    await Complaint.updateOne({ _id: complaint._id, supportsCount: { $gt: 0 } }, { $inc: { supportsCount: -1 } });
  }

  const updated = await Complaint.findById(complaint._id).populate('createdBy', 'name email role');
  return sendResponse(res, {
    statusCode: 200,
    message: 'Complaint support removed',
    data: { complaint: { ...updated.toObject(), status: normalizeStatus(updated.status), supportedByMe: false } },
  });
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
  return sendResponse(res, { statusCode: 200, message: 'Complaint deleted', data: null });
});

module.exports = {
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  setComplaintImportance,
  setComplaintPriority,
  assignComplaint,
  updateComplaintStatus,
  getComplaintSummary,
  getComplaintAnalytics,
  supportComplaint,
  unsupportComplaint,
  deleteComplaint,
};

