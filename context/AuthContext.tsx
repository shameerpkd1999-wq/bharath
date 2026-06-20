'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { 
  User as FirebaseUser, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, setDoc } from 'firebase/firestore'

interface AuthContextType {
  user: FirebaseUser | null
  loading: boolean
  signUp: (email: string, password: string, name: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, name: string) => {
    setLoading(true)
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const newUser = userCredential.user
      
      // Update the display name profile metadata
      await updateProfile(newUser, { displayName: name })
      
      // Persist the user profile document in Firestore
      try {
        await setDoc(doc(db, 'users', newUser.uid), {
          uid: newUser.uid,
          name: name,
          email: email,
          createdAt: new Date().toISOString(),
        })
      } catch (dbErr) {
        console.warn('⚠️ Could not save user profile to Firestore (database might be disabled/uninitialized):', dbErr)
      }
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogle = async () => {
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const userCredential = await signInWithPopup(auth, provider)
      const googleUser = userCredential.user
      
      // Save or merge user profile document on initial login
      try {
        await setDoc(doc(db, 'users', googleUser.uid), {
          uid: googleUser.uid,
          name: googleUser.displayName || 'Traveler',
          email: googleUser.email || '',
          createdAt: new Date().toISOString(),
        }, { merge: true })
      } catch (dbErr) {
        console.warn('⚠️ Could not save user profile to Firestore (database might be disabled/uninitialized):', dbErr)
      }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      await signOut(auth)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
