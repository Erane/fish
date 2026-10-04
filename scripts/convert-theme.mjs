import { readdir, readFile, rename, rm, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const QUALITY = 93;
const EFFORT = 6;
const BITMAP = /\.(png|jpe?g)$/i;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DIR = join(ROOT, "public", "theme");
const MASTERS_DIR = join(ROOT, ".tmp", "theme-masters");

const kb = (n) => `${Math.round(n / 1024)}KB`;

async function main() {
  const dir = resolve(process.argv[2] ?? DEFAULT_DIR);
  const entries = await readdir(dir, { withFileTypes: true });
  const sources = entries.filter((e) => e.isFile() && BITMAP.test(e.name));
  const jsonNames = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);

  await mkdir(MASTERS_DIR, { recursive: true });
  for (const { name } of sources) {
    const targetName = name.replace(BITMAP, ".webp");
    const source = join(dir, name);
    const target = join(dir, targetName);
    const [src, dst] = await Promise.all([stat(source), stat(target).catch(() => null)]);
    if (!dst || src.mtimeMs > dst.mtimeMs) {
      await sharp(source).webp({ quality: QUALITY, effort: EFFORT }).toFile(target);
      console.log(`${name} -> ${targetName} (${kb(src.size)} -> ${kb((await stat(target)).size)})`);
    }
    await rm(join(MASTERS_DIR, name), { force: true });
    await rename(source, join(MASTERS_DIR, name));
  }

  const warns = [];
  for (const jsonName of jsonNames) {
    const text = await readFile(join(dir, jsonName), "utf8");
    for (const ref of text.matchAll(/"([^"]*\.(?:png|jpe?g))"/gi))
      warns.push(`${jsonName} 仍引用位图 "${ref[1]}"（母图已转 WebP，请更新引用）`);
  }

  if (sources.length) console.log(`母图备份于 ${MASTERS_DIR}`);
  for (const w of warns) console.warn(w);
}

main().catch((err) => {
  console.error("主题底图转换失败:", err);
  process.exit(1);
});
