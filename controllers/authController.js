const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Register a new student
const register = async (req, res) => {
  try {
    const { username, fullName, email, password } = req.body;

    // Check required fields
    if (!username || !fullName || !email || !password) {
      return res.status(400).json({
        message: 'Username, full name, email and password are required'
      });
    }

    // Basic password validation
    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [
        { username: username.trim() },
        { email: normalizedEmail }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Username or email already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      username: username.trim(),
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'student'
    });

    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Username or email already exists'
      });
    }

    return res.status(500).json({
      message: 'Server error during registration'
    });
  }
};

// Login an existing user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail
    }).select('+passwordHash');

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '1d'
      }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      message: 'Server error during login'
    });
  }
};

module.exports = {
  register,
  login
};