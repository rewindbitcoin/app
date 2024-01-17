export function validatePassword(password: string) {
  if (password.length >= 8 && password.length <= 32) return true;
  return false;
}
