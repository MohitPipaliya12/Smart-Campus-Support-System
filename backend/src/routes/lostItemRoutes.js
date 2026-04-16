const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const {
  listLostItems,
  getLostItemById,
  createLostItem,
  updateLostItem,
  deleteLostItem,
} = require('../controllers/lostItemController');

const router = express.Router();

router.get('/', protect, listLostItems);
router.post('/', protect, createLostItem);
router.get('/:id', protect, getLostItemById);
router.put('/:id', protect, updateLostItem);
router.delete('/:id', protect, deleteLostItem);

module.exports = router;

