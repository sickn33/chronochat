import fs from "fs";
import path from "path";

describe("Build and style contracts", () => {
  test("source stylesheet contains no remote imports", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "src", "style.css"),
      "utf8",
    );
    expect(css).not.toMatch(/@import\s+url\(/);
    expect(css).not.toMatch(/fonts\.googleapis\.com/);
  });

  test("build scripts generate manifest-backed outputs", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    );
    expect(packageJson.scripts["build:content"]).toContain("build-content.js");
    expect(packageJson.scripts["build:service-worker"]).toContain(
      "build-service-worker.js",
    );
    expect(packageJson.scripts["build:style"]).toContain("build-style.js");
  });
});
