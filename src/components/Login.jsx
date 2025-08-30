// components/Login.jsx
import React, { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';

const Login = () => {
  const { setCredentials, isAuthenticating, authError } = useContext(AuthContext);
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setCredentials({ userName, password });
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="login-input-group">
        <input
          type="text"
          placeholder="Username"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className="login-input"
          disabled={isAuthenticating}
        />
      </div>
      <div className="login-input-group">
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
          disabled={isAuthenticating}
        />
      </div>
      <button
        type="submit"
        disabled={isAuthenticating}
        className="login-btn"
      >
        {isAuthenticating ? 'Authenticating…' : 'Login'}
      </button>
      {authError && (
        <p className="login-error">
          {authError}
        </p>
      )}
    </form>
  );
};

export default Login;
