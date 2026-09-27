# Product Specification

**Project Name:** Star-Builder (Working Title)  
**Document Version:** 0.0.1  
**Status:** Draft / Initial Specification

---

## Executive Summary & Concept Overview

**Star-Builder** is a persistent, multiplayer web application that bridges the gap between sentimental online star registration, digital real-estate advertising, and creative retro sandbox gaming (such as _Terraria_ or _Starbound_).

Users explore a stylized **night-sky view** of a shared galaxy field. The claimable universe is the finite **BSC5P catalog (~9,101 real stars)** rendered through a gnomonic projection (see _How the star map should be generated from the star catalog data_) so the pan/zoom experience mimics looking through a telescope. On this map, users can purchase, name, and dedicate vacant catalog stars. Upon claiming a star, the user receives an associated $32 \times 32$ pixel construction plot anchored directly to their celestial location. Using an integrated 2D pixel-art builder engine, owners can construct custom pixel structures, sci-fi habitats, neon billboards, monuments, or creative art pieces that are permanently rendered onto the public universe map for all visitors to discover.

---

## Core User Experience & Application Loop

The user interaction follows a tightly designed 4-step loop:

```
┌─────────────────────────────────────────────────────────┐
│ 1. EXPLORE & SELECT                                     │
│ Navigate the night sky, locate vacant catalog stars,     │
│ and inspect registered star structures and dedications.  │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 2. RESERVE & PURCHASE                                   │
│ Name the star, author a 280-char dedication, lock plot   │
│ for 5 minutes, and complete checkout via Stripe.        │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 3. BUILD & CUSTOMIZE                                    │
│ Access the 2D tile editor to build a pixel structure     │
│ on the assigned 32x32 grid around the star anchor.      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 4. PUBLISH & SHARE                                      │
│ Changes commit live to the shared galaxy map.           │
│ Share unique stars via direct deep-link URLs.           │
└─────────────────────────────────────────────────────────┘
```

---

## Target Audience & Primary Use Cases

- **Sentimental Gifting:** Purchasing and building personalized virtual monuments for birthdays, anniversaries, or memorials with a custom dedication message.
- **Brands, Web3 Projects & Advertisers:** Companies claiming high-visibility bright stars to build pixel-art logos, neon signs, and direct hyperlinks to promotional campaigns.
- **Gamers & Digital Artists:** Fans of sandbox tile games building intricate retro pixel art, mini-dungeons, or orbital habitats within a shared universe canvas.

---