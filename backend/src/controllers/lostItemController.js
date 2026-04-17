const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');

const LostItem = require('../models/LostItem');

const listLostItems = asyncHandler(async (req, res) => {
  const { status } = req.query || {};
  const filter = {};
  if (status) filter.status = status;

  // Students can browse active lost items from the whole campus.
  // For closed items, restrict to their own records.
  if (!['staff', 'admin'].includes(req.user.role)) {
    if (!filter.status) filter.status = 'active';
    if (filter.status !== 'active') filter.createdBy = req.user.id;
  }

  const lostItems = await LostItem.find(filter)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email role');

  return sendResponse(res, { statusCode: 200, message: 'Lost items fetched', data: { lostItems } });
});

const getLostItemById = asyncHandler(async (req, res) => {
  const lostItem = await LostItem.findById(req.params.id).populate('createdBy', 'name email role');
  if (!lostItem) {
    throw new ApiError(404, 'NOT_FOUND', 'Lost item not found');
  }

  const isOwner = String(lostItem.createdBy._id) === String(req.user.id);
  const isActive = String(lostItem.status) === 'active';
  if (!isOwner && !isActive) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this lost item');

  return sendResponse(res, { statusCode: 200, message: 'Lost item fetched', data: { lostItem } });
});

const createLostItem = asyncHandler(async (req, res) => {
  const { itemName, description, locationFoundOrLastSeen, date } = req.body || {};

  if (!itemName || !description || !locationFoundOrLastSeen || !date) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'itemName, description, locationFoundOrLastSeen and date are required'
    );
  }

  const lostItem = await LostItem.create({
    itemName: String(itemName).trim(),
    description: String(description).trim(),
    locationFoundOrLastSeen: String(locationFoundOrLastSeen).trim(),
    date: new Date(date),
    createdBy: req.user.id,
  });

  const populated = await LostItem.findById(lostItem._id).populate('createdBy', 'name email role');
  return sendResponse(res, { statusCode: 201, message: 'Lost item created', data: { lostItem: populated } });
});

const updateLostItem = asyncHandler(async (req, res) => {
  const lostItem = await LostItem.findById(req.params.id);
  if (!lostItem) {
    throw new ApiError(404, 'NOT_FOUND', 'Lost item not found');
  }

  const isOwner = String(lostItem.createdBy) === String(req.user.id);
  if (!isOwner) throw new ApiError(403, 'FORBIDDEN', 'Only the creator can edit or close this lost item');

  const { itemName, description, locationFoundOrLastSeen, date, status } = req.body || {};

  if (itemName !== undefined) lostItem.itemName = String(itemName).trim();
  if (description !== undefined) lostItem.description = String(description).trim();
  if (locationFoundOrLastSeen !== undefined)
    lostItem.locationFoundOrLastSeen = String(locationFoundOrLastSeen).trim();
  if (date !== undefined) lostItem.date = new Date(date);

  // Creator can close/reopen their own report.
  if (status !== undefined) {
    const next = String(status);
    if (!['active', 'closed'].includes(next)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid status value');
    }
    lostItem.status = next;
  }

  await lostItem.save();

  const populated = await LostItem.findById(lostItem._id).populate('createdBy', 'name email role');
  return sendResponse(res, { statusCode: 200, message: 'Lost item updated', data: { lostItem: populated } });
});

const deleteLostItem = asyncHandler(async (req, res) => {
  const lostItem = await LostItem.findById(req.params.id);
  if (!lostItem) {
    throw new ApiError(404, 'NOT_FOUND', 'Lost item not found');
  }

  const isOwner = String(lostItem.createdBy) === String(req.user.id);
  if (!isOwner) throw new ApiError(403, 'FORBIDDEN', 'Only the creator can delete this lost item');

  await LostItem.deleteOne({ _id: lostItem._id });
  return sendResponse(res, { statusCode: 200, message: 'Lost item deleted', data: null });
});

module.exports = {
  listLostItems,
  getLostItemById,
  createLostItem,
  updateLostItem,
  deleteLostItem,
};

