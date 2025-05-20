---
title: "Display your current acitivty on your website using Lanyard"
date: "01/05/2025"
link: "/articles/lanyard-setup"
---

## Lanyard? What's that?

Lanyard is a free and open source API you can use to display your current Discord activity on various places. For example, this very website uses Lanyard to display my current playing song on Apple Music along with my current playing game or running app. It's a quite cool thing, and it's a blessing it's available for free!

## How does Lanyard work? And is it really free?

Lanyard is simple. It doesn't reinvent the wheel. The way it works is by simply making you join their Discord server, and when you've joined, their bots will track your activity and then report it to their API. 

Your data is not used to profile you, and you can verify that yourself by having a look at their GitHub, as all of Lanyard's source code is availble for free for anyone on the internet. That's the best thing about open soruce stuff. It's transparent and if the current developers abandon it, anyone can just carry on from where they left off!

Want to add Lanyard to your website? It's super easy, you just need a few things to get started.
Just as a word of causion, whilst this article gets you basic information, you should always have a look on their GitHub in order to get the latest instrcutions and get the most out of Lanyard!

## Getting started with Lanyard

### Setting up Lanyard

Before contunituing, I strongly suggest you to have Lanyards GitHub page on a second tab.

#### 1. Join Lanyards Discord server

As mentioned earlier, Lanyard uses bots in their Discord server to track your activity, so the first thing to do is to join their Discord server, which you can find here: https://discord.gg/lanyard

#### 2. Getting access to your Lanyard data

Lanyard uses your Discord user ID in order to identify you, that way, even if you chnage your username, you'll always have access to Lanyard. Now don't worry, even though a user ID sounds scary and important - it's not - anyone can find your Discord user ID. And for now, we need to be "everyone" so we can find your user ID. 

Do this:
- Enable Discord Developer Mode, which you can find under Settings > Advanced > Developer Mode
- Restart Dsicord, then right click on your username in the bottom left corner
- Click "Copy ID"

Then, go to this URL, making sure to replace "user_id" with your user ID:
```https://api.lanyard.rest/v1/users/user_id```
So for example, my link becomes:
```https://api.lanyard.rest/v1/users/701403809129168978```

You'll get a response similar to this 

   ```js
   {"data":{"kv":{},"discord_user":{"id":"701403809129168978","username":"actuallyaridan","avatar":"e6063f974a29c63af6e09bc96b8c12f0","discriminator":"0","clan":null,"avatar_decoration_data":null,"bot":false,"global_name":"aridan","primary_guild":null,"collectibles":null,"display_name":"aridan","public_flags":64},"activities":[{"id":"131609d86c0fb99","name":"Visual Studio Code","type":0,"state":"Workspace: actuallyaridan.github.io","details":"Editing lanyard-setup.md","timestamps":{"start":1746127463362},"assets":{"large_image":"1359299128655347824","large_text":"Editing a MARKDOWN file","small_image":"1359299466493956258","small_text":"Visual Studio Code"},"application_id":"383226320970055681","created_at":1746130323457},{"id":"958cefcffebd0a48","name":"Apple Music","type":2,"state":"Meghan Trainor","session_id":"5f0751d198dee89be9efe7d802a84dcf","details":"No Excuses","timestamps":{"start":1746130326759,"end":1746130478759},"assets":{"large_image":"mp:external/rajo2bMzZNQy5NuR2wlOe-ir4uMGYZIgaoQC8QHUX3A/https/is1-ssl.mzstatic.com/image/thumb/Music125/v4/a5/9c/b7/a59cb74b-9432-a572-8e26-ce5bf20340ba/886448570417.jpg/100x100bb.jpg","large_text":"TREAT MYSELF (DELUXE)"},"application_id":"773825528921849856","created_at":1746130334392,"buttons":["Play on Apple Music","Search on Spotify"]}],"discord_status":"online","active_on_discord_web":false,"active_on_discord_desktop":true,"active_on_discord_mobile":false,"active_on_discord_embedded":false,"listening_to_spotify":false,"spotify":null},"success":true}
   ```

