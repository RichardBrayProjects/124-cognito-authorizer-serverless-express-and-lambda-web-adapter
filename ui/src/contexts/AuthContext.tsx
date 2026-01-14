import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@/types';
import { startLogin, doLogout, getCurrentUser, getAccessToken, getIdToken, clearTokens } from '@/api';

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  authenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const accessToken = getAccessToken();
    const idToken = getIdToken();
    console.log('AuthContext: Checking tokens on mount - accessToken:', !!accessToken, 'idToken:', !!idToken);
    
    if (accessToken || idToken) {
      // First, try to decode ID token to get user info (fallback if API fails)
      let userFromToken: User | null = null;
      let tokenValid = false;
      
      if (idToken) {
        try {
          const payload = idToken.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          
          // Check if token is expired
          const exp = decoded.exp;
          const now = Math.floor(Date.now() / 1000);
          if (exp && exp < now) {
            console.log('AuthContext: ID token is expired');
            clearTokens();
            setLoading(false);
            return;
          }
          
          userFromToken = {
            sub: decoded.sub,
            email: decoded.email,
            name: decoded.name || decoded.preferred_username || decoded.username,
            groups: decoded['cognito:groups'] || [],
            email_verified: decoded.email_verified,
          };
          tokenValid = true;
          console.log('AuthContext: Decoded user from ID token:', userFromToken);
          // Set user immediately from token so UI shows something
          setUser(userFromToken);
        } catch (error) {
          console.error('AuthContext: Error decoding ID token:', error);
          // If we can't decode the token, it's invalid - clear it
          clearTokens();
          setLoading(false);
          return;
        }
      } else if (accessToken) {
        // If we only have access token, try to decode it to check validity
        try {
          const payload = accessToken.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          const exp = decoded.exp;
          const now = Math.floor(Date.now() / 1000);
          if (exp && exp < now) {
            console.log('AuthContext: Access token is expired');
            clearTokens();
            setLoading(false);
            return;
          }
          tokenValid = true;
        } catch (error) {
          console.error('AuthContext: Error decoding access token:', error);
          clearTokens();
          setLoading(false);
          return;
        }
      }
      
      // Only try API if we have valid tokens
      if (tokenValid) {
        // Then try to get full user data from API
        console.log('AuthContext: Tokens found, calling getCurrentUser()');
        getCurrentUser()
          .then((userData) => {
            console.log('AuthContext: getCurrentUser() returned:', userData);
            if (userData) {
              // API returned user data, use that (more complete)
              setUser(userData);
            } else if (userFromToken) {
              // API failed but we have token data, keep using that
              console.log('AuthContext: API call failed but keeping user data from ID token');
            } else {
              console.log('AuthContext: getCurrentUser() returned null, user data not available');
            }
          })
          .catch((error) => {
            console.error('AuthContext: Error calling getCurrentUser():', error);
            // If we have user from token, keep it - don't clear tokens on API error
            if (!userFromToken) {
              console.log('AuthContext: No user from token and API failed, but keeping tokens');
            }
          })
          .finally(() => {
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    } else {
      console.log('AuthContext: No tokens found');
      setLoading(false);
    }
  }, []);

  const handleLogin = async () => {
    await startLogin();
  };

  const handleLogout = async () => {
    await doLogout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        authenticated: !!user,
        login: handleLogin,
        logout: handleLogout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
