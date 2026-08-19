---
title: Block ads on your home network with a Raspberry Pi
date: 2026-08-18
preview: Tired of ads? Don't want to be tracked on your own network? There's a solution!
---

## A pi- what?

A Pihole is using a Raspberry Pi as a self-hosted DNS-server. It allows you to blacklist certain domains from being accessed in your network. But to really understand what a Pihole does, you need to learn what a DNS-server is and what it does.

## The Domain Name System

The internet initially wasn't built for mere-mortals like me and you, it was made so computers can communicate with each other, and that's still how it works. A server is someone else's computer somewhere in the world. A very fancy computer, but a computer nonetheless. Each computer gets its own (or well, it did before we started to run out, but that's too much for this) IP address so they can communicate. They can talk to each other, perfect, right? Yes, for the computers, but not as much for us.
IP addresses are built for computers. But humans have a really hard time remembering ever-changing numbers. Like did you know that Google's IP address is [142.251.45.78](http://142.251.45.78)? Probably not. Us humans are much better at remembering words and text, like [google.com](https://google.com) for example.
But that presents a problem. The internet and computers are built for numbers. Humans are not. What do we do? We need a translator. That's what a DNS, a Domain Name System, does. A domain name system is the thing that lets you write google.com in your web browser, and it'll tell your computer to 142.251.45.78.

## How to use DNS to block ads

So since computers need to have a domain translated to an IP address in order to connect to it, what happens if we just *don't do that* for domains we don't like? Well, it doesn't connect. And that's exactly what a Pihole does, you set it as your DNS server, and when anything connected to it tries to go to a domain you don't want it to, it'll just say that the domain does not exist, and probably never even existed as well.

## The problem with blocking ads on the DNS-level

Blocking ads on a DNS-level is an effective way to get rid of many ads, but it's not foolproof. It all matters on how the ad is served. Are you on genericwebsite.com and it hosts its ads on adserver123.com? Problem solved, just block adserver123.com and you can still access genericwebsite.com!
But if the site serves the ad using the same domain, what does it do then? If you're on youtube.com and it serves its ads using the youtube.com domain, what should it do? Block the entirety of YouTube? Probably not.

## The advantage

But there are advantages! Many of them! The main advantage is that it applies to any device you connect to your network, it requires no application on your end device. Don't want to see ads on your Samsung Smart Fridge? Yeah, no worries, it's gone. Annoyed of your mobile games showing ads? Gone too.
It also lets you block more than just ads and trackers. Want to block websites not safe for work? Go ahead, add a blocklist for that. Want to block all Google services from your network? There's a blocklist for that as well. It gives you control of your network again, allowing you to both monitor what domains are being accessed, and then block them in real time.

> More coming soon
>
> * [ ] Fix it
