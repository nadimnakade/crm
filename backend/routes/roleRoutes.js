const express = require('express');
const router = express.Router();
const { getRoles, getRoleById, createRole, updateRole, deleteRole, getPermissions } = require('../controllers/roleController');
const { protect, authorize } = require('../middleware/auth');

// Role routes
router.route('/')
  .get(protect, getRoles)
  .post(protect, authorize('admin'), createRole);

// Permissions list
router.get('/permissions', protect, getPermissions);

router.route('/:id')
  .get(protect, getRoleById)
  .put(protect, authorize('admin'), updateRole)
  .delete(protect, authorize('admin'), deleteRole);

module.exports = router;