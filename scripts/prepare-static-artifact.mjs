import { cp, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = "build";
const staticFiles = [
  "index.html",
  "footer.html",
  "styles.css",
  "tour.css",
  "main.js",
  "records.js",
  "tour.js",
  "feed.xml",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  staticFiles.map((file) => copyFile(file, path.join(outputDirectory, file))),
);
await Promise.all(
  ["data", "public"].map((directory) =>
    cp(directory, path.join(outputDirectory, directory), { recursive: true }),
  ),
);

await writeFile(path.join(outputDirectory, ".nojekyll"), "");

const pagesCname = process.env.PAGES_CNAME?.trim();
if (pagesCname) {
  await writeFile(path.join(outputDirectory, "CNAME"), `${pagesCname}\n`);
}
