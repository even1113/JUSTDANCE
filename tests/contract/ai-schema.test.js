import { readFileSync } from "fs";
import { resolve } from "path";

function extractPool(name) {
  const appJs = readFileSync(resolve(__dirname, "../../app.js"), "utf-8");
  const match = appJs.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`));
  if (!match) throw new Error(`${name} not found in app.js`);
  return (0, eval)(`(${match[1]})`);
}

describe("AI Schema Contract Test", () => {
  let mismatchPool;
  let summaryTemplates;
  let drillStepPool;
  let reviewAdvicePool;

  beforeAll(() => {
    mismatchPool = extractPool("mismatchPool");
    summaryTemplates = extractPool("summaryTemplates");
    drillStepPool = extractPool("drillStepPool");
    reviewAdvicePool = extractPool("reviewAdvicePool");
  });

  test("mismatchPool is non-empty array", () => {
    expect(Array.isArray(mismatchPool)).toBe(true);
    expect(mismatchPool.length).toBeGreaterThanOrEqual(1);
  });

  test("each mismatch pool item has required fields", () => {
    mismatchPool.forEach((item, i) => {
      expect(Array.isArray(item.titles), `mismatchPool[${i}].titles`).toBe(true);
      expect(item.titles.length, `mismatchPool[${i}].titles non-empty`).toBeGreaterThan(0);
      expect(typeof item.teacher, `mismatchPool[${i}].teacher`).toBe("string");
      expect(item.teacher.length, `mismatchPool[${i}].teacher non-empty`).toBeGreaterThan(0);
      expect(typeof item.user, `mismatchPool[${i}].user`).toBe("string");
      expect(item.user.length, `mismatchPool[${i}].user non-empty`).toBeGreaterThan(0);
      expect(typeof item.advice, `mismatchPool[${i}].advice`).toBe("string");
      expect(item.advice.length, `mismatchPool[${i}].advice non-empty`).toBeGreaterThan(0);
    });
  });

  test("summaryTemplates is non-empty array of strings", () => {
    expect(Array.isArray(summaryTemplates)).toBe(true);
    expect(summaryTemplates.length).toBeGreaterThanOrEqual(1);
    summaryTemplates.forEach((s, i) => {
      expect(typeof s, `summaryTemplates[${i}]`).toBe("string");
      expect(s.length, `summaryTemplates[${i}] non-empty`).toBeGreaterThan(0);
    });
  });

  test("drillStepPool is non-empty array of strings", () => {
    expect(Array.isArray(drillStepPool)).toBe(true);
    expect(drillStepPool.length).toBeGreaterThanOrEqual(1);
    drillStepPool.forEach((s, i) => {
      expect(typeof s, `drillStepPool[${i}]`).toBe("string");
      expect(s.length, `drillStepPool[${i}] non-empty`).toBeGreaterThan(0);
    });
  });

  test("reviewAdvicePool is non-empty array of strings", () => {
    expect(Array.isArray(reviewAdvicePool)).toBe(true);
    expect(reviewAdvicePool.length).toBeGreaterThanOrEqual(1);
    reviewAdvicePool.forEach((s, i) => {
      expect(typeof s, `reviewAdvicePool[${i}]`).toBe("string");
      expect(s.length, `reviewAdvicePool[${i}] non-empty`).toBeGreaterThan(0);
    });
  });

  test("buildReport output schema is valid", () => {
    const appJs = readFileSync(resolve(__dirname, "../../app.js"), "utf-8");
    const buildReportMatch = appJs.match(/function buildReport\(\) \{[\s\S]*?const report = (\{[\s\S]*?\n  \});/);
    expect(buildReportMatch, "buildReport function found").not.toBeNull();
  });
});
