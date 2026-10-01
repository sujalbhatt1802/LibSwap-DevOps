const express = require('express');
const { register, login } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, (req, res) => {
  res.status(200).json({
    message: 'Authenticated successfully',
    user: req.user
  });
});

module.exports = router;