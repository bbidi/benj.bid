export const EGGS = [
  { id: "golden", kanji: "夕焼け", name: "Golden Hour", hint: "Reach for the sun." },
  { id: "newton", kanji: "林檎", name: "Newton's Apples", hint: "Gravity is a good listener. Ask an apple. Then ask two more." },
  { id: "furin", kanji: "風鈴", name: "Fūrin", hint: "Something made of glass is waiting for a breeze." },
  { id: "lantern", kanji: "灯籠", name: "Tōrō", hint: "Stone lanterns get lonely in the dark." },
  { id: "kitsune", kanji: "狐", name: "Kitsune", hint: "Someone with orange ears is watching from the grass." },
  { id: "gardener", kanji: "庭師", name: "Gardener", hint: "Tap the earth twice and see what grows." },
  { id: "sold", kanji: "落札", name: "Sold!", hint: "This is a .bid domain. Type yours." },
  { id: "sakura", kanji: "花見", name: "Hanami", hint: "A very old cheat code makes the trees remember spring." },
  { id: "mochi", kanji: "餅", name: "Mochi", hint: "The developer console knows a sweet word." },
  { id: "stag", kanji: "鹿", name: "Red Stag", hint: "Someone wearing a crown of antlers would like a word." },
  { id: "croquet", kanji: "球", name: "Croquet", hint: "A game was left half-played under a tree. Take a swing." },
  { id: "daydream", kanji: "白昼夢", name: "Daydream", hint: "Do nothing at all for a little while." },
];

const KEY = "benj.bid:eggs";

export function createEggs({ onFound, onAll }) {
  let found = new Set();
  try {
    found = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {}
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...found]));
    } catch {}
  };
  return {
    has: (id) => found.has(id),
    get count() {
      return found.size;
    },
    total: EGGS.length,
    list: () => EGGS.map((e) => ({ ...e, found: found.has(e.id) })),
    // returns true when this is the first time
    find(id) {
      if (found.has(id)) return false;
      const egg = EGGS.find((e) => e.id === id);
      if (!egg) return false;
      found.add(id);
      save();
      onFound(egg, found.size, EGGS.length);
      if (found.size === EGGS.length) setTimeout(onAll, 2200);
      return true;
    },
    reset() {
      found.clear();
      save();
    },
  };
}