and that is Lanyards endpoint. A little tip is to open this link in Firefox, as Firefox will recognize the formatting, and show you a version that is much easier to read. 

Now, you *can* use this as an endpoint, but it's quite inefficent, so I would suggest you to use a WebSocket instead. Let me show you how to do that!

#### 3. Using WebSockets to get data from Lanyard

Rather than polling Lanyard’s REST endpoint every few seconds, you can open a WebSocket connection and let Lanyard push updates to you as soon as they happen. Here’s how to wire it up:

1. **Create the socket and subscribe**  
   ```js
   // Point at the Lanyard socket
   const socket = new WebSocket("wss://api.lanyard.rest/socket");

   socket.addEventListener("open", () => {
     console.log("[Lanyard] Socket open – subscribing to your user ID");
     // We use op = 2 to “Initialize” and subscribe to just your ID
     socket.send(JSON.stringify({
       op: 2,
       d: { subscribe_to_id: userID },
     }));
   });
   ```

2. **Handle the “Hello” and start your heartbeat**  
   Lanyard will send you a hello (opcode 1) with a heartbeat_interval value. A heartbeat is a packet sent to you from Lanyard to see if your computer is paying attention to what it's sending. You must reply with opcode 3 on that interval to keep your connection alive, otherwise Lanyard will terminate your connection:
   ```js
   let heartbeat;
   socket.addEventListener("message", ({ data }) => {
     const payload = JSON.parse(data);
     if (payload.op === 1) {
       console.log("[Lanyard] Received Hello; starting heartbeat every", payload.d.heartbeat_interval, "ms");
       clearInterval(heartbeat);
       heartbeat = setInterval(() => {
         socket.send(JSON.stringify({ op: 3 }));
       }, payload.d.heartbeat_interval);
     }
     // …we’ll react to op 0 (Event) below…
   });
   ```

3. **React to incoming data (opcode 0)**  
   Whenever your presence changes—or any of your activities update—Lanyard emits an `Event` (opcode 0). You’ll get the full presence payload in `d`. Plug that into your existing updater:
   ```js
   socket.addEventListener("message", ({ data }) => {
     const payload = JSON.parse(data);

     if (payload.op === 0) {
       // toggle loading spinners
       toggleLoading(true);

       // stash the latest data
       discordDataLatest = payload.d;

       // update all of your UI bits (status, activities, timestamps, etc.)
       updateLanyardData();

       // hide the “loading…” UI and show the real content
       toggleDisplay(elements.loadingDiv, false);
       toggleDisplay(elements.contentDiv, true);
       toggleDisplay(elements.errorMessage, false);

       toggleLoading(false);
     }
   });
   ```

4. **Handle errors and reconnection**  
   WebSockets can drop or error out—so let’s log and try to reconnect automatically:
   ```js
   socket.addEventListener("error", (err) => {
     console.error("[Lanyard] Socket error", err);
     socket.close();
   });

   socket.addEventListener("close", () => {
     console.warn("[Lanyard] Disconnected – retrying in 3 s");
     clearInterval(heartbeat);

     setTimeout(connectWebSocket, 3000);
   });
   ```

5. **Wire it all together**  
   Finally, call your `connectWebSocket` once on page load (and start your 1 s update loop for graceful debouncing):
   ```js
   if (document.querySelector(".discordWrapper")) {
     connectWebSocket();
     // Even though updates come over WS, we still debounce UI refreshes
     setInterval(updateLanyardData, 1000);
   }
   ```


### Get more applications to show on Lanyard

Since Lanyard uses Discord in order to show activities, you might think you can only get games to show up, but that's not the whole story. Because Discord is quite open, you can use something called a *Rich Preacense* for your appliactions, which Discord will recognize as an actviuty (or well, game). You can get rich preacenses for Apple Music, Chrome, Visual Studio Code, and much more! You can also use a rich preacense to get games show up on Lanyard that usually don't, like Minecraft!

 
## Conclusion


