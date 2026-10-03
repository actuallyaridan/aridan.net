---
title: Making lyrics feel alive
date: 2026-10-03
preview: How the lyrics on my homepage go from a list of timestamps to something that feels like a lyric video.
---

## Wait, there are lyrics?

If you've been on my homepage while I'm listening to music, you've probably seen the Apple Music card. What you might have missed is the little **Lyrics** button under it. Press it, and the whole screen turns into the song I'm listening to right now, synced live, one line at a time.

It started as a simple idea. Apple Music has lyrics, Spotify has lyrics, why can't my website? But a scrolling list of text felt boring, and I wanted it to feel more like a lyric video than a karaoke machine. So this is how it works, and all the small things that went into making it feel alive.

## Where the song comes from

My website already knows what I'm listening to. I play Apple Music through Cider, which shares what I'm playing to my Discord status, and [Lanyard](https://github.com/Phineas/lanyard) exposes that status to my website over a WebSocket. That gives the page the song, the artist, the album, the album art, and most importantly, *when the song started*.

That last part is the whole trick. If I know when the song started, I know exactly how far into it I am, without the website ever touching my music player:

```js
const elapsed = (Date.now() - track.start) / 1000;
```

Every frame, the page works out which line that lands on. That's it. No audio, no microphone, just a clock.

## Where the lyrics come from

The lyrics themselves come from [LRCLIB](https://lrclib.net), a free, community-made database of time-synced lyrics. But the page never talks to LRCLIB directly. It asks my own website instead, and a small Cloudflare function asks LRCLIB on its behalf.

There are a few reasons for that. It means LRCLIB never sees your IP address, which is nice. But the main reason is that lyrics are copyrighted, and I don't want my website to become a free lyrics API for the whole internet. So before the function answers, it checks my Discord status itself, and it only ever answers for the song I'm playing *right now*. Ask it for any other song and it says no. And nothing is cached on the server either.

Finding the right lyrics is also harder than it sounds. A song can have covers, live versions, remixes and re-recordings, all with different timings. So the function tries three times, each time a little less picky:

1. Artist, title, album and length, all together.
2. Just the artist and title.
3. A full search, where the version closest in length to what I'm playing wins, and anything more than 15 seconds off is thrown out as a different recording.

LRCLIB also gets overloaded sometimes, so the function quietly retries a couple of times before giving up. Someone has the lyrics open, after all.

## Guessing the words

Here's something I didn't know when I started. LRCLIB only knows when each *line* starts, not each word. But I really wanted the words to appear as they're sung.

So the page guesses. It assumes a letter takes about 75 milliseconds to sing, adds a little lead time, and spreads the words across the line based on how many letters come before each one. A long word takes longer to arrive than a short one, just like when you sing it. And it never lets the guess run past 85% of the time before the next line, so a fast line still finishes in time.

```js
const spoken = WORD_PACE * letters + WORD_LEAD;
const reveal = Math.max(0, Math.min(lineLength * REVEAL_SHARE, spoken));
```

Words that haven't been sung yet wait on screen, blurred and dimmed, and sharpen up one by one. It's not perfect, it's a guess after all, but it's surprisingly close most of the time, and it makes a huge difference to how the whole thing feels.

## Never the same twice

If every line showed up in the middle of the screen, it'd get boring after about ten seconds. So every line gets a layout, picked at random from six:

```js
const LAYOUTS = [
  { align: "start", y: 38, tilt: -2, scale: 1 },
  { align: "center", y: 50, tilt: 0, scale: 1.1 },
  { align: "end", y: 60, tilt: 2, scale: 1 },
  { align: "stagger", y: 46, tilt: -1, scale: 0.95 },
  { align: "center", y: 42, tilt: 1.5, scale: 0.9 },
  { align: "start", y: 58, tilt: 0, scale: 1.05 },
];
```

Some sit high, some low, some lean a little to one side. The same layout is never used twice in a row, which is what makes it feel *edited* rather than just typeset. On top of that, every line comes in one of four ways: it rises, drops, zooms or slides in. And the old line doesn't just disappear. It's left to fade away on its own while the next one comes in, overlapping for a moment, like a cut in a video.

## Big text, always

I wanted the text to be *big*. Like, fill-the-screen big. The problem is that lines aren't the same length. A two-word line and a twelve-word line can't use the same font size.

So every line is broken into rows of about 13 letters, and each row gets its own font size, picked so that it fills about 80% of the screen's width. A short line ends up huge, all on one row. A long line becomes a wall of text that still fills the screen. On a phone, the screen is tall and narrow, so the rows get shorter, around 8 letters, and the text stays just as big.

## It never stands still

This is my favourite detail, and you'll only notice it if you stay on it for a while. Every line slowly zooms in for as long as it's on screen:

```css
@keyframes immersivePush {
    from {
        transform: scale(calc(var(--scale, 1) * 0.94));
    }

    to {
        transform: scale(calc(var(--scale, 1) * 1.04));
    }
}
```

It runs over 12 seconds, with most of the movement at the start, so a new line arrives with a bit of momentum, and a line that's held for a long time keeps creeping towards you instead of freezing. It builds on top of the layout's own size too, so a line that was placed small stays smaller than one placed big, even while both of them grow.

## The background

The background is made from the album art. Four copies of it drift around in slow circles while they turn, each at a slightly different speed, so the pattern never lines up and repeats itself. Then it's all blurred until only the colours are left. A dark album gets a moody, dark background, and a colourful one gets a colourful one.

The blur was the hardest part to get right. The obvious way is a CSS or canvas blur filter, but blurring the whole screen 60 times a second is heavy, and Safari doesn't even support filters on a canvas. So instead, the art is drawn tiny, 64 pixels wide, and then shrunk down step by step to 8 pixels and grown back up again. Every time an image is shrunk, its pixels get averaged together, and that averaging *is* a blur. Doing it in small steps keeps it smooth instead of blocky, and it's so cheap it barely costs anything.

The colours are then made about 70% more saturated so they don't turn grey, the edges are darkened a bit so white text stays readable on bright covers, and the whole thing is redrawn at most 30 times a second. It's blurred so much that you can't see the difference from 60 anyway.

## Small things

There are a bunch of smaller things too, that you might never notice:

- Words that name a colour are painted in that colour. That works in English and Swedish, and in Croatian and Bosnian too, where colour words change their endings depending on how they're used, so it checks the stem of the word instead.
- When there's a break in the song, three dots breathe slowly on screen until the singing starts again.
- If a song is instrumental, it tells you so, instead of just saying it couldn't find anything.
- The controls at the top hide after a few seconds, just like a video player, and come back as soon as you move your mouse. On a phone, tapping the lyrics shows or hides them.
- **F** goes fullscreen, **Escape** closes it, and **Tab** cycles through the controls without wandering into the page behind it.
- When the song changes, the new lyrics, colours and background fade in on their own. No need to close and open it again.
- If you prefer reduced motion, either on your device or in my website's settings, all the zooming, drifting and sliding is turned off.

There's also a second, calmer mode called **Time-synced**. It shows all the lyrics in a list, highlights the current line in a colour taken from the album art, and scrolls along with the song. If you scroll away to read something, it waits a few seconds and then catches up again.

## So, was it worth it?

Absolutely. It's probably my favourite thing on this website, even if most people will never see it, since it only shows up while I'm actually listening to something. It's also a good reminder that most of what makes something feel *alive* isn't one big feature. It's a lot of small ones, like a slow zoom, a layout that never repeats, a guess at when a word is sung, that you don't notice on their own, but you'd definitely notice if they were gone.

So if you see the Apple Music card on my homepage, press the Lyrics button and stay for a song or two. And maybe let me know what you think!

Lyrics are provided by [LRCLIB](https://lrclib.net).
