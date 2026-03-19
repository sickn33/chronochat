const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(projectRoot, "src", "content");
const outputFile = path.join(projectRoot, "content_script.js");

const orderedFiles = [
  "00_core.js",
  "10_storage.js",
  "20_dom.js",
  "30_ui.js",
  "40_features.js",
  "50_runtime.js",
];

const header = `// Generated file. Source: src/content/*.js\n`;
const content = orderedFiles
  .map((fileName) => {
    const fullPath = path.join(sourceDir, fileName);
    return fs.readFileSync(fullPath, "utf8").trim();
  })
  .join("\n\n");

fs.writeFileSync(outputFile, header + content + "\n");
