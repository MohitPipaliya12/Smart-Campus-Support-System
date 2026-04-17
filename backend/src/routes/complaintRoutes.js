const express = require('express');

const { protect, requireRole } = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/complaintController');

const router = express.Router();

router.get('/', protect, listComplaints);
router.get('/summary', protect, getComplaintSummary);
router.get('/analytics', protect, requireRole(['admin']), getComplaintAnalytics);
router.post('/', protect, createComplaint);
router.get('/:id', protect, getComplaintById);
router.post('/:id/support', protect, supportComplaint);
router.delete('/:id/support', protect, unsupportComplaint);
router.put('/:id/importance', protect, requireRole(['admin']), setComplaintImportance);
router.put('/:id/priority', protect, requireRole(['admin']), setComplaintPriority);
router.put('/:id/assign', protect, requireRole(['admin', 'staff']), assignComplaint);
router.put('/:id/status', protect, requireRole(['admin', 'staff']), updateComplaintStatus);
router.put('/:id', protect, updateComplaint);
router.delete('/:id', protect, deleteComplaint);

module.exports = router;

