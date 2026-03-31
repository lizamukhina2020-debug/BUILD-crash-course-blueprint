/**
 * Copies docs/BUILD_BLUEPRINT.html → public/build/index.html and blueprint-media/,
 * rewriting image paths to /build/blueprint-media/ so assets resolve when the page
 * is served at /build or /build/.
 */
const fs = require("fs");
const path = require("path");

const websiteRoot = path.join(__dirname, "..");
const docsDir = path.join(websiteRoot, "..", "docs");
const outDir = path.join(websiteRoot, "public", "build");
const htmlSrc = path.join(docsDir, "BUILD_BLUEPRINT.html");
const htmlDst = path.join(outDir, "index.html");
const mediaSrc = path.join(docsDir, "blueprint-media");
const mediaDst = path.join(outDir, "blueprint-media");

if (!fs.existsSync(htmlSrc)) {
  console.error("sync-blueprint: missing", htmlSrc);
  process.exit(1);
}
if (!fs.existsSync(mediaSrc)) {
  console.error("sync-blueprint: missing", mediaSrc);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
let html = fs.readFileSync(htmlSrc, "utf8");
html = html.replace(/src="blueprint-media\//g, 'src="/build/blueprint-media/');
fs.writeFileSync(htmlDst, html);

fs.rmSync(mediaDst, { recursive: true, force: true });
fs.cpSync(mediaSrc, mediaDst, { recursive: true });
console.log("sync-blueprint: wrote", path.relative(websiteRoot, htmlDst));
