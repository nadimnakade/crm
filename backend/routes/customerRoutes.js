const express = require('express');
const router = express.Router();
const { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer, uploadCustomerFiles, getCustomerFiles, deleteCustomerFile } = require('../controllers/customerController');
const { protect } = require('../middleware/auth');
const customerUpload = require('../utils/customerFileUpload');

// Customer routes
router.route('/')
  .get(protect, getCustomers)
  .post(protect, createCustomer);

router.route('/:id')
  .get(protect, getCustomerById)
  .put(protect, updateCustomer)
  .delete(protect, deleteCustomer);

// Customer attachments
router.post('/:id/files', protect, customerUpload.array('files', 10), uploadCustomerFiles);
router.get('/:id/files', protect, getCustomerFiles);
router.delete('/:id/files/:filename', protect, deleteCustomerFile);

module.exports = router;