const express = require('express');

const { protect, requireRole } = require('../middleware/authMiddleware');
const {
  listComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  setComplaintImportance,
  supportComplaint,
  unsupportComplaint,
  deleteComplaint,
} = require('../controllers/complaintController');

const router = express.Router();

router.get('/', protect, listComplaints);
router.post('/', protect, createComplaint);
router.get('/:id', protect, getComplaintById);
router.post('/:id/support', protect, supportComplaint);
router.delete('/:id/support', protect, unsupportComplaint);
router.put('/:id/importance', protect, requireRole(['admin']), setComplaintImportance);
router.put('/:id', protect, updateComplaint);
router.delete('/:id', protect, deleteComplaint);

module.exports = router;

