import { expect, it } from "vitest";
import { bankPaths, buildTree, flatten, isEmptyTopic, pathLabels, unclassified } from "./topics";

const topics = [
  { id: "g", parent_id: null, level: "grade" as const, title: "Khối 11", position: 1 },
  { id: "c", parent_id: "g", level: "chapter" as const, title: "Chương IV", position: 1 },
  { id: "L2", parent_id: "c", level: "lesson" as const, title: "Bài 12", position: 2 },
  { id: "L1", parent_id: "c", level: "lesson" as const, title: "Bài 11", position: 1 },
];
const banks = [
  { id: "f2", title: "Dạng 2", topic_id: "L1", position: 2 },
  { id: "f1", title: "Dạng 1", topic_id: "L1", position: 1 },
  { id: "old", title: "Ngân hàng cũ", topic_id: null, position: 0 },
];

it("builds Khối → Chương → Bài → Dạng in order, with old banks unclassified", () => {
  const tree = buildTree(topics, banks);
  expect(
    flatten(tree, unclassified(topics, banks)).map((x) => `${"-".repeat(x.depth)}${x.title}`),
  ).toEqual([
    "Khối 11",
    "-Chương IV",
    "--Bài 11",
    "---Dạng 1",
    "---Dạng 2",
    "--Bài 12",
    "Ngân hàng cũ",
  ]);
  expect(bankPaths(topics, banks).get("f1")).toEqual(["L1", "c", "g"]);
  expect(bankPaths(topics, banks).get("old")).toEqual([]);
  expect(pathLabels(topics, banks).get("f2")).toBe("Khối 11 › Chương IV › Bài 11 › Dạng 2");
  expect(isEmptyTopic(topics, banks, "L2")).toBe(true);
  expect(isEmptyTopic(topics, banks, "L1")).toBe(false);
  expect(isEmptyTopic(topics, banks, "c")).toBe(false);
});
