/* The icon in the heading of a program's card on the home page - see
   fillOtherCard() in presence.js.

   Font Awesome Free has logos for plenty of programs, and plain icons for most
   kinds of program, so each card gets the most specific one there is:

     1. the program's own logo, found by its name
     2. an icon for what kind of program it is, also by its name
     3. an icon for what kind of activity it is: watching, streaming...
     4. the plain window, for everything else

   Only the names are there to go on. The "type" Discord sends says "playing"
   for nearly everything - a code editor plays just as much as a game does -
   so a game nobody listed here gets the window rather than a controller. */
(() => {
  "use strict";

  // Lanyard's numbering for an activity's "type", as in presenceClient.js.
  const STREAMING = 1;
  const LISTENING = 2;
  const WATCHING = 3;
  const COMPETING = 5;

  const FALLBACK = ["fa-regular", "fa-window-maximize"];

  // 1. Logos. Tested against the name in lower case, first match wins, so the
  // narrower names go before the broader ones that would also match them.
  const LOGOS = [
    // Visual Studio Code is not Visual Studio, and has no logo of its own
    // here - it is left to the code editors below.
    { match: /^visual studio(?! code)\b/, icon: "visual-studio" },

    // Launchers and stores
    { match: /\bsteam\b/, icon: "steam" },
    { match: /\bbattle\.?net\b/, icon: "battle-net" },
    { match: /\bitch(\.io)?\b/, icon: "itch-io" },
    { match: /\bxbox\b/, icon: "xbox" },
    { match: /\bplaystation\b|\bps remote play\b/, icon: "playstation" },
    { match: /\broblox studio\b/, icon: "roblox-creator-studio" },

    // Browsers
    { match: /\bgoogle chrome\b|^chrome$/, icon: "chrome" },
    { match: /\bfirefox\b/, icon: "firefox-browser" },
    { match: /^(microsoft )?edge$/, icon: "edge" },
    { match: /\bsafari\b/, icon: "safari" },
    { match: /\bopera\b/, icon: "opera" },
    { match: /\bbrave\b/, icon: "brave" },
    { match: /\btor browser\b/, icon: "tor-browser" },

    // Talking to people
    { match: /\bdiscord\b/, icon: "discord" },
    { match: /\bslack\b/, icon: "slack" },
    { match: /\btelegram\b/, icon: "telegram" },
    { match: /\bwhatsapp\b/, icon: "whatsapp" },
    { match: /\bsignal\b/, icon: "signal-messenger" },
    { match: /\bskype\b/, icon: "skype" },
    { match: /\bzoom\b/, icon: "zoom" },
    { match: /\bteamspeak\b/, icon: "teamspeak" },
    { match: /\bmattermost\b/, icon: "mattermost" },
    { match: /^element$/, icon: "matrix" },
    { match: /\bmastodon\b/, icon: "mastodon" },
    { match: /\bthreema\b/, icon: "threema" },
    { match: /\bviber\b/, icon: "viber" },
    { match: /\bguilded\b/, icon: "guilded" },

    // Watching and listening
    { match: /\byoutube\b/, icon: "youtube" },
    { match: /\btwitch\b/, icon: "twitch" },
    { match: /\bspotify\b/, icon: "spotify" },
    { match: /\btidal\b/, icon: "tidal" },
    { match: /\bdeezer\b/, icon: "deezer" },
    { match: /\bsoundcloud\b/, icon: "soundcloud" },
    { match: /\bbandcamp\b/, icon: "bandcamp" },
    { match: /\blast\.?fm\b/, icon: "lastfm" },
    { match: /\bitunes\b|\bapple music\b|\bcider\b/, icon: "itunes-note" },
    { match: /\bletterboxd\b/, icon: "letterboxd" },

    // Making things
    { match: /\bobs( studio)?\b/, icon: "obs-studio" },
    { match: /\bfigma\b/, icon: "figma" },
    { match: /\bunity\b/, icon: "unity" },
    { match: /\bunreal\b/, icon: "unreal-engine" },
    { match: /\bandroid studio\b/, icon: "android" },
    { match: /\b(neo)?vim\b/, icon: "vim" },
    { match: /\bgithub\b/, icon: "github" },
    { match: /\bgitkraken\b/, icon: "gitkraken" },
    { match: /\bsourcetree\b/, icon: "sourcetree" },
    { match: /\bdocker\b/, icon: "docker" },

    // Notes and everything else
    { match: /\bobsidian\b/, icon: "obsidian" },
    { match: /\bnotion\b/, icon: "notion" },
    { match: /\bevernote\b/, icon: "evernote" },
    { match: /\btrello\b/, icon: "trello" },
    { match: /\bjira\b/, icon: "jira" },
    { match: /\bclaude\b/, icon: "claude" },
    { match: /\bchatgpt\b|\bopenai\b/, icon: "openai" },
    { match: /\bcopilot\b/, icon: "copilot" },
    { match: /\bduolingo\b/, icon: "duolingo" },
    { match: /\bstrava\b/, icon: "strava" },
    { match: /\breddit\b/, icon: "reddit" },
  ];

  // 2. Kinds of program, the same way: by name, first match wins. Each ends
  // in (?!\w) rather than \b, which never matches after a symbol at the end
  // of a name - the "++" of Notepad++, the "!" of osu!.
  const KINDS = [
    {
      icon: "code",
      match: /\b(visual studio code|vs ?code|vscodium|cursor|zed|sublime text|atom|nova|xcode|intellij|pycharm|webstorm|phpstorm|rider|clion|goland|rustrover|rubymine|datagrip|fleet|eclipse|netbeans|notepad\+\+|kate|helix|emacs|code)(?!\w)/,
    },
    {
      icon: "terminal",
      match: /\b(terminal|iterm2?|konsole|alacritty|kitty|wezterm|ghostty|warp|powershell|command prompt|cmd)(?!\w)/,
    },
    {
      icon: "globe",
      match: /\b(browser|arc|vivaldi|zen|librewolf|chromium|floorp|waterfox|orion)(?!\w)/,
    },
    {
      icon: "comments",
      match: /\b(chat|messenger|teams|vesktop|vencord|webcord|armcord|legcord|revolt)(?!\w)/,
    },
    {
      // Game launchers, emulators, and a handful of games people play a lot.
      icon: "gamepad",
      match: /\b(epic games|gog( galaxy)?|heroic|lutris|playnite|ea app|ubisoft connect|rockstar games launcher|retroarch|dolphin|yuzu|ryujinx|suyu|citra|pcsx2|rpcs3|cemu|ppsspp|duckstation|minecraft|factorio|terraria|stardew valley|roblox|fortnite|valorant|league of legends|counter-strike|cs2|dota 2|overwatch|apex legends|rocket league|elden ring|genshin impact|honkai|the sims|osu!?|celeste|hollow knight|portal 2?|half-life|team fortress 2|rainbow six|destiny 2|grand theft auto|gta [iv v]+|cyberpunk 2077|baldur's gate 3|the witcher 3|satisfactory|rimworld|subnautica|among us|fall guys|geometry dash|beat saber|vrchat|warframe|path of exile|world of warcraft|hearthstone|diablo|starcraft|marvel rivals|deadlock|helldivers 2|palworld|lethal company|balatro|hades( ii)?|risk of rain 2|slay the spire|undertale|deltarune|animal crossing|zelda|mario|pok[eé]mon)(?!\w)/,
    },
    {
      icon: "film",
      match: /\b(vlc|mpv|iina|plex|jellyfin|kodi|infuse|netflix|crunchyroll|disney\+?|prime video|hbo max|premiere( pro)?|after effects|davinci resolve|final cut( pro)?|kdenlive|shotcut|capcut|handbrake)(?!\w)/,
    },
    {
      icon: "sliders",
      match: /\b(fl studio|ableton( live)?|logic pro|garageband|reaper|bitwig( studio)?|audacity|cubase|pro tools)(?!\w)/,
    },
    {
      icon: "music",
      match: /\b(musicbee|foobar2000|winamp|aimp|strawberry|rhythmbox|audacious|elisa|amberol|plexamp|music)(?!\w)/,
    },
    {
      icon: "cube",
      match: /\b(blender|maya|3ds max|cinema 4d|houdini|zbrush|fusion 360|freecad|solidworks|sketchup|magicavoxel)(?!\w)/,
    },
    {
      icon: "palette",
      match: /\b(photoshop|illustrator|lightroom|affinity (photo|designer)|gimp|krita|inkscape|aseprite|procreate|paint(\.net)?|clip studio paint|canva|sketch|pixelmator|darktable)(?!\w)/,
    },
    {
      icon: "table",
      match: /\b(excel|sheets|numbers|calc)(?!\w)/,
    },
    {
      icon: "person-chalkboard",
      match: /\b(powerpoint|keynote|slides|impress)(?!\w)/,
    },
    {
      icon: "file-lines",
      match: /\b(word|docs|pages|writer|libreoffice|onlyoffice|onenote|notepad|textedit|typora|logseq|joplin|anytype|bear)(?!\w)/,
    },
    {
      icon: "book",
      match: /\b(kindle|calibre|kobo|books|foliate|okular|zathura)(?!\w)/,
    },
    {
      icon: "envelope",
      match: /\b(thunderbird|outlook|mail|betterbird|mailspring|spark)(?!\w)/,
    },
  ];

  // 3. What the activity says it is, for the ones where that tells anything.
  // "Playing" (0) is left out on purpose - see the top of this file.
  const BY_TYPE = new Map([
    [STREAMING, "video"],
    [LISTENING, "headphones"],
    [WATCHING, "tv"],
    [COMPETING, "trophy"],
  ]);

  // The classes for an activity's icon, e.g. ["fa-brands", "fa-steam"].
  function iconFor(activity) {
    const name = (activity?.name || "").toLowerCase().trim();

    const logo = LOGOS.find((entry) => entry.match.test(name));
    if (logo) {
      return ["fa-brands", "fa-" + logo.icon];
    }

    const kind = KINDS.find((entry) => entry.match.test(name));
    if (kind) {
      return ["fa-solid", "fa-" + kind.icon];
    }

    const byType = BY_TYPE.get(activity?.type);
    if (byType) {
      return ["fa-solid", "fa-" + byType];
    }

    return FALLBACK;
  }

  window.ActivityIcons = { iconFor };
})();
