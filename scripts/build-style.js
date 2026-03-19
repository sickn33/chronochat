const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const sourceFile = path.join(projectRoot, "src", "style.css");
const outputFile = path.join(projectRoot, "style.css");

fs.copyFileSync(sourceFile, outputFile);
