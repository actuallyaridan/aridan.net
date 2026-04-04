---
title: "Hello, Liquid Glass"
date: "30/03/2026"
link: "/articles/liquid-glass"
---

## Liquid Glass?

If you've been following Apple's software updates, you've probably heard of Liquid Glass. It's the new design language Apple introduced with iOS 26 and macOS 26 Tahoe, and it's essentially a revival of the glass-based UI aesthetics that peaked with Windows 7's Aero and early iOS. Translucent surfaces, subtle blur, specular highlights, and a sense of depth. It looks like actual glass sitting on top of your content.

## Alright, so what's happening?
I've always had a soft spot for this kind of design. I run a Windows 7 Aero skin on my Linux desktop, so when Apple announced Liquid Glass I was immediately interested. It felt like a vindication of an aesthetic that got abandoned too early.
The real implementation in macOS and iOS uses hardware-accelerated refraction and light dispersion that isn't really possible in CSS. But you can get surprisingly close with backdrop-filter, subtle transparency, and layered box-shadow to simulate the specular highlight on the top edge of the glass.

On this website I've applied it to the Apple Music widget and the navigation pill, the indicator that follows your cursor as you move between nav items. The widget uses a frosted glass treatment with a soft border and inner highlight. The nav pill is solid when resting on the active item, and transitions to glass when you hover, which I think is a nice touch. And there's more to come!

It's not a perfect recreation of what Apple shipped, but it doesn't need to be. It fits the site, it's subtle, and it adds a layer of polish that I'm happy with. Sometimes that's enough.