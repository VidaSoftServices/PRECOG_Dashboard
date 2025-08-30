// context/AuthContext.jsx
import React, { createContext, useState, useEffect } from 'react'
import axios from 'axios'

export const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [credentials, setCredentials] = useState({ userName: '', password: '' })
  const [hmacKey, setHmacKey] = useState(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState('')  // ⬅️ NEW

  const requestHmacKey = async () => {
    try {
      setIsAuthenticating(true)
      const response = await axios.post(
        'https://precog.vidasoftapi.com/api/Authentication/Request_HMAC_Key',
        credentials
      )
      setHmacKey(response.data._HMAC_Key)
      setAuthError('') // clear error on success
    } catch (error) {
      console.error('❌ Failed to fetch HMAC key:', error)
      setHmacKey(null)
      setAuthError('Username or password doesn’t match.\nIf you forgot your password, please reset it at vidasoftservices.com.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  useEffect(() => {
    if (credentials.userName && credentials.password) {
      requestHmacKey()
      const interval = setInterval(requestHmacKey, (14 * 60 * 1000) + (30 * 1000))
      return () => clearInterval(interval)
    } else {
      setHmacKey(null)
      setAuthError('')
    }
  }, [credentials])

  return (
    <AuthContext.Provider value={{
      hmacKey,
      setCredentials,
      setHmacKey,
      isAuthenticating,
      credentials,
      authError  // ⬅️ Expose authError
    }}>
      {children}
    </AuthContext.Provider>
  )
}
