import { getSecret, setSecret, deleteSecret } from "./keychain.ts";

export interface OAuth2Config {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export interface OAuth2Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
}

export function saveOAuth2Credentials(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): void {
  setSecret("client-id", clientId);
  setSecret("client-secret", clientSecret);
  setSecret("redirect-uri", redirectUri);
}

export function loadOAuth2Credentials(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = getSecret("client-id");
  const clientSecret = getSecret("client-secret");
  const redirectUri = getSecret("redirect-uri");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("No OAuth2 credentials saved. Run: strap auth-setup");
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(
  config: OAuth2Config,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(" "),
    state,
  });
  return `${config.authorizeUrl}?${params}`;
}

export async function exchangeCode(
  config: OAuth2Config,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<OAuth2Tokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json() as Record<string, unknown>;
  if (!data.access_token) {
    const err = (data.error_description ?? data.error ?? "unknown") as string;
    throw new Error(`Token exchange failed: ${err}`);
  }

  return parseTokenResponse(data);
}

export async function refreshAccessToken(
  config: OAuth2Config,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<OAuth2Tokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: config.scopes.join(" "),
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json() as Record<string, unknown>;
  if (!data.access_token) {
    const err = (data.error_description ?? data.error ?? "unknown") as string;
    throw new Error(`Token refresh failed: ${err}. Re-authenticate with auth-login.`);
  }

  return parseTokenResponse(data, refreshToken);
}

export function saveTokens(tokens: OAuth2Tokens): void {
  setSecret("access-token", tokens.accessToken);
  setSecret("refresh-token", tokens.refreshToken);
  setSecret("expires-at", String(tokens.expiresAt));
}

export function loadTokens(): OAuth2Tokens | null {
  const accessToken = getSecret("access-token");
  const refreshToken = getSecret("refresh-token");
  const expiresAt = getSecret("expires-at");
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt ? parseInt(expiresAt, 10) : 0,
  };
}

export async function getValidAccessToken(config: OAuth2Config): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error("Not logged in. Run: strap auth-login");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now < tokens.expiresAt) {
    return tokens.accessToken;
  }

  const creds = loadOAuth2Credentials();
  const refreshed = await refreshAccessToken(
    config,
    creds.clientId,
    creds.clientSecret,
    tokens.refreshToken,
  );
  saveTokens(refreshed);
  return refreshed.accessToken;
}

export function clearOAuth2Data(): void {
  for (const key of [
    "client-id", "client-secret", "redirect-uri",
    "access-token", "refresh-token", "expires-at",
  ]) {
    deleteSecret(key);
  }
}

export function parseTokenResponse(
  data: Record<string, unknown>,
  existingRefreshToken?: string,
): OAuth2Tokens {
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Token response missing valid access_token");
  }

  const now = Math.floor(Date.now() / 1000);
  const rawExpires = data.expires_in;
  const expiresIn = typeof rawExpires === "number" ? rawExpires
    : typeof rawExpires === "string" ? parseInt(rawExpires, 10) || 3600
    : 3600;

  const rawRefresh = data.refresh_token;
  const refreshToken = (typeof rawRefresh === "string" && rawRefresh)
    ? rawRefresh
    : existingRefreshToken;
  if (!refreshToken) {
    throw new Error("No refresh token in response and no existing token to preserve");
  }

  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: now + expiresIn - 60, // 60s safety buffer
  };
}
