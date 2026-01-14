import { generateCodeVerifier, generateCodeChallenge } from "./utils/pkce";

export const API_BASE_URL = import.meta.env.VITE_USER_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("Missing VITE_USER_API_BASE_URL (set it in a .env file).");
}

let COGNITO_DOMAIN: string | null = null;
let COGNITO_CLIENT_ID: string | null = null;

const TOKEN_STORAGE_KEY = "cognito_access_token";
const ID_TOKEN_STORAGE_KEY = "cognito_id_token";
const CODE_VERIFIER_KEY = "pkce_code_verifier";
const STATE_KEY = "oauth_state";
const REDIRECT_URI_KEY = "oauth_redirect_uri";

async function loadCognitoConfig(): Promise<void> {
  if (COGNITO_DOMAIN && COGNITO_CLIENT_ID) return;

  try {
    const response = await fetch(`${API_BASE_URL}/v1/config`);
    console.log(`response.ok: ${response.ok}`);
    if (!response.ok) {
      throw new Error(`Failed to load Cognito config: ${response.statusText}`);
    }
    const config = await response.json();
    console.log(`config`, config);

    COGNITO_DOMAIN = config.cognitoDomain;
    COGNITO_CLIENT_ID = config.cognitoClientId;

    // debugging profile route ...
    const profileResponse = await fetch(`${API_BASE_URL}/v1/profile`);
    console.log(`profileResponse.ok: ${profileResponse.ok}`);
    const profileData = await profileResponse.json();
    console.log(`profileData`, profileData);
  } catch (error) {
    throw new Error("Failed to load Cognito configuration");
  }
}

function getRedirectUri(): string {
  return `${window.location.origin}/callback`;
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export async function startLogin(): Promise<void> {
  await loadCognitoConfig();

  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    throw new Error("Cognito configuration not available");
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(REDIRECT_URI_KEY, getRedirectUri());

  const authUrl = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  authUrl.searchParams.set("client_id", COGNITO_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email");
  authUrl.searchParams.set("redirect_uri", getRedirectUri());
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  window.location.href = authUrl.toString();
}

export async function exchangeCodeForTokens(
  code: string,
  state: string
): Promise<{ access_token: string; id_token?: string; expires_in: number }> {
  await loadCognitoConfig();

  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) {
    throw new Error("Cognito configuration not available");
  }

  const storedState = sessionStorage.getItem(STATE_KEY);
  const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
  const storedRedirectUri = sessionStorage.getItem(REDIRECT_URI_KEY);

  if (!storedState || state !== storedState || !codeVerifier) {
    throw new Error("Invalid state or missing code verifier");
  }

  const redirectUri = storedRedirectUri || getRedirectUri();

  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const tokens = await response.json();
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(REDIRECT_URI_KEY);
  return tokens;
}

export function storeAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function storeIdToken(token: string): void {
  sessionStorage.setItem(ID_TOKEN_STORAGE_KEY, token);
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getIdToken(): string | null {
  return sessionStorage.getItem(ID_TOKEN_STORAGE_KEY);
}

export function clearTokens(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(ID_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(REDIRECT_URI_KEY);
}

export async function doLogout(): Promise<void> {
  await loadCognitoConfig();
  clearTokens();
  const logoutUrl = `${COGNITO_DOMAIN}/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${encodeURIComponent(
    window.location.origin
  )}`;
  window.location.href = logoutUrl;
}

export async function getCurrentUser() {
  // API Gateway Cognito authorizer requires ID token, not access token
  const token = getIdToken() || getAccessToken();
  if (!token) {
    console.log("getCurrentUser: No token available");
    return null;
  }

  try {
    console.log("getCurrentUser: Making request with token (first 20 chars):", token.substring(0, 20) + "...");
    const res = await fetch(`${API_BASE_URL}/v1/profile`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("getCurrentUser: Response status:", res.status, "ok:", res.ok);
    if (!res.ok) {
      if (res.status === 401) {
        const errorText = await res.text();
        console.log("getCurrentUser: 401 error response:", errorText);
        // Don't clear tokens automatically on 401 - the token might still be valid
        // (e.g., API Gateway authorizer issue). Let the caller decide.
        // Only clear if we can't decode the token (handled elsewhere)
      }
      return null;
    }
    const data = await res.json();
    console.log("getCurrentUser: Response data:", data);
    return data.authenticated ? data.user : null;
  } catch (error) {
    console.error("getCurrentUser: Error:", error);
    return null;
  }
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // API Gateway Cognito authorizer requires ID token, not access token
  const token = getIdToken() || getAccessToken();
  if (!token) {
    throw new Error("No access token or ID token available");
  }

  console.log("authenticatedFetch: Using token (first 20 chars):", token.substring(0, 20) + "...");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, {
    ...options,
    headers,
  });
}
