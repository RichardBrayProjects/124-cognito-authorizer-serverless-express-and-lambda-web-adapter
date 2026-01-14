import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { exchangeCodeForTokens, storeAccessToken, storeIdToken } from '@/api';

const Callback: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const hasExchanged = useRef(false);

  useEffect(() => {
    if (hasExchanged.current) return;

    const code = params.get('code');
    const state = params.get('state');
    const errorParam = params.get('error');
    const errorDescription = params.get('error_description');

    if (errorParam) {
      const msg = errorDescription
        ? `${errorParam}: ${decodeURIComponent(errorDescription)}`
        : errorParam;
      setError(msg);
      setTimeout(() => navigate('/', { replace: true }), 3000);
      return;
    }

    if (!code || !state) {
      setError('Missing authorization code or state');
      setTimeout(() => navigate('/', { replace: true }), 3000);
      return;
    }

    hasExchanged.current = true;

    exchangeCodeForTokens(code, state)
      .then(async (tokens) => {
        storeAccessToken(tokens.access_token);
        if (tokens.id_token) {
          storeIdToken(tokens.id_token);
        }

        let user;
        if (tokens.id_token) {
          try {
            const payload = tokens.id_token.split('.')[1];
            const decoded = JSON.parse(atob(payload));
            user = {
              sub: decoded.sub,
              email: decoded.email,
              name: decoded.name || decoded.preferred_username || decoded.username,
              groups: decoded['cognito:groups'] || [],
              email_verified: decoded.email_verified,
            };
          } catch {
            const { getCurrentUser } = await import('@/api');
            user = await getCurrentUser();
          }
        } else {
          const { getCurrentUser } = await import('@/api');
          user = await getCurrentUser();
        }

        if (user) {
          setUser(user);
          navigate('/profile', { replace: true });
        } else {
          setError('Failed to get user information');
          setTimeout(() => navigate('/', { replace: true }), 3000);
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to exchange authorization code');
        setTimeout(() => navigate('/', { replace: true }), 3000);
      });
  }, [params, navigate, setUser]);

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <p>Authentication error: {error}</p>
        <p>Redirecting to home...</p>
      </div>
    );
  }

  return <p style={{ padding: 16 }}>Signing you in…</p>;
};

export default Callback;
