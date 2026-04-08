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

  test("light theme sidebar uses a light surface", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "src", "style.css"),
      "utf8",
    );
    expect(css).toMatch(
      /#chatgpt-nav-sidebar\.theme-light\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.94\)\s*!important;/,
    );
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

  test("manifest icon files exist", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "manifest.json"), "utf8"),
    );
    const iconPaths = [
      ...Object.values(manifest.icons || {}),
      ...Object.values(manifest.action?.default_icon || {}),
    ];

    expect(iconPaths.length).toBeGreaterThan(0);
    iconPaths.forEach((iconPath) => {
      expect(
        fs.existsSync(path.resolve(process.cwd(), iconPath)),
      ).toBe(true);
    });
  });
});
