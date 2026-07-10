import { readFileSync } from "fs";
import { resolve } from "path";

function extractComparisonTemplate() {
  const appJs = readFileSync(resolve(__dirname, "../../app.js"), "utf-8");
  const match = appJs.match(/const comparisonTemplate = (\{[\s\S]*?\n\});/);
  if (!match) throw new Error("comparisonTemplate not found in app.js");
  return (0, eval)(`(${match[1]})`);
}

describe("AI Schema Contract Test", () => {
  let template;

  beforeAll(() => {
    template = extractComparisonTemplate();
  });

  test("title is non-empty string", () => {
    expect(typeof template.title).toBe("string");
    expect(template.title.length).toBeGreaterThan(0);
  });

  test("aiSummary is non-empty string", () => {
    expect(typeof template.aiSummary).toBe("string");
    expect(template.aiSummary.length).toBeGreaterThan(0);
  });

  test("mismatches is array with at least 1 item", () => {
    expect(Array.isArray(template.mismatches)).toBe(true);
    expect(template.mismatches.length).toBeGreaterThanOrEqual(1);
  });

  test("each mismatch has required fields", () => {
    const required = ["timestamp", "title", "teacherPath", "userPath", "advice"];
    template.mismatches.forEach((item, i) => {
      required.forEach((field) => {
        expect(typeof item[field], `mismatches[${i}].${field}`).toBe("string");
        expect(item[field].length, `mismatches[${i}].${field} non-empty`).toBeGreaterThan(0);
      });
    });
  });

  test("drillPlan has durationMin (number) and steps (array)", () => {
    expect(typeof template.drillPlan.durationMin).toBe("number");
    expect(Array.isArray(template.drillPlan.steps)).toBe(true);
    expect(template.drillPlan.steps.length).toBeGreaterThanOrEqual(1);
  });

  test("reviewAdvice is array", () => {
    expect(Array.isArray(template.reviewAdvice)).toBe(true);
    expect(template.reviewAdvice.length).toBeGreaterThanOrEqual(1);
  });
});
