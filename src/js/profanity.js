/* Hides swear words and slurs in what I'm listening to - song titles, artists,
   albums and lyrics - behind the "Hide explicit language" setting, which is on
   unless someone turns it off. Whoever visits, I don't get to pick what's
   playing at the time. One slur is hidden whether that setting is on or not -
   see ALWAYS below.

   Only ever applied to what is shown. The lyrics lookup and the Apple Music
   link still get the real names, or they would stop finding anything.

   Words are matched whole, letters only, so punctuation around them is left
   alone and an innocent word that happens to contain a bad one - Scunthorpe,
   class, assume - is never touched. A word is masked down to its first and
   last letter, "f**k", so a line still reads and keeps its rhythm, and the
   immersive lyrics still have the same letters to pace their reveal by. */
(function (global) {
  "use strict";

  const SETTING = "hideExplicit";

  // The n-word and its spellings, hidden whatever the setting says. Kept as
  // hashes (see hash() below) so the word itself is never written out in
  // this file. A word is hashed lowercase, letters only, and checked against
  // these; with a 32-bit hash, the odds of an innocent word landing on one
  // of them by chance are about one in a billion.
  const ALWAYS = new Set([
    0xd9eb56dd, 0xbb7973ea, 0xb47968e5, 0xc2797eef,
    0xc1424f94, 0xa4705559, 0x06d6111e,
  ]);

  // Bad in any word they turn up in, in any language the songs are in -
  // nothing anyone says innocently has these inside it.
  const ANYWHERE = ["fuck", "shit", "bitch", "jeb"];

  // Bad at the start of a word, whatever follows. Kept to the start because
  // these turn up in the middle of innocent words: Scunthorpe.
  const STARTS = [
    "cunt",
    "wank",

    // Swedish
    "jävl",
    "jävel",
    "knull",

    // Croatian and Bosnian change the end of a word with gender and case -
    // pička, pičke, pičku - so only the part that stays the same is listed.
    "pičk",
    "pizd",
    "kurv",
    "kurc",
    "govn",
    "sranj",
  ];

  // Only exactly these. Each of them is either a normal word with a different
  // ending - dickens, cocktail, pussycat, assume - or short enough to be
  // inside one.
  const EXACT = new Set([
    "ass", "asses", "asshole", "assholes", "arse", "arsehole", "arseholes",
    "badass", "dumbass", "jackass", "smartass",
    "dick", "dicks", "dickhead", "dickheads",
    "cock", "cocks", "cocksucker", "cocksuckers",
    "pussy", "pussies",
    "bastard", "bastards",
    "whore", "whores", "slut", "sluts", "hoes",
    "twat", "twats", "prick", "pricks",
    "fag", "fags", "faggot", "faggots",
    "retard", "retards", "retarded",

    // Swedish. "Fan" and "skit" are left out: in an English song they're
    // a fan and a sketch.
    "fitta", "fittan", "fittor", "fittorna",
    "kuk", "kuken", "kukar", "kukarna",
    "hora", "horan", "horor",

    // Croatian and Bosnian
    "kurac",
  ]);

  // A run of letters in any alphabet, with the apostrophes that are part of
  // it - "fuckin'" is one word, and so is "motherfuckin'".
  const WORD = /\p{L}+(?:['’]\p{L}+)*/gu;

  // Read straight from storage rather than through prefEnabled() in
  // settings.js. Our JS is cached for a few hours, so right after a deploy
  // this file can arrive next to a settings.js from before it existed, and
  // that one would throw on a setting it has never heard of. Anything but an
  // explicit "false" is on, which is the default in settings.js too.
  function enabled() {
    try {
      return localStorage.getItem(SETTING) !== "false";
    } catch {
      return true;
    }
  }

  // FNV-1a, 32-bit: short, fast, and the same in every browser. Not for
  // security - only so ALWAYS can be a list of numbers instead of words.
  function hash(text) {
    let h = 0x811c9dc5;
    for (const ch of text) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function bareOf(word) {
    return word.toLowerCase().replace(/['’]/g, "");
  }

  function isAlwaysHidden(word) {
    return ALWAYS.has(hash(bareOf(word)));
  }

  function isExplicit(word) {
    const bare = bareOf(word);

    if (EXACT.has(bare)) return true;

    for (const part of ANYWHERE) {
      if (bare.includes(part)) return true;
    }

    for (const start of STARTS) {
      if (bare.startsWith(start)) return true;
    }

    return false;
  }

  // Array.from, not split(""), so a letter outside the basic range is one
  // character rather than two halves of one.
  function mask(word) {
    const letters = Array.from(word);

    // Three letters or fewer keep only the first; any more and the last one
    // stays too.
    let keepLast = 0;
    if (letters.length > 3) keepLast = 1;

    return letters
      .map(function (ch, i) {
        if (i === 0) return ch;
        if (i >= letters.length - keepLast) return ch;
        if (ch === "'" || ch === "’") return ch;
        return "*";
      })
      .join("");
  }

  // Always the text back, masked or not, so callers can wrap anything in it.
  function clean(text) {
    if (!text) return text;

    const all = enabled();

    // NFC first, so a "č" that arrives as a "c" plus a separate caron is one
    // letter again - both for the stems above and for how many stars it gets.
    return String(text).normalize("NFC").replace(WORD, function (word) {
      if (isAlwaysHidden(word)) return mask(word);
      if (all && isExplicit(word)) return mask(word);
      return word;
    });
  }

  global.Profanity = { SETTING: SETTING, enabled: enabled, clean: clean };
})(window);
