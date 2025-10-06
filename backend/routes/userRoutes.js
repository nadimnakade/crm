const express = require('express');
const router = express.Router();
const { getUsers, getUserById, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

// User routes
router.route('/')
  .get(protect, getUsers)
  .post(protect, authorize('admin'), createUser);

router.route('/:id')
  .get(protect, getUserById)
  .put(protect, authorize('admin'), updateUser)
  .delete(protect, authorize('admin'), deleteUser);

module.exports = router;