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

  test("OpenAI Sans font files are local extension assets", () => {
    const root = process.cwd();
    const css = fs.readFileSync(path.resolve(root, "src", "style.css"), "utf8");
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(root, "manifest.json"), "utf8"),
    );
    const packageScript = fs.readFileSync(
      path.resolve(root, "scripts", "package-extension.sh"),
      "utf8",
    );
    const expectedFonts = [
      "OpenAISans-Regular.woff2",
      "OpenAISans-RegularItalic.woff2",
      "OpenAISans-Medium.woff2",
      "OpenAISans-MediumItalic.woff2",
      "OpenAISans-Semibold.woff2",
      "OpenAISans-SemiboldItalic.woff2",
      "OpenAISans-Bold.woff2",
      "OpenAISans-BoldItalic.woff2",
    ];

    expect(css).toContain('font-family: "OpenAI Sans"');
    expectedFonts.forEach((fontFile) => {
      expect(css).toContain(`assets/fonts/${fontFile}`);
      expect(fs.existsSync(path.resolve(root, "assets", "fonts", fontFile))).toBe(
        true,
      );
    });
    expect(manifest.web_accessible_resources?.[0]?.resources).toContain(
      "assets/fonts/*.woff2",
    );
    expect(packageScript).toContain("assets/fonts");
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
    expect(packageJson.scripts["package:extension"]).toContain("npm run build");
  });

  test("generated root assets are in sync with source files", () => {
    const root = process.cwd();
    const contentScript = fs.readFileSync(
      path.resolve(root, "content_script.js"),
      "utf8",
    );

    expect(contentScript).toContain(
      "// Generated file. Source: src/content/index.js",
    );
    expect(contentScript).toContain("ChronoChat:");
    expect(fs.readFileSync(path.resolve(root, "service_worker.js"), "utf8")).toBe(
      fs.readFileSync(path.resolve(root, "src", "service_worker.js"), "utf8"),
    );
    expect(fs.readFileSync(path.resolve(root, "style.css"), "utf8")).toBe(
      fs.readFileSync(path.resolve(root, "src", "style.css"), "utf8"),
    );
  });

  test("content build script uses esbuild from an explicit index entrypoint", () => {
    const script = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/build-content.js"),
      "utf8",
    );
    expect(script).toContain("esbuild");
    expect(script).toContain("src/content/index.js");
    expect(script).toContain("bundle");
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
