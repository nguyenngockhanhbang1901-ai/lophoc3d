import { describe, expect, it } from "vitest";
import {
  PASSWORD_ALPHABET,
  USERNAME_PATTERN,
  cleanFullName,
  makePassword,
  makeUsername,
  nameKey,
  normalizeLoginName,
  passwordProblem,
  usernameStem,
} from "./accounts";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "./secrets";
import { displayDate, parseBirthDate, parseRoster } from "./roster";

describe("student accounts", () => {
  it("builds usernames from Vietnamese names", () => {
    expect(usernameStem("Nguyễn Văn An")).toBe("annv");
    expect(usernameStem("  Đặng   Thị  Ánh  Tuyết ")).toBe("tuyetdta");
    expect(usernameStem("Lê Ư")).toBe("ul");
    expect(makeUsername("Nguyễn Văn An", 482)).toBe("annv0482");
    expect(makeUsername("Lê Ư", 7)).toMatch(USERNAME_PATTERN);
    expect(makeUsername("!!!", 12)).toMatch(USERNAME_PATTERN);
  });

  it("makes readable passwords", () => {
    const p = makePassword([0, 1, 2, 30, 31, 255]);
    expect(p).toHaveLength(6);
    for (const ch of p) expect(PASSWORD_ALPHABET).toContain(ch);
    expect(PASSWORD_ALPHABET).not.toMatch(/[0o1li]/);
  });

  it("checks chosen passwords and login names", () => {
    expect(passwordProblem("12345")).toMatch(/ít nhất 6/);
    expect(passwordProblem(" abcdef")).not.toBeNull();
    expect(passwordProblem("abcdef")).toBeNull();
    expect(normalizeLoginName(" AnNV 0482 ")).toBe("annv0482");
    expect(cleanFullName(" Trần  Bình ")).toBe("Trần Bình");
    expect(nameKey("Trần Bình")).toBe(nameKey("tran  binh"));
  });

  it("hashes and verifies passwords", async () => {
    const stored = await hashPassword("k7mq2x", 1000);
    expect(stored).toMatch(/^pbkdf2\$1000\$/);
    expect(await verifyPassword("k7mq2x", stored)).toBe(true);
    expect(await verifyPassword("k7mq2y", stored)).toBe(false);
    expect(await verifyPassword("k7mq2x", "garbage")).toBe(false);
    expect(await hashPassword("k7mq2x", 1000)).not.toBe(stored);
  });

  it("hashes session tokens", async () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(token)).toBe(await hashToken(token));
    expect(await hashToken(token)).not.toBe(token);
  });
});

describe("class list import", () => {
  it("reads dates in every form", () => {
    expect(parseBirthDate("05/09/2009")).toBe("2009-09-05");
    expect(parseBirthDate("5-9-2009")).toBe("2009-09-05");
    expect(parseBirthDate("2009-09-05")).toBe("2009-09-05");
    expect(parseBirthDate(new Date(Date.UTC(2009, 8, 5)))).toBe("2009-09-05");
    expect(parseBirthDate(40061)).toBe("2009-09-05");
    expect(parseBirthDate("31/02/2009")).toBe("invalid");
    expect(parseBirthDate("hôm qua")).toBe("invalid");
    expect(parseBirthDate("")).toBeNull();
    expect(displayDate("2009-09-05")).toBe("05/09/2009");
  });

  it("finds the header below a title and reads a full-name column", () => {
    const rows = [
      ["DANH SÁCH LỚP 11A1", null, null, null],
      [null, null, null, null],
      ["STT", "Họ và tên", "Ngày sinh", "Mã học sinh"],
      [1, "Nguyễn Văn An", "05/09/2009", "HS01"],
      [2, " Trần  Thị Bình ", null, null],
      [3, null, null, null],
    ];
    const r = parseRoster(rows);
    expect(r.problems).toEqual([]);
    expect(r.students).toEqual([
      { row: 4, fullName: "Nguyễn Văn An", birthDate: "2009-09-05", studentCode: "HS01" },
      { row: 5, fullName: "Trần Thị Bình", birthDate: null, studentCode: null },
    ]);
  });

  it("joins separate family and given name columns", () => {
    const r = parseRoster([
      ["STT", "Họ và tên đệm", "Tên", "Ngày sinh"],
      [1, "Lê Hoàng", "Nam", "01/01/2009"],
    ]);
    expect(r.students[0]?.fullName).toBe("Lê Hoàng Nam");
  });

  it("reports missing names, bad dates and duplicates by row", () => {
    const rows = [
      ["Họ tên", "Ngày sinh", "Mã HS"],
      ["Nguyễn Văn An", "05/09/2009", "A1"],
      [null, "06/09/2009", "A2"],
      ["Phạm Minh", "32/13/2009", null],
      ["nguyen van an", "05/09/2009", null],
      ["Nguyễn Văn An", "07/09/2009", null],
      ["Đỗ Hà", null, "a1"],
      ["Vũ Lan", null, null],
    ];
    const r = parseRoster(rows, [{ fullName: "Vũ Lan", birthDate: null, studentCode: null }]);
    expect(r.students.map((s) => s.row)).toEqual([2, 6]);
    expect(r.problems.map((p) => p.row)).toEqual([3, 4, 5, 7, 8]);
    expect(r.problems[0]?.message).toBe("Thiếu họ tên");
    expect(r.problems[2]?.message).toMatch(/dòng 2/);
    expect(r.problems[3]?.message).toMatch(/A1|a1/);
    expect(r.problems[4]?.message).toMatch(/đã có trong lớp/);
  });

  it("says when there is no name column", () => {
    const r = parseRoster([
      ["a", "b"],
      [1, 2],
    ]);
    expect(r.students).toEqual([]);
    expect(r.problems[0]?.message).toMatch(/Họ và tên/);
  });
});

describe("readable password copies", () => {
  it("encrypts so only the server key reads it back", async () => {
    const { encryptSecret, decryptSecret } = await import("./secrets");
    const sealed = await encryptSecret("123456", "server-key");
    expect(sealed).toMatch(/^v1:/);
    expect(sealed).not.toContain("123456");
    expect(await decryptSecret(sealed, "server-key")).toBe("123456");
    expect(await decryptSecret(sealed, "other-key")).toBeNull();
    expect(await decryptSecret(null, "server-key")).toBeNull();
    expect(await encryptSecret("123456", "server-key")).not.toBe(sealed);
  });
});
