const mongoose = require('mongoose');

const complaintTimelineSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['created', 'assigned', 'in_progress', 'resolved'],
      required: true,
    },
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true },
  },
  { _id: false }
);

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
      // Keep "submitted" for backward compatibility with older records.
      enum: ['created', 'assigned', 'in_progress', 'resolved', 'submitted'],
      default: 'created',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
      index: true,
    },
    timeline: { type: [complaintTimelineSchema], default: [] },
    // Campus users can support/upvote complaints they also face.
    supportsCount: { type: Number, default: 0, min: 0 },
    // Admin-assigned importance for prioritization (0 = normal).
    importanceLevel: { type: Number, default: 0, min: 0, max: 3 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true }
);

complaintSchema.index({ status: 1, category: 1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1, updatedAt: -1 });
complaintSchema.index({ title: 'text', description: 'text', location: 'text' });

module.exports = mongoose.model('Complaint', complaintSchema);

