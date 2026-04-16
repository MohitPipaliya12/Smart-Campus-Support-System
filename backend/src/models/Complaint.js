const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['maintenance', 'infrastructure', 'services', 'other'],
      default: 'other',
    },
    location: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['submitted', 'in_progress', 'resolved'],
      default: 'submitted',
    },
    // Campus users can support/upvote complaints they also face.
    supportsCount: { type: Number, default: 0, min: 0 },
    // Admin-assigned importance for prioritization (0 = normal).
    importanceLevel: { type: Number, default: 0, min: 0, max: 3 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);

