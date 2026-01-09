const express = require('express');
const router = express.Router();
const { getAvailability, searchMedicines } = require('../controllers/medicineController');

// GET /api/medicine/availability?name=Paracetamol
router.get('/availability', getAvailability);
router.get('/search', searchMedicines);

module.exports = router;
