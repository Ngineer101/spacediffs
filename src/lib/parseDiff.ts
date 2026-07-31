import type { DiffLine, Hunk, PRFile } from "./types";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

export function parseFilePatch(file: PRFile): Hunk[] {
  if (!file.patch) return [];
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of file.patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      current = {
        id: `${file.filename}#${hunks.length}`,
        file: file.filename,
        fileStatus: file.status,
        header: raw,
        indexInFile: hunks.length,
        hunksInFile: 0,
        lines: [],
        additions: 0,
        deletions: 0,
      };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"

    const marker = raw[0] ?? " ";
    const text = raw.slice(1);
    let line: DiffLine;
    if (marker === "+") {
      line = { type: "add", text, oldLine: null, newLine: newLine++ };
      current.additions++;
    } else if (marker === "-") {
      line = { type: "del", text, oldLine: oldLine++, newLine: null };
      current.deletions++;
    } else {
      line = { type: "context", text, oldLine: oldLine++, newLine: newLine++ };
    }
    current.lines.push(line);
  }

  for (const hunk of hunks) hunk.hunksInFile = hunks.length;
  return hunks;
}

export function parsePr(files: PRFile[]): { hunks: Hunk[]; unscannable: number } {
  const hunks: Hunk[] = [];
  let unscannable = 0;
  for (const file of files) {
    const fileHunks = parseFilePatch(file);
    if (fileHunks.length === 0) unscannable++;
    hunks.push(...fileHunks);
  }
  return { hunks, unscannable };
}
