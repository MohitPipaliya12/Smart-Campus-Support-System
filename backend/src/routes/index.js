const express = require('express');

const authRoutes = require('./authRoutes');
const complaintRoutes = require('./complaintRoutes');
const lostItemRoutes = require('./lostItemRoutes');
const foundItemRoutes = require('./foundItemRoutes');
const claimRoutes = require('./claimRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/complaints', complaintRoutes);
router.use('/lost-items', lostItemRoutes);
router.use('/found-items', foundItemRoutes);
router.use('/claims', claimRoutes);

module.exports = router;

