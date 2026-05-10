const path = require("path");
const esbuild = require("esbuild");

const projectRoot = path.resolve(__dirname, "..");
const outputFile = path.join(projectRoot, "content_script.js");
const entryPoint = path.join(projectRoot, "src", "content", "index.js");
const pageBridgeOutputFile = path.join(projectRoot, "page_bridge.js");
const pageBridgeEntryPoint = path.join(projectRoot, "src", "page_bridge.js");

// Entry: src/content/index.js
Promise.all([
  esbuild.build({
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
  }),
  esbuild.build({
    entryPoints: [pageBridgeEntryPoint],
    outfile: pageBridgeOutputFile,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["chrome120"],
    banner: {
      js: "// Generated file. Source: src/page_bridge.js",
    },
    legalComments: "none",
    minify: false,
    sourcemap: false,
  }),
])
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
