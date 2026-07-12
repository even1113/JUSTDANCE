import { readFileSync } from "fs";
import { resolve } from "path";

function extractPoolFromAiJs(name) {
  const aiJs = readFileSync(resolve(__dirname, "../../ai.js"), "utf-8");
  const startPattern = `const ${name} = [`;
  const startIdx = aiJs.indexOf(startPattern);
  if (startIdx === -1) throw new Error(`${name} not found in ai.js`);

  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx + startPattern.length - 1; i < aiJs.length; i++) {
    if (aiJs[i] === "[") depth++;
    else if (aiJs[i] === "]") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) throw new Error(`Could not find end of ${name}`);
  const str = aiJs.slice(startIdx + startPattern.length - 1, endIdx + 1);
  return (0, eval)(`(${str})`);
}

describe("AI Schema Contract Test", () => {
  let mismatchPool;
  let summaryTemplates;
  let drillStepPool;
  let reviewAdvicePool;

  beforeAll(() => {
    mismatchPool = extractPoolFromAiJs("mismatchPool");
    summaryTemplates = extractPoolFromAiJs("summaryTemplates");
    drillStepPool = extractPoolFromAiJs("drillStepPool");
    reviewAdvicePool = extractPoolFromAiJs("reviewAdvicePool");
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

  test("buildMockReport function exists in ai.js", () => {
    const aiJs = readFileSync(resolve(__dirname, "../../ai.js"), "utf-8");
    expect(aiJs.includes("function buildReport")).toBe(true);
  });

  test("local motion comparison function exists in ai.js", () => {
    const aiJs = readFileSync(resolve(__dirname, "../../ai.js"), "utf-8");
    expect(aiJs.includes("async function analyzeMotionComparison")).toBe(true);
    expect(aiJs.includes("function buildMotionReport")).toBe(true);
  });
});
