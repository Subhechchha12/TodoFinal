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

// @route   PUT api/todos/:id
// @desc    Toggle todo completed status
router.put('/:id', auth, async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ msg: 'Todo not found' });

    // Ensure the user owns this todo
    if (todo.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    todo.completed = !todo.completed;
    await todo.save();
    res.json(todo);
  } catch (err) {
    console.error('Toggle Error:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/todos/:id
// @desc    Delete a todo
router.delete('/:id', auth, async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.id);
    if (!todo) return res.status(404).json({ msg: 'Todo not found' });

    // Ensure the user owns this todo
    if (todo.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await Todo.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Todo removed' });
  } catch (err) {
    console.error('Delete Error:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;