const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const sourceFile = path.join(projectRoot, "src", "service_worker.js");
const outputFile = path.join(projectRoot, "service_worker.js");

fs.copyFileSync(sourceFile, outputFile);
