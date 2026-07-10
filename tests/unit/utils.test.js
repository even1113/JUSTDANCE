import { readFileSync } from "fs";
import { resolve } from "path";

function extractFromAppJs(functionName) {
  const appJs = readFileSync(resolve(__dirname, "../../app.js"), "utf-8");
  const pattern = new RegExp(`function ${functionName}\\([\\s\\S]*?\\n\\}`, "m");
  const match = appJs.match(pattern);
  if (!match) return null;
  return match[0];
}

describe("Unit Tests - Utility Functions", () => {
  test("escapeHtml escapes special characters", () => {
    const escapeHtml = (0, eval)(`(${extractFromAppJs("escapeHtml")})`);
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml('a"b')).toBe("a&quot;b");
    expect(escapeHtml("a&b")).toBe("a&amp;b");
    expect(escapeHtml("a'b")).toBe("a&#039;b");
  });

  test("formatFileSize formats bytes correctly", () => {
    const formatFileSize = (0, eval)(`(${extractFromAppJs("formatFileSize")})`);
    expect(formatFileSize(500)).toBe("0 KB");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("2 KB");
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(1572864)).toBe("1.5 MB");
  });

  test("formatTimestamp formats seconds to MM:SS", () => {
    const formatTimestamp = (0, eval)(`(${extractFromAppJs("formatTimestamp")})`);
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(65)).toBe("01:05");
    expect(formatTimestamp(599)).toBe("09:59");
  });
});
