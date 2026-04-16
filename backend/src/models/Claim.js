const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['lost', 'found'],
      required: true,
    },
    lostItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'LostItem' },
    foundItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoundItem' },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, trim: true },
    claimStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'resolved'],
      default: 'pending',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Claim', claimSchema);

