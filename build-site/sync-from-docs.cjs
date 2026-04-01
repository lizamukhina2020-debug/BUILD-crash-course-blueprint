/**
 * Copies docs/BUILD_BLUEPRINT.html → ./index.html and docs/blueprint-media/ → ./blueprint-media/
 * Paths in HTML stay as blueprint-media/... (same as docs/) for a standalone static site at /.
 *
 * Resolves docs/ via git repo root when possible (Vercel monorepo).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const buildSiteRoot = __dirname;

function resolveDocsDir() {
  const fallback = path.join(buildSiteRoot, "..", "docs");
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      cwd: buildSiteRoot,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (top) {
      const fromGit = path.join(top, "docs");
      if (fs.existsSync(path.join(fromGit, "BUILD_BLUEPRINT.html"))) {
        return fromGit;
      }
    }
  } catch {
    /* shallow or no .git */
  }
  return fallback;
}

const docsDir = resolveDocsDir();
const htmlSrc = path.join(docsDir, "BUILD_BLUEPRINT.html");
const htmlDst = path.join(buildSiteRoot, "index.html");
const mediaSrc = path.join(docsDir, "blueprint-media");
const mediaDst = path.join(buildSiteRoot, "blueprint-media");

/** Vercel CLI folder uploads only `build-site/` — no sibling `../docs`. Use committed snapshot if present. */
function hasUsableSnapshot() {
  if (!fs.existsSync(htmlDst)) return false;
  const sentinel = path.join(mediaDst, "hero-ai-banner.png");
  return fs.existsSync(sentinel);
}

const canSyncFromDocs =
  fs.existsSync(htmlSrc) && fs.existsSync(mediaSrc);

if (!canSyncFromDocs) {
  if (hasUsableSnapshot()) {
    console.log(
      "build-site: ../docs not available (CLI upload?); using committed index.html + blueprint-media/"
    );
    process.exit(0);
  }
  console.error(
    "build-site: missing",
    htmlSrc,
    "| docsDir=",
    docsDir,
    "| cwd=",
    process.cwd()
  );
  process.exit(1);
}

fs.copyFileSync(htmlSrc, htmlDst);
fs.rmSync(mediaDst, { recursive: true, force: true });
fs.cpSync(mediaSrc, mediaDst, { recursive: true });
console.log("build-site: docsDir=", docsDir);
console.log("build-site: wrote index.html + blueprint-media/");
