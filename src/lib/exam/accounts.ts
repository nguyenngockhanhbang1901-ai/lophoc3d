// Pure rules for student accounts: usernames, passwords, name normalisation.
// Kept free of I/O so they can be tested and shared by server and browser.

/** Letters without Vietnamese marks, đ → d, lower case. */
export function stripMarks(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Trim and collapse inner spaces; keeps the teacher's spelling and capitals. */
export function cleanFullName(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Key used to compare names: no marks, no case, single spaces. */
export function nameKey(name: string): string {
  return stripMarks(cleanFullName(name)).toLowerCase();
}

/**
 * Username stem from a Vietnamese full name: given name, then the first letters of the
 * family and middle names. "Nguyễn Văn An" → "annv". At least 3 characters, at most 20.
 */
export function usernameStem(fullName: string): string {
  const parts = nameKey(fullName)
    .split(" ")
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  if (!parts.length) return "hs";
  const given = parts[parts.length - 1] ?? "";
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0])
    .join("");
  const stem = (given + initials).slice(0, 20);
  return stem.length >= 2 ? stem : (stem + "hs").slice(0, 20);
}

export const USERNAME_PATTERN = /^[a-z0-9]{3,32}$/;

/** Stem plus a 4-digit number, e.g. annv4821. `digits` is any non-negative integer. */
export function makeUsername(fullName: string, digits: number): string {
  return usernameStem(fullName) + String(Math.abs(Math.trunc(digits)) % 10000).padStart(4, "0");
}

/** Characters that are hard to confuse when read off paper: no 0/o, 1/l/i. */
export const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const PASSWORD_LENGTH = 6;

/** Password from random byte values (one byte per character). */
export function makePassword(randomBytes: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    const byte = randomBytes[i] ?? 0;
    out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
  }
  return out;
}

/** A password a teacher (class default) or student may set: 6–64 characters, no leading/trailing spaces. */
export function passwordProblem(password: string): string | null {
  if (password.length < 6) return "Mật khẩu cần ít nhất 6 ký tự";
  if (password.length > 64) return "Mật khẩu tối đa 64 ký tự";
  if (password.trim() !== password)
    return "Mật khẩu không được bắt đầu hoặc kết thúc bằng dấu cách";
  return null;
}

/** Username typed at login: lower case, no spaces, marks removed. */
export function normalizeLoginName(input: string): string {
  return stripMarks(input).toLowerCase().replace(/\s+/g, "");
}
