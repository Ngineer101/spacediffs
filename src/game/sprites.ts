export type SpriteKind = "squid" | "crab" | "octopus" | "bug" | "ufo" | "player";

export const SPRITE_COLORS: Record<SpriteKind, string> = {
  squid: "#33ff66",
  crab: "#ff4466",
  octopus: "#7fd694",
  bug: "#ffb000",
  ufo: "#ff55ff",
  player: "#33ddff",
};

const PIXELS: Record<SpriteKind, string[][]> = {
  squid: [
    [
      "...##...",
      "..####..",
      ".######.",
      "##.##.##",
      "########",
      ".#.##.#.",
      "#......#",
      ".#....#.",
    ],
    [
      "...##...",
      "..####..",
      ".######.",
      "##.##.##",
      "########",
      "..#..#..",
      ".#.##.#.",
      "#.#..#.#",
    ],
  ],
  crab: [
    [
      "..#.....#..",
      "...#...#...",
      "..#######..",
      ".##.###.##.",
      "###########",
      "#.#######.#",
      "#.#.....#.#",
      "...##.##...",
    ],
    [
      "..#.....#..",
      "#..#...#..#",
      "#.#######.#",
      "###.###.###",
      "###########",
      ".#########.",
      "..#.....#..",
      ".#.......#.",
    ],
  ],
  octopus: [
    [
      "....####....",
      ".##########.",
      "############",
      "###..##..###",
      "############",
      "...##..##...",
      "..##.##.##..",
      "##........##",
    ],
    [
      "....####....",
      ".##########.",
      "############",
      "###..##..###",
      "############",
      "..###..###..",
      ".##..##..##.",
      "..##....##..",
    ],
  ],
  bug: [
    [
      "..#.......#..",
      "...#.....#...",
      "..#########..",
      ".##.#####.##.",
      "###.#####.###",
      "#############",
      "###.#####.###",
      ".##.#####.##.",
      "..#..###..#..",
      ".#...#.#...#.",
    ],
    [
      ".#.........#.",
      "..#.......#..",
      "..#########..",
      ".##.#####.##.",
      "###.#####.###",
      "#############",
      "###.#####.###",
      ".##.#####.##.",
      ".#...###...#.",
      "#....#.#....#",
    ],
  ],
  ufo: [
    [
      ".....######.....",
      "...##########...",
      "..############..",
      ".##.##.##.##.##.",
      "################",
      "...###....###...",
      "....#......#....",
    ],
  ],
  player: [
    [
      "......#......",
      ".....###.....",
      ".....###.....",
      ".###########.",
      "#############",
      "#############",
      "#############",
      "#############",
    ],
  ],
};

export interface SpriteSet {
  frames: HTMLCanvasElement[];
  /** Size in scaled pixels. */
  w: number;
  h: number;
}

export function makeSprite(kind: SpriteKind, scale = 2, color?: string): SpriteSet {
  const frames = PIXELS[kind].map((rows) => {
    const canvas = document.createElement("canvas");
    canvas.width = rows[0].length * scale;
    canvas.height = rows.length * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color ?? SPRITE_COLORS[kind];
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] === "#") ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return canvas;
  });
  return { frames, w: frames[0].width, h: frames[0].height };
}

/** Data-URI version of a sprite for use in DOM <img> tags (HUD, manifests). */
export function spriteDataUri(kind: SpriteKind, scale = 3, color?: string): string {
  return makeSprite(kind, scale, color).frames[0].toDataURL();
}
