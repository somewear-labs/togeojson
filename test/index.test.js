import fs from "fs";
import path from "path";
import * as tj from "../index.js";
import xmldom from "@xmldom/xmldom";
import { test } from "tap";

const d = "./test/data/";

test("toGeoJSON", (t) => {
  // Loop through all files except hidden ones
  for (let file of fs.readdirSync(d).filter((item) => !item.startsWith("."))) {
    const ext = path.extname(file).substring(1);
    const dom = new xmldom.DOMParser().parseFromString(
      fs.readFileSync(path.join(d, file), "utf8")
    );
    t.matchSnapshot(tj[ext](dom), file);

    if (ext === "kml") {
      t.matchSnapshot(tj.kmlWithFolders(dom), file);
    }
  }
  t.end();
});
