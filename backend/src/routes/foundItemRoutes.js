const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const {
  listFoundItems,
  getFoundItemById,
  createFoundItem,
  updateFoundItem,
  deleteFoundItem,
} = require('../controllers/foundItemController');

const router = express.Router();

router.get('/', protect, listFoundItems);
router.post('/', protect, createFoundItem);
router.get('/:id', protect, getFoundItemById);
router.put('/:id', protect, updateFoundItem);
router.delete('/:id', protect, deleteFoundItem);

module.exports = router;

