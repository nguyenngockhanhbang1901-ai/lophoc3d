/** Where the online-exam student session token lives in this browser. */
export const STUDENT_TOKEN_KEY = "exam-student-token";

export function readStudentToken(): string {
  try {
    return window.localStorage.getItem(STUDENT_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeStudentToken(token: string) {
  try {
    if (token) window.localStorage.setItem(STUDENT_TOKEN_KEY, token);
    else window.localStorage.removeItem(STUDENT_TOKEN_KEY);
  } catch {
    // private mode: the session lasts until the tab closes
  }
}
