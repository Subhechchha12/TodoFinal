const mongoose = require('mongoose');
const TodoSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'users' }, // Critical for isolation!
  task: { type: String, required: true },
  completed: { type: Boolean, default: false },
  dueDate: { type: String, default: null }, // Premium feature: due date
  date: { type: Date, default: Date.now }
});
module.exports = mongoose.model('todo', TodoSchema);