import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios'; 

const Login = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [mfaState, setMfaState] = useState({ mfaRequired: false, isSetup: false, tempToken: '', qrCode: '' });
  const [mfaCode, setMfaCode] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Handle Google OAuth MFA redirect — pick up params from URL
  useEffect(() => {
    const mfaRequired = searchParams.get('mfaRequired');
    if (mfaRequired === 'true') {
      setMfaState({
        mfaRequired: true,
        isSetup: searchParams.get('isSetup') === 'true',
        tempToken: searchParams.get('tempToken') || '',
        qrCode: searchParams.get('qrCode') || ''
      });
      // Clean the URL without triggering navigation
      window.history.replaceState({}, '', '/');
    }

    // If user already has a valid token, redirect to todos
    const existingToken = localStorage.getItem('token');
    if (existingToken && mfaRequired !== 'true') {
      navigate('/todos', { replace: true });
    }
  }, [searchParams, navigate]);

  const onChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/api/auth/login', formData);
      if (res.data.mfaRequired) {
        setMfaState({
          mfaRequired: true,
          isSetup: res.data.isSetup,
          tempToken: res.data.tempToken,
          qrCode: res.data.qrCode
        });
      } else {
        localStorage.setItem('token', res.data.token); 
        navigate('/todos');
      }
    } catch (err) {
      alert(err.response?.data?.msg || "Login Failed");
    }
  };

  const onMfaSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/api/auth/mfa/verify', {
        tempToken: mfaState.tempToken,
        mfaCode: mfaCode
      });
      localStorage.setItem('token', res.data.token);
      navigate('/todos');
    } catch (err) {
      alert(err.response?.data?.msg || "MFA Verification Failed");
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:5000/api/auth/google';
  };

  if (mfaState.mfaRequired) {
    return (
      <div className="todo-container" style={{ marginTop: '100px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>Two-Factor Authentication</h2>
        
        {mfaState.isSetup && mfaState.qrCode && (
          <div style={{ marginBottom: '2rem' }}>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              Scan this QR code with your authenticator app (like Google Authenticator or Authy) to set up MFA.
            </p>
            <img src={mfaState.qrCode} alt="MFA QR Code" style={{ width: '200px', border: '1px solid #ccc', padding: '10px', borderRadius: '8px' }} />
          </div>
        )}

        {!mfaState.isSetup && (
          <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Enter the 6-digit code from your authenticator app.
          </p>
        )}

        {mfaState.isSetup && !mfaState.qrCode && (
          <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Open your authenticator app and enter the 6-digit code to complete setup.
          </p>
        )}

        <form onSubmit={onMfaSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <input
              type="text"
              placeholder="000000"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              required
              maxLength="6"
              style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', fontSize: '1.5rem', letterSpacing: '4px' }}
            />
          </div>
          <button type="submit" style={{ width: '100%', padding: '12px' }}>
            Verify & Sign In
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="todo-container" style={{ marginTop: '100px' }}>
      <h2 style={{ marginBottom: '2rem', textAlign: 'center' }}>Welcome Back</h2>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={onChange}
            required
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={onChange}
            required
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '12px' }}>
          Sign In
        </button>
      </form>

      <div style={{ margin: '20px 0', textAlign: 'center', borderTop: '1px solid #e8e8cc', paddingTop: '20px' }}>
        <button 
          onClick={handleGoogleLogin} 
          style={{ 
            background: 'white', 
            color: '#5d4037', 
            border: '1px solid #5d4037',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            padding: '10px',
            cursor: 'pointer'
          }}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="G"/>
          Sign in with Google
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem', opacity: 0.7 }}>
        Don't have an account? <Link to="/register" style={{ color: 'var(--brown-primary)', fontWeight: 'bold' }}>Register</Link>
      </p>
    </div>
  );
};

export default Login;