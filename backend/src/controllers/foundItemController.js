const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');

const FoundItem = require('../models/FoundItem');

const listFoundItems = asyncHandler(async (req, res) => {
  const { status } = req.query || {};
  const filter = {};
  if (status) filter.status = status;

  // Students can browse active found items from the whole campus.
  // For closed items, restrict to their own records.
  if (!['staff', 'admin'].includes(req.user.role)) {
    if (!filter.status) filter.status = 'active';
    if (filter.status !== 'active') filter.createdBy = req.user.id;
  }

  const foundItems = await FoundItem.find(filter)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email role');

  return sendResponse(res, { statusCode: 200, message: 'Found items fetched', data: { foundItems } });
});

const getFoundItemById = asyncHandler(async (req, res) => {
  const foundItem = await FoundItem.findById(req.params.id).populate('createdBy', 'name email role');
  if (!foundItem) {
    throw new ApiError(404, 'NOT_FOUND', 'Found item not found');
  }

  const isOwner = String(foundItem.createdBy._id) === String(req.user.id);
  const isActive = String(foundItem.status) === 'active';
  if (!isOwner && !isActive) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this found item');

  return sendResponse(res, { statusCode: 200, message: 'Found item fetched', data: { foundItem } });
});

const createFoundItem = asyncHandler(async (req, res) => {
  const { itemName, description, locationFound, date } = req.body || {};

  if (!itemName || !description || !locationFound || !date) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'itemName, description, locationFound and date are required');
  }

  const foundItem = await FoundItem.create({
    itemName: String(itemName).trim(),
    description: String(description).trim(),
    locationFound: String(locationFound).trim(),
    date: new Date(date),
    createdBy: req.user.id,
  });

  const populated = await FoundItem.findById(foundItem._id).populate('createdBy', 'name email role');
  return sendResponse(res, { statusCode: 201, message: 'Found item created', data: { foundItem: populated } });
});

const updateFoundItem = asyncHandler(async (req, res) => {
  const foundItem = await FoundItem.findById(req.params.id);
  if (!foundItem) {
    throw new ApiError(404, 'NOT_FOUND', 'Found item not found');
  }

  const isOwner = String(foundItem.createdBy) === String(req.user.id);
  if (!isOwner) throw new ApiError(403, 'FORBIDDEN', 'Only the creator can edit or close this found item');

  const { itemName, description, locationFound, date, status } = req.body || {};

  if (itemName !== undefined) foundItem.itemName = String(itemName).trim();
  if (description !== undefined) foundItem.description = String(description).trim();
  if (locationFound !== undefined) foundItem.locationFound = String(locationFound).trim();
  if (date !== undefined) foundItem.date = new Date(date);

  if (status !== undefined) {
    const next = String(status);
    if (!['active', 'closed'].includes(next)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid status value');
    }
    foundItem.status = next;
  }

  await foundItem.save();

  const populated = await FoundItem.findById(foundItem._id).populate('createdBy', 'name email role');
  return sendResponse(res, { statusCode: 200, message: 'Found item updated', data: { foundItem: populated } });
});

const deleteFoundItem = asyncHandler(async (req, res) => {
  const foundItem = await FoundItem.findById(req.params.id);
  if (!foundItem) {
    throw new ApiError(404, 'NOT_FOUND', 'Found item not found');
  }

  const isOwner = String(foundItem.createdBy) === String(req.user.id);
  if (!isOwner) throw new ApiError(403, 'FORBIDDEN', 'Only the creator can delete this found item');

  await FoundItem.deleteOne({ _id: foundItem._id });
  return sendResponse(res, { statusCode: 200, message: 'Found item deleted', data: null });
});

module.exports = {
  listFoundItems,
  getFoundItemById,
  createFoundItem,
  updateFoundItem,
  deleteFoundItem,
};

