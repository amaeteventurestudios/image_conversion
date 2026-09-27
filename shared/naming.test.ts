import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsvMapping, duplicateIndexes, finalBase, safeBase, webSafeBase } from "./naming.ts";
import { targetDimensions } from "./settings.ts";

test("web-safe names", () => {
  assert.equal(webSafeBase("African Barber Shop – Evening!"), "african-barber-shop-evening");
  assert.equal(webSafeBase("  Café__Nights  "), "cafe-nights");
  assert.equal(webSafeBase("KEEP Case", false), "KEEP-Case");
});

test("path traversal is neutralised", () => {
  assert.equal(safeBase("../../etc/passwd"), "etc-passwd");
  assert.ok(!safeBase("a/b\\c").includes("/"));
});

test("keep mode only changes extension", () => {
  assert.equal(finalBase({ mode: "keep", original: "IMG_001.png", custom: "x", webNormalize: true, lowercase: true }), "IMG_001");
});

test("duplicates are case-insensitive", () => {
  assert.deepEqual([...duplicateIndexes(["a.webp", "A.webp", "b.webp"])], [0, 1]);
});

test("csv mapping", () => {
  const r = buildCsvMapping("original_name,new_name\nIMG_001.png,one\nIMG_009.png,nine\n\"IMG_002\",two", ["IMG_001.png", "IMG_002.png", "IMG_003.png"]);
  assert.equal(r.matched, 2);
  assert.deepEqual(r.unmatchedImages, ["IMG_003.png"]);
  assert.deepEqual(r.unknownRows, ["img_009.png"]);
});

test("resize never enlarges by default", () => {
  const r = { mode: "width" as const, width: 3840, lockAspect: true, withoutEnlargement: true };
  assert.deepEqual(targetDimensions(1600, 900, r), { width: 1600, height: 900 });
  assert.deepEqual(targetDimensions(1600, 900, { ...r, width: 800 }), { width: 800, height: 450 });
});
