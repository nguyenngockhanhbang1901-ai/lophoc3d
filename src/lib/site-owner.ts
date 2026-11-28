// Personal website: only these teacher accounts may sign in and manage anything (lessons, classes,
// exams, homeroom). Everyone else can only browse the public pages; students keep using their
// teacher-issued exam accounts or class codes, which are not teacher accounts.
export const OWNER_EMAILS = ["tracongtaha@gmail.com", "nguyenngockhanhbang1901@gmail.com"] as const;

export const NOT_OWNER_MESSAGE =
  "Đây là website cá nhân: chỉ tài khoản của chủ website được đăng nhập quản trị. Bạn vẫn có thể xem các trang công khai.";

export function isOwnerEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return OWNER_EMAILS.some((o) => o === e);
}

/** Set by the root when it signs a non-owner out, so the sign-in page can explain why. */
export const NOT_OWNER_FLAG = "site-not-owner";
