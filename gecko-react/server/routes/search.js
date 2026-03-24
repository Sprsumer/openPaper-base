const express = require('express');

const { searchPapers } = require('../controllers/searchController');

const router = express.Router();

router.get('/api/search', searchPapers);

module.exports = router;
