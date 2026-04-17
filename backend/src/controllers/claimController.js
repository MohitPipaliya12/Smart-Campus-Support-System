const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');

const Claim = require('../models/Claim');
const LostItem = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');

function isStaffOrAdmin(role) {
  return ['staff', 'admin'].includes(role);
}

const listClaims = asyncHandler(async (req, res) => {
  const { claimStatus, type } = req.query || {};

  const filter = {};
  if (claimStatus) filter.claimStatus = claimStatus;
  if (type) filter.type = type;

  if (!isStaffOrAdmin(req.user.role)) {
    filter.claimedBy = req.user.id;
  }

  const claims = await Claim.find(filter)
    .sort({ createdAt: -1 })
    .populate('claimedBy', 'name email role')
    .populate('lostItemId')
    .populate('foundItemId');

  return sendResponse(res, { statusCode: 200, message: 'Claims fetched', data: { claims } });
});

const getClaimById = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id)
    .populate('claimedBy', 'name email role')
    .populate('lostItemId')
    .populate('foundItemId');

  if (!claim) throw new ApiError(404, 'NOT_FOUND', 'Claim not found');

  const allowed = isStaffOrAdmin(req.user.role) || String(claim.claimedBy._id) === String(req.user.id);
  if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this claim');

  return sendResponse(res, { statusCode: 200, message: 'Claim fetched', data: { claim } });
});

const createClaim = asyncHandler(async (req, res) => {
  const { type, lostItemId, foundItemId, message } = req.body || {};

  if (!type || !message) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'type and message are required');
  }
  if (!['lost', 'found'].includes(type)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'type must be either "lost" or "found"');
  }

  const hasLostId = Boolean(lostItemId);
  const hasFoundId = Boolean(foundItemId);
  if (hasLostId && hasFoundId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide either lostItemId or foundItemId, not both');
  }

  if (type === 'lost' && !lostItemId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'lostItemId is required for type="lost"');
  }
  if (type === 'found' && !foundItemId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'foundItemId is required for type="found"');
  }

  // Ensure the item exists and is still active
  if (type === 'lost') {
    const item = await LostItem.findById(lostItemId);
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Lost item not found');
    if (item.status !== 'active') throw new ApiError(400, 'ITEM_NOT_ACTIVE', 'Lost item is not active');
    if (String(item.createdBy) === String(req.user.id)) {
      throw new ApiError(400, 'SELF_CLAIM_NOT_ALLOWED', 'You cannot claim your own lost item report');
    }
  }
  if (type === 'found') {
    const item = await FoundItem.findById(foundItemId);
    if (!item) throw new ApiError(404, 'NOT_FOUND', 'Found item not found');
    if (item.status !== 'active') throw new ApiError(400, 'ITEM_NOT_ACTIVE', 'Found item is not active');
    if (String(item.createdBy) === String(req.user.id)) {
      throw new ApiError(400, 'SELF_CLAIM_NOT_ALLOWED', 'You cannot claim your own found item post');
    }
  }

  // Prevent duplicates for same user & item
  const duplicateFilter = {
    claimedBy: req.user.id,
    type,
    ...(type === 'lost' ? { lostItemId } : { foundItemId }),
  };
  const existing = await Claim.findOne(duplicateFilter);
  if (existing) throw new ApiError(400, 'DUPLICATE_CLAIM', 'You already submitted a claim for this item');

  const claim = await Claim.create({
    type,
    lostItemId: type === 'lost' ? lostItemId : undefined,
    foundItemId: type === 'found' ? foundItemId : undefined,
    claimedBy: req.user.id,
    message: String(message).trim(),
    claimStatus: 'pending',
  });

  const populated = await Claim.findById(claim._id)
    .populate('claimedBy', 'name email role')
    .populate('lostItemId')
    .populate('foundItemId');
  return sendResponse(res, { statusCode: 201, message: 'Claim created', data: { claim: populated } });
});

const updateClaim = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim) throw new ApiError(404, 'NOT_FOUND', 'Claim not found');

  const isOwner = String(claim.claimedBy) === String(req.user.id);
  const isStaff = isStaffOrAdmin(req.user.role);
  if (!isOwner && !isStaff) throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this claim');

  const { message, claimStatus } = req.body || {};

  if (claimStatus !== undefined) {
    if (!isStaff) {
      throw new ApiError(403, 'FORBIDDEN', 'Only staff/admin can change claim status');
    }
    claim.claimStatus = String(claimStatus);
    claim.reviewedBy = req.user.id;

    // Close the item when claim is approved/resolved
    if (['approved', 'resolved'].includes(String(claimStatus))) {
      if (claim.type === 'lost' && claim.lostItemId) {
        await LostItem.updateOne({ _id: claim.lostItemId }, { status: 'closed' });
      }
      if (claim.type === 'found' && claim.foundItemId) {
        await FoundItem.updateOne({ _id: claim.foundItemId }, { status: 'closed' });
      }
    }
  }

  if (message !== undefined) {
    // Only the claim creator can edit their message (and only while pending).
    if (!isOwner) throw new ApiError(403, 'FORBIDDEN', 'Only the claim creator can edit this claim');
    if (claim.claimStatus !== 'pending') {
      throw new ApiError(403, 'FORBIDDEN', 'You can only edit claim message while status is pending');
    }
    claim.message = String(message).trim();
  }

  await claim.save();

  const populated = await Claim.findById(claim._id)
    .populate('claimedBy', 'name email role')
    .populate('lostItemId')
    .populate('foundItemId');
  return sendResponse(res, { statusCode: 200, message: 'Claim updated', data: { claim: populated } });
});

const deleteClaim = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim) throw new ApiError(404, 'NOT_FOUND', 'Claim not found');

  const isOwner = String(claim.claimedBy) === String(req.user.id);
  if (!isOwner) throw new ApiError(403, 'FORBIDDEN', 'Only the claim creator can delete this claim');

  if (claim.claimStatus !== 'pending') {
    throw new ApiError(403, 'FORBIDDEN', 'You can only delete your claim while it is pending');
  }

  await Claim.deleteOne({ _id: claim._id });
  return sendResponse(res, { statusCode: 200, message: 'Claim deleted', data: null });
});

module.exports = {
  listClaims,
  getClaimById,
  createClaim,
  updateClaim,
  deleteClaim,
};

