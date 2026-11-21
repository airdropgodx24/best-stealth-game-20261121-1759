/* The Quiet Archive — levels.
   Three hand-drawn rooms. Every map is 40 columns by 15 rows of 32 px tiles
   (1280 x 480). Legend:
     '#' shelf or wall — blocks movement and sight
     '.' floor
     ',' shadow pool — standing here hides you even inside a vision cone
     'S' where Wren starts
     'K' a seal-stamp to collect
     'E' the exit (sealed until every stamp is taken)
     '1'..'4' a warden's post; its patrol route is listed below the map
   Patrols walk their waypoints in order and then back again (ping-pong), so
   every leg between two neighbouring waypoints must be a clear straight run. */
'use strict';

const TILE = 32;

const LEVELS = [
  {
    name: 'The Reading Room',
    intro: 'Night in the reading room. Two wardens walk the shelves. Take the three seal-stamps, then slip out the east door.',
    stamps: 3,
    map: [
      '########################################',
      '#S......#...........#..................#',
      '#.......#...........#.......K..........#',
      '#.####..#....,......#..................#',
      '#.#.....#...........#....####..........#',
      '#.#..K..#...........#....#..#.....E....#',
      '#.#.....#....####...#....#..#..........#',
      '#.......#....#..#...#....#..#....####..#',
      '#.#######....#..#...#....#..#....#..#..#',
      '#............#..#...#....#..#....#..#..#',
      '#..####...,...#..#...#.........#..#....#',
      '#..#..#........#..#...#....K...#..#....#',
      '#..#..#..1....#..#...#.........#..#....#',
      '#......2...............................#',
      '########################################',
    ],
    patrols: [
      { spawn: '1', speed: 1.5, waypoints: [[10, 12], [10, 3], [19, 3], [19, 12]] },
      { spawn: '2', speed: 1.6, waypoints: [[7, 13], [30, 13]] },
    ],
  },
  {
    name: 'The Map Room',
    intro: 'Three wardens now, and the map room is all long sight-lines. The dark pools are your friends. Mind the running: boots echo.',
    stamps: 3,
    map: [
      '########################################',
      '#S....,.....#..........#.......K.......#',
      '#..........#..........#................#',
      '#..####....#....,.....#....####........#',
      '#..#.......#..........#....#..#...E....#',
      '#..#...K...#..........#....#..#........#',
      '#..#.......#....####..#....#..#........#',
      '#..#.......#....#.....#................#',
      '#..#####...#....#..1..#....,...........#',
      '#..........#....#.....#................#',
      '#....,.....#....#.....#....####....#...#',
      '#..........#....#..2..#....#.......#...#',
      '#..K........#.........#....#.......#...#',
      '#.....3.............................#..#',
      '########################################',
    ],
    patrols: [
      { spawn: '1', speed: 1.7, waypoints: [[21, 8], [21, 13], [33, 13], [33, 8]] },
      { spawn: '2', speed: 1.8, waypoints: [[21, 11], [21, 5], [20, 5], [20, 11]] },
      { spawn: '3', speed: 1.6, waypoints: [[6, 13], [6, 12], [10, 12], [10, 13]] },
    ],
  },
  {
    name: 'The Vault Stair',
    intro: 'The vault stair. Four wardens, four seals, and nowhere to run. Sneak, wait in the dark, and take the seals one at a time.',
    stamps: 4,
    map: [
      '########################################',
      '#S.....#......#......#......#...K..#...#',
      '#......#..K...#......#....,.#......#...#',
      '#......#......#......#......#......#...#',
      '#.............#.............#......#...#',
      '#......#......#......#......#......#.E.#',
      '#..1...#......#......#..2...#......#...#',
      '#......#......#......#......#..........#',
      '#......#.............#.............#...#',
      '#......#..,...#......#......#..3...#...#',
      '#....,.#......#......#......#......#...#',
      '#...K..#......#...K..#......#......#...#',
      '#......#......#......#......#......#...#',
      '#..4...#......#......#......#......#...#',
      '########################################',
    ],
    patrols: [
      { spawn: '1', speed: 1.9, waypoints: [[3, 6], [3, 1], [6, 1], [6, 13], [3, 13]] },
      { spawn: '2', speed: 2.0, waypoints: [[24, 6], [24, 1], [27, 1], [27, 12], [24, 12]] },
      { spawn: '3', speed: 1.8, waypoints: [[31, 9], [31, 2], [34, 2], [34, 12], [31, 12]] },
      { spawn: '4', speed: 1.7, waypoints: [[3, 13], [3, 4], [10, 4], [10, 13]] },
    ],
  },
];

/** Parse one level map into tiles, the start, stamps, exit and warden posts. */
function parseLevel(def) {
  const rows = def.map.length;
  const cols = def.map[0].length;
  const solid = [];
  const shadow = [];
  for (let y = 0; y < rows; y++) {
    solid.push([]);
    shadow.push([]);
    for (let x = 0; x < cols; x++) {
      const ch = def.map[y][x];
      solid[y].push(ch === '#');
      shadow[y].push(ch === ',');
    }
  }
  let start = { x: 1, y: 1 };
  let exit = { x: cols - 2, y: 1 };
  const stamps = [];
  const posts = {};
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = def.map[y][x];
      if (ch === 'S') start = { x, y };
      else if (ch === 'K') stamps.push({ x, y, taken: false });
      else if (ch === 'E') exit = { x, y };
      else if (ch >= '1' && ch <= '9') posts[ch] = { x, y };
    }
  }
  const wardens = def.patrols.map((p) => {
    const post = posts[p.spawn] || { x: 2, y: 2 };
    return {
      x: (post.x + 0.5) * TILE,
      y: (post.y + 0.5) * TILE,
      dir: 0,
      speed: p.speed * TILE,
      waypoints: p.waypoints.map(([wx, wy]) => ({ x: (wx + 0.5) * TILE, y: (wy + 0.5) * TILE })),
      wp: 0,
      wpDir: 1,
      wait: 0,
      suspicion: 0,
      state: 'patrol',
      lastSeen: null,
    };
  });
  return {
    name: def.name,
    intro: def.intro,
    cols,
    rows,
    solid,
    shadow,
    start,
    exit,
    stamps,
    wardens,
  };
}
