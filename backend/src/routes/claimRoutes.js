const express = require('express');

const { protect } = require('../middleware/authMiddleware');
const {
  listClaims,
  getClaimById,
  createClaim,
  updateClaim,
  deleteClaim,
} = require('../controllers/claimController');

const router = express.Router();

router.get('/', protect, listClaims);
router.post('/', protect, createClaim);
router.get('/:id', protect, getClaimById);
router.put('/:id', protect, updateClaim);
router.delete('/:id', protect, deleteClaim);

module.exports = router;

