/**
 * Copies docs/BUILD_BLUEPRINT.html → public/build/index.html and blueprint-media/,
 * rewriting image paths to /build/blueprint-media/ so assets resolve when the page
 * is served at /build or /build/.
 *
 * Resolves `docs/` via git repo root when possible (Vercel monorepo / root-directory layouts).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const websiteRoot = path.join(__dirname, "..");

function resolveDocsDir() {
  const fallback = path.join(websiteRoot, "..", "docs");
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      cwd: websiteRoot,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (top) {
      const fromGit = path.join(top, "docs");
      if (fs.existsSync(path.join(fromGit, "BUILD_BLUEPRINT.html"))) {
        return fromGit;
      }
    }
  } catch {
    /* shallow or no .git — use fallback */
  }
  return fallback;
}

const docsDir = resolveDocsDir();
const outDir = path.join(websiteRoot, "public", "build");
const htmlSrc = path.join(docsDir, "BUILD_BLUEPRINT.html");
const htmlDst = path.join(outDir, "index.html");
const mediaSrc = path.join(docsDir, "blueprint-media");
const mediaDst = path.join(outDir, "blueprint-media");

if (!fs.existsSync(htmlSrc)) {
  console.error("sync-blueprint: missing", htmlSrc, "| docsDir=", docsDir, "| cwd=", process.cwd());
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
console.log("sync-blueprint: docsDir=", docsDir);
console.log("sync-blueprint: wrote", path.relative(websiteRoot, htmlDst));
