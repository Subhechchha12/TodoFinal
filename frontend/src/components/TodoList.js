import React, { useState, useEffect } from 'react'; 
import axios from 'axios'; 
import { useSearchParams, useNavigate } from 'react-router-dom';

const TodoList = () => {
  const [todos, setTodos] = useState([]); 
  const [task, setTask] = useState(''); 
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isPremium, setIsPremium] = useState(false);
  const [dueDate, setDueDate] = useState('');

  // 1. Handle OAuth Redirect & Initial Data Fetch
  useEffect(() => {
    const initFetch = async () => {
      // Check if token is in URL (from Google redirect — legacy fallback)
      const urlToken = searchParams.get('token');
      if (urlToken) {
        localStorage.setItem('token', urlToken);
        // Bug 6 FIX: navigate to /todos, not /
        navigate('/todos', { replace: true });
        return; // Will re-run after navigate
      }

      const token = localStorage.getItem('token');
      if (!token) {
        // No token — redirect to login
        navigate('/', { replace: true });
        return;
      }

      try {
        const res = await axios.get('http://localhost:5000/api/todos', {
          headers: { 'x-auth-token': token }
        });
        setTodos(res.data.todos || res.data); 
        setIsPremium(res.data.isPremium || false);
      } catch (err) {
        console.error("Auth error or server down", err);
        // If token is invalid/expired, clear it and go to login
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/', { replace: true });
        }
      }
    };

    initFetch();
  }, [searchParams, navigate]);

  // 2. Add Todo (Now including dueDate)
  const addTodo = async () => {
    if (!task) return;
    const token = localStorage.getItem('token');
    
    try {
      const res = await axios.post('http://localhost:5000/api/todos', 
        { 
          task, 
          dueDate: isPremium ? dueDate : null // Only send date if premium
        }, 
        { headers: { 'x-auth-token': token } }
      );
      
      setTodos([res.data, ...todos]);
      setTask('');
      setDueDate(''); // Reset date field
    } catch (err) {
      alert("Session expired or Database connection issue.");
    }
  };

  // Bug 4 FIX: Toggle now persists to backend
  const toggleComplete = async (id) => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.put(`http://localhost:5000/api/todos/${id}`, {}, {
        headers: { 'x-auth-token': token }
      });
      setTodos(todos.map(todo => 
        todo._id === id ? res.data : todo
      ));
    } catch (err) {
      console.error("Toggle failed:", err);
      alert("Failed to update todo. Please try again.");
    }
  };

  // Bug 4 FIX: Delete now persists to backend
  const deleteTodo = async (id) => {
    const token = localStorage.getItem('token');
    try {
      await axios.delete(`http://localhost:5000/api/todos/${id}`, {
        headers: { 'x-auth-token': token }
      });
      setTodos(todos.filter(todo => todo._id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete todo. Please try again.");
    }
  };

  // Bug 10 FIX: Logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/', { replace: true });
  };

  const handleSubscription = async () => {
    const token = localStorage.getItem('token');

    // Guard: Razorpay SDK must be loaded from index.html
    if (!window.Razorpay) {
      alert("Razorpay SDK not loaded. Check your internet connection and reload.");
      return;
    }

    if (!token) {
      alert("You must be logged in to upgrade.");
      return;
    }

    try {
      const res = await axios.post('http://localhost:5000/api/payment/order', {}, {
        headers: { 'x-auth-token': token }
      });

      const options = {
        key: process.env.REACT_APP_RAZORPAY_KEY_ID,
        amount: res.data.amount,
        currency: res.data.currency,
        name: "TaskFlow Premium",
        description: "Test Mode Payment",
        order_id: res.data.id,
        handler: async function (response) {
          try {
            await axios.post('http://localhost:5000/api/payment/verify', {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature
            }, {
              headers: { 'x-auth-token': token }
            });
            alert("🎉 Welcome to Premium!");
            window.location.reload();
          } catch (e) {
            console.error("Verify error:", e);
            alert("Payment received but verification failed — contact support.");
          }
        },
        theme: { color: "#5d4037" }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      const msg = err?.response?.data?.msg
        || err?.response?.data
        || err?.message
        || "Unknown error";
      console.error("Payment init error:", err);
      alert(`Payment failed to initialize: ${msg}`);
    }
  };

  return (
    <div className="todo-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Daily Tasks {isPremium && <span className="premium-badge">✨</span>}</h2>
        <button 
          onClick={handleLogout} 
          style={{ 
            background: 'transparent', 
            color: '#8d6e63', 
            fontSize: '0.8rem', 
            padding: '6px 12px',
            border: '1px solid #d7ccc8'
          }}
        >
          Logout
        </button>
      </div>
      
      {/* Input Group with Date Logic */}
      <div className="input-group">
        <input 
          type="text" 
          placeholder="What needs to be done?" 
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addTodo()}
        />
        {isPremium && (
          <input 
            type="date" 
            value={dueDate} 
            onChange={(e) => setDueDate(e.target.value)} 
            className="date-input"
          />
        )}
        <button onClick={addTodo}>Add</button>
      </div>

      <div className="list-area">
        {todos.length > 0 ? (
          todos.map(item => (
            <div key={item._id} className={`todo-item ${item.completed ? 'completed' : ''}`}>
              <div className="item-left">
                <input 
                  type="checkbox" 
                  checked={item.completed} 
                  onChange={() => toggleComplete(item._id)} 
                />
                <div className="task-text-wrapper">
                  <span>{item.task}</span>
                  {item.dueDate && <small className="due-tag">📅 {item.dueDate}</small>}
                </div>
              </div>
              <button className="delete-btn" onClick={() => deleteTodo(item._id)}>✕</button>
            </div>
          ))
        ) : (
          <p style={{textAlign: 'center', opacity: 0.6}}>No tasks yet.</p>
        )}
      </div>

      {!isPremium && (
        <div className="sub-section">
          <p style={{fontSize: '0.85rem', fontWeight: '500'}}>Unlock the premium features</p>
          <button className="premium-btn" onClick={handleSubscription}>
            Upgrade to Premium
          </button>
        </div>
      )}
    </div>
  );
};

export default TodoList;