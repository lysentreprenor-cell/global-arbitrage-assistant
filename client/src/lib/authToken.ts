const TOKEN_KEY = "item_access_token";

export function saveAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}
