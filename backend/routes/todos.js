const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const Todo = require('../models/Todo');
const User = require('../models/User');

// @route   GET api/todos
// @desc    Get all todos for the LOGGED-IN user only
router.get('/', auth, async (req, res) => {
  try {
    const [todos, user] = await Promise.all([
      Todo.find({ user: req.user.id }).sort({ date: -1 }),
      User.findById(req.user.id).select('isPremium')
    ]);
    res.json({ todos, isPremium: user?.isPremium || false });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// @route   POST api/todos
// @desc    Add a new todo
router.post('/', auth, async (req, res) => {
  try {
    const newTodo = new Todo({
      task: req.body.task,
      dueDate: req.body.dueDate || null,
      user: req.user.id // Tie the todo to the user ID from the token
    });

    const todo = await newTodo.save();
    res.json(todo);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;