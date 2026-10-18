---
title: Block ads on your home network with a Raspberry Pi
date: 2026-08-18
preview: Tired of ads? Don't want to be tracked on your own network? There's a solution!
icon: fa-brands fa-raspberry-pi
image: /assets/uploads/images/articles/pihole.jpg
---

## A pi- what?

A Pi-hole is using a Raspberry Pi as a self-hosted DNS server. It allows you to blacklist certain domains from being accessed in your network. But to really understand what a Pi-hole does, you need to learn what a DNS server is and what it does.

## The Domain Name System

The internet initially wasn't built for mere mortals like me and you, it was made so computers can communicate with each other, and that's still how it works. A server is someone else's computer somewhere in the world. A very fancy computer, but a computer nonetheless. Each computer gets its own (or well, it did before we started to run out, but that's too much for this) IP address so they can communicate. They can talk to each other, perfect, right? Yes, for the computers, but not as much for us. IP addresses are built for computers. But humans have a really hard time remembering ever-changing numbers. Like did you know that Google's IP address is [142.251.45.78](http://142.251.45.78)? Probably not. We humans are much better at remembering words and text, like [google.com](https://google.com) for example. But that presents a problem. The internet and computers are built for numbers. Humans are not. What do we do? We need a translator. That's what a DNS, a Domain Name System, does. A domain name system is the thing that lets you write google.com in your web browser, and it'll tell your computer to go to 142.251.45.78.

## How to use DNS to block ads

So since computers need to have a domain translated to an IP address in order to connect to it, what happens if we just *don't do that* for domains we don't like? Well, it doesn't connect. And that's exactly what a Pi-hole does, you set it as your DNS server, and when anything connected to it tries to go to a domain you don't want it to, it'll just say that the domain does not exist, and probably never even existed as well.

## The problem with blocking ads on the DNS-level

Blocking ads on a DNS-level is an effective way to get rid of many ads, but it's not foolproof. It all matters on how the ad is served. Are you on genericwebsite.com and it hosts its ads on adserver123.com? Problem solved, just block adserver123.com and you can still access genericwebsite.com! But if the site serves the ad using the same domain, what does it do then? If you're on genericwebsite.com and it serves its ads using the genericwebsite.com domain, what should it do? Blocking the genericwebsite.com domain would block everything, so you'll *probably* still see ads there. *Probably* because ads are dynamic. You don't want to update the whole website because you want to change an ad, so websites either, as mentioned earlier, load ads from elsewhere, or use a separate JavaScript file to manage ads. And that JavaScript is also in many cases loaded from elsewhere, at which point, the Pi-hole can block it. There are only very few sites where it's completely (or mostly) on the same domain, YouTube, and from my experience, Fandom Wiki. And that's it.

## The advantage

But there are advantages! Many of them! The main advantage is that it applies to any device you connect to your network, it requires no application on your end device. Don't want to see ads on your Samsung Smart Fridge? Yeah, no worries, it's gone. Annoyed of your mobile games showing ads? Gone too. It also lets you block more than just ads and trackers. Want to block websites not safe for work? Go ahead, add a blocklist for that. Want to block all Google services from your network? There's a blocklist for that as well. It gives you control of your network again, allowing you to both monitor what domains are being accessed, and then block them in real time. There is a bit of setup required, mainly installing the Raspberry Pi OS, SSH-ing into it (don't worry, I'll explain what that is), and lastly configuring either your router, or each device separately, to use the Pi-hole. When you've done that, everything can be managed from a portal with a visual interface. So let's get started!

## Selecting a Raspberry Pi to install it on

Here's the good news: a Pi-hole barely does anything, at least as far as a computer is concerned. It answers tiny questions, really fast, all day long. So pretty much any Raspberry Pi will do. A Pi 3, a Pi 4, even a little Pi Zero 2 W. Mine runs on a Raspberry Pi 5, which is honestly overkill, but it's what I had.

Besides the Pi itself, you'll need:

- A power supply that fits your Pi. Use the official one if you can, a weak charger is the most common reason a Pi acts weird.
- A microSD card. 16 GB is more than enough.
- A network cable. Wi-Fi works, but every single lookup in your home is going to go through this thing, so a cable is worth it.
- A case, unless you like your electronics naked.

## Installing Raspberry Pi OS

On your computer, download [Raspberry Pi Imager](https://www.raspberrypi.com/software/) and put the microSD card in. In Imager, pick your Raspberry Pi model, then **Raspberry Pi OS Lite (64-bit)** as the operating system. Lite means no desktop, and you won't need one. Your Pi is going to live in a cupboard somewhere, never seeing a monitor again.

Before it writes anything, Imager asks if you want to customise the OS. You do. Give your Pi a hostname (I'll get to what I named mine later), pick a username and password, and most importantly, **enable SSH**. That's how you'll talk to it from now on.

When it's done, put the card in the Pi, plug in the network cable, and then the power. Give it a minute or two to start up for the first time.

## SSH, as promised

SSH, short for Secure Shell, lets you use another computer's terminal over the network. You type commands on your computer, and they run on the Pi. No monitor, no keyboard, nothing plugged into it but power and the network. It sounds scary, but it's already built into Windows, macOS and Linux, so open a terminal (on Windows, PowerShell works) and type:

```bash
ssh yourname@yourhostname.local
```

Use the username and hostname you picked in Imager. The first time, it'll ask if you trust the computer you're connecting to. Type `yes`, then your password, and you're in. Everything you type now happens on the Pi.

If it can't find `yourhostname.local`, your router's admin page usually has a list of connected devices. Find the Pi there and use its IP address instead.

Once you're in, start by bringing everything up to date:

```bash
sudo apt update && sudo apt full-upgrade -y
```

## Give it an address that never changes

Every device on your network is going to be told "this is where you ask for directions". If the Pi's IP address ever changes, that's like moving house without telling anyone. Suddenly nothing on your network can find anything, and it'll look like the whole internet is down.

So log in to your router and look for something called *DHCP reservation*, *address reservation* or *static lease*. Every router calls it something different, of course. Find the Pi, reserve the address it has now, and from then on it'll always get the same one.

## Installing Pi-hole

This is the easy part. Pi-hole has an installer that does almost everything for you:

```bash
curl -sSL https://install.pi-hole.net | bash
```

That downloads the installer and runs it straight away. If you'd rather read it before running something from the internet (fair, honestly), you can download it first and have a look.

The installer walks you through a few questions. The defaults are fine for almost all of them: use the network cable's interface, pick any upstream DNS provider for now (more on that later), keep the default blocklist, and yes, you want the web interface. At the end, it shows you the address of the dashboard and a password for it. You can change that password to something you'll actually remember with:

```bash
sudo pihole setpassword
```

Now open `http://<your Pi's IP address>/admin` in your browser and log in. That's your Pi-hole! It's not doing anything yet though, because nothing is asking it for directions.

## Pointing your network at it

You *could* go into every device and set the Pi as its DNS server by hand, but that's no fun, and it misses the whole point. The better way is to tell your router, so every device picks it up on its own.

In your router's settings, look for the DHCP settings and the DNS server it hands out. Set it to your Pi's IP address. Devices will start using it as they reconnect, or you can just turn their Wi-Fi off and on again.

Two things to watch out for here:

- **Don't add a second, normal DNS server as a backup.** It sounds sensible, but devices happily use whichever one they feel like, and every time they pick the other one, your ads come right back.
- **Some routers, especially the ones from your internet provider, won't let you change the DNS server at all.** If yours is one of them, turn off the router's DHCP server and turn on the one built into Pi-hole instead, in its settings under DHCP. Then the Pi hands out the addresses and the directions.

To check it works, open the dashboard and use your phone for a bit. You should see the number of queries climbing, and some of them being blocked. The query log shows every single lookup as it happens, which is both fascinating and slightly horrifying. Your smart TV is *chatty*.

## Making it yours

The default blocklist is a good start, but it's only the beginning. Under **Lists** in the dashboard you can add more, for trackers, malware, scams, or whatever else you don't want on your network. After adding one, update gravity (that's what Pi-hole calls its combined blocklist) from the dashboard or with `pihole -g`.

Sometimes a list is a bit too eager and blocks something you actually need. A link in an email that doesn't open, or an app that suddenly can't log in. Find the domain in the query log and allow it, and it works again straight away.

I also changed the upstream DNS server, the one the Pi asks about everything it *doesn't* block. Mine forwards everything to Quad9, and it validates DNSSEC all the way through. That means it cryptographically checks that the answers it gets back are genuine and haven't been tampered with on the way. Both are a couple of checkboxes in the DNS settings.

## Mine looks after itself

I don't want to babysit my Pi-hole, so it maintains itself on a schedule. Every week, it quietly:

- Updates its own Pi-hole software, every Sunday.
- Refreshes its blocklists of millions of domains.
- Installs operating system and security updates, and reboots on its own, but only when an update actually needs it.
- Writes every one of those runs to a log, so if something ever fails, it doesn't fail silently.

Most weeks, I don't touch it at all. Which is exactly how I like it.

## The live stats on my website

If you've seen the [Pi-hole page](/pihole/) on my website, you've seen my Pi-hole's numbers, live. But the Pi itself lives entirely inside my home network, and it's never exposed to the internet.

So instead of my website reaching in, the Pi reaches out. A small script runs on it every fifteen minutes, reads its own stats, and sends just the totals to a tiny Cloudflare function that stores them. The Pi-hole page then reads them right back from there. Only those summary numbers ever leave my network, never which sites were visited, which device asked, or anything about what I actually browse. It's live, but it's not revealing.

## Why mine is called look-what-you-made-me-do

Every machine deserves a good name. My Wi-Fi is invisible string (yes, after the Taylor Swift song), so the Pi-hole guarding it became look-what-you-made-me-do - and that firs the song a little too well. It keeps "a list of names, and yours is in red, underlined".. that's literally a blocklist. And then it checks it once, and then it checks it twice and, oh! The ad server can't come to the phone right now. Why? 'Cause it's dead!
