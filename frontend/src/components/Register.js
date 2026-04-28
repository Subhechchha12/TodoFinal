import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const Register = () => {
  const [formData, setFormData] = useState({ name: '', username: '', password: '' });
  const [mfaState, setMfaState] = useState({ mfaRequired: false, isSetup: false, tempToken: '', qrCode: '' });
  const [mfaCode, setMfaCode] = useState('');
  const navigate = useNavigate();

  const onChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/api/auth/register', formData);
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
      alert(err.response?.data?.msg || "Registration Failed");
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

  if (mfaState.mfaRequired) {
    return (
      <div className="todo-container" style={{ marginTop: '80px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>Setup Two-Factor Auth</h2>
        
        <div style={{ marginBottom: '2rem' }}>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            Scan this QR code with your authenticator app (like Google Authenticator or Authy) to secure your account.
          </p>
          <img src={mfaState.qrCode} alt="MFA QR Code" style={{ width: '200px', border: '1px solid #ccc', padding: '10px', borderRadius: '8px' }} />
        </div>

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
            Verify & Complete Setup
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="todo-container" style={{ marginTop: '80px' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Create Account</h2>
      <form onSubmit={onSubmit}>
        <input type="text" name="name" placeholder="Full Name" onChange={onChange} required style={{width: '100%', boxSizing: 'border-box'}} />
        <input type="text" name="username" placeholder="Username" onChange={onChange} required style={{width: '100%', boxSizing: 'border-box'}} />
        <input type="password" name="password" placeholder="Password" onChange={onChange} required style={{width: '100%', boxSizing: 'border-box', marginBottom: '1.5rem'}} />
        <button type="submit" style={{ width: '100%', padding: '12px' }}>Register</button>
      </form>
      <p style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>
        Already have an account? <Link to="/" style={{color: 'var(--brown-primary)', fontWeight: 'bold'}}>Login</Link>
      </p>
    </div>
  );
};

export default Register;