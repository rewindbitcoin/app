// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

export const PASSWORD_VALIDATION = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 32
} as const;

export type PasswordValidation = {
  isValid: boolean;
  error?: 'TOO_SHORT' | 'TOO_LONG';
};

export function validatePassword(password: string): PasswordValidation {
  if (password.length < PASSWORD_VALIDATION.MIN_LENGTH) {
    return { isValid: false, error: 'TOO_SHORT' };
  }
  if (password.length > PASSWORD_VALIDATION.MAX_LENGTH) {
    return { isValid: false, error: 'TOO_LONG' };
  }
  return { isValid: true };
}
