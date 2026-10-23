import { describe, expect, it } from "vitest";
import { matchPeers, waLink, waNumber, PER_MENTOR, MENTOR_LOAD, type Person } from "./match";

const P = (id: string): Person => ({ studentId: id, name: id.toUpperCase(), rollNo: `R-${id}`, phone: "+92 300 1234567" });
const people = new Map(["a", "b", "c", "d", "e", "f", "g"].map((id) => [id, P(id)]));

describe("matchPeers", () => {
  it("pairs the weakest learner with the strongest mentor and caps mentor load", () => {
    const rows = [
      { studentId: "a", concept: "sets", mastery: 95 }, { studentId: "b", concept: "sets", mastery: 85 },
      { studentId: "c", concept: "sets", mastery: 10 }, { studentId: "d", concept: "sets", mastery: 30 },
      { studentId: "e", concept: "sets", mastery: 50 }, { studentId: "f", concept: "sets", mastery: 70 },
    ];
    const { circles, unmatched } = matchPeers(rows, people);
    expect(circles[0].mentor.studentId).toBe("a");
    expect(circles[0].learners.map((l) => l.studentId)).toEqual(["c", "d"]); // weakest first, capped at PER_MENTOR
    expect(circles[0].learners.length).toBeLessThanOrEqual(PER_MENTOR);
    expect(circles[1].mentor.studentId).toBe("b");
    expect(circles[1].learners.map((l) => l.studentId)).toEqual(["e"]);
    expect(unmatched).toEqual([]);
    // f (70%) is neither a learner (< 60) nor a mentor (>= 80)
    expect(circles.flatMap((c) => [c.mentor.studentId, ...c.learners.map((l) => l.studentId)])).not.toContain("f");
  });

  it("never lets a student mentor a concept they are missing, and leaves overflow with the trainer", () => {
    const rows = [
      { studentId: "a", concept: "loops", mastery: 90 },
      ...["b", "c", "d"].map((id) => ({ studentId: id, concept: "loops", mastery: 20 })),
    ];
    const { circles, unmatched } = matchPeers(rows, people);
    expect(circles).toHaveLength(1);
    expect(circles[0].learners).toHaveLength(PER_MENTOR);
    expect(unmatched[0].learners.map((l) => l.studentId)).toEqual(["d"]);
  });

  it("caps a mentor's total load across concepts", () => {
    const concepts = ["c1", "c2", "c3"];
    const rows = concepts.flatMap((c) => [
      { studentId: "a", concept: c, mastery: 99 },
      { studentId: "b", concept: c, mastery: 10 }, { studentId: "d", concept: c, mastery: 15 },
    ]);
    const { circles } = matchPeers(rows, people);
    const aLoad = circles.filter((c) => c.mentor.studentId === "a").reduce((s, c) => s + c.learners.length, 0);
    expect(aLoad).toBe(MENTOR_LOAD);
  });
});

describe("WhatsApp links", () => {
  it("normalises Pakistani numbers", () => {
    expect(waNumber("+92 300 1234567")).toBe("923001234567");
    expect(waNumber("0300-1234567")).toBe("923001234567");
    expect(waNumber("0092 300 1234567")).toBe("923001234567");
    expect(waNumber("123")).toBeNull();
    expect(waNumber("+92 31 1000000")).toBeNull(); // one digit short of a PK mobile
    expect(waNumber(null)).toBeNull();
  });
  it("falls back to the share-to-contact link when the number is unusable", () => {
    expect(waLink(null, "hi")).toBe("https://wa.me/?text=hi");
  });
  it("encodes Urdu text", () => {
    expect(waLink("0300 1234567", "سلام loops")).toBe(`https://wa.me/923001234567?text=${encodeURIComponent("سلام loops")}`);
  });
});
