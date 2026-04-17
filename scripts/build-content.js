const path = require("path");
const esbuild = require("esbuild");

const projectRoot = path.resolve(__dirname, "..");
const outputFile = path.join(projectRoot, "content_script.js");
const entryPoint = path.join(projectRoot, "src", "content", "index.js");

esbuild
  .build({
    entryPoints: [entryPoint],
    outfile: outputFile,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["chrome120"],
    banner: {
      js: "// Generated file. Source: src/content/index.js",
    },
    legalComments: "none",
    minify: false,
    sourcemap: false,
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
