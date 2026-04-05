# Post Haste — Game Design Document

## Concept
Portrait mobile arcade idle. You run a post office — sort mail, serve customers, expand your operation. Starts with one desk and two bins. Expands into a sprawling postal empire with international routes, customs, staff, vehicles, and special deliveries.

**Core fantasy:** The satisfaction of turning chaos into order under pressure.
**Tone:** Cozy-busy. Not stressful, but always something to do.
**Reference:** Heroll's expansion model — core interaction never changes, systems layer around it.

---

## Core Loop (The Anchor — Never Changes)

```
MOVE (joystick) → PICK UP (auto-proximity) → SORT (swipe at desk) → DELIVER (auto-proximity) → EARN → UPGRADE
```

Two modes, one thumb:
1. **Movement mode:** Virtual joystick, bottom-centre. Walk between stations. All pickups/dropoffs are auto-proximity.
2. **Sorting mode:** Triggered by walking to sorting desk. Character stops. Mail items appear one at a time. Swipe to correct bin. Speed + accuracy = bonus.

This is the "tap to roll" — it stays the same at hour 1 and hour 50. What changes is what you're sorting and what's around you.

---

## The Day (One Session = One Shift)

Each day is a timed shift (starts ~3 min, scales to ~8 min with upgrades).

### Day Flow
1. **Morning rush:** Mail arrives at incoming pile. Walk to it, auto-pickup (stack on head).
2. **Sort phase:** Walk to desk, enter sort mode. Swipe mail to correct bins.
3. **Customer service:** Customers arrive at counter wanting to send/collect. Walk to counter, auto-serve.
4. **Pickups/deliveries:** Sorted mail needs loading onto outgoing (walk to van/bike area).
5. **Random events:** VIP customer, damaged parcel, lost item, fragile delivery.
6. **End of day:** Revenue calculated. Stars awarded (1-3). Tips screen. Upgrade shop.

### Pressure (The Priority Crunch)
At any moment, 2-3 things need attention:
- Incoming pile overflowing (mail falls off = lost revenue)
- Customer waiting at counter (patience timer)
- Sorted mail ready for outgoing (van leaving soon)
- Floor dirty / something broken (reduces star rating)

Player decides WHERE to go. That routing decision IS the skill.

---

## Expansion Layers (The Heroll Model)

### Layer 0 — Tutorial (First 3 days, ~5 min)
- One incoming pile, one sorting desk, two colour-coded bins (RED / BLUE)
- Letters only (flat, light, easy to identify)
- No customers yet
- Just: pick up → sort → done
- **Teaches:** Joystick movement, auto-proximity, swipe-to-sort

### Layer 1 — Basic Post Office (Days 4-15, ~1 hour)
**Unlocks gradually, one per few days:**
- Customer counter (people want to SEND mail — auto-serve on proximity)
- Third bin (GREEN) — sort accuracy matters more
- Parcels introduced (heavier, take more stack space, wobble more)
- Outgoing van — sorted mail needs loading before van departs (timer)
- Money + basic upgrades: carry capacity, move speed, sort speed
- Post office cosmetics (paint walls, new floor)

### Layer 2 — District Expansion (Days 15-40, ~3-5 hours)
**Unlocks after clearing star thresholds:**
- Fourth bin (YELLOW) — now 4-way sorting, genuine challenge
- Districts replace colours: "Northside" / "Docks" / "Uptown" / "Old Town"
- Registered mail (needs stamping — tap-and-hold mini-task before sorting)
- First staff hire: Counter Clerk (auto-serves customers, frees you to sort)
- Bicycle delivery — you physically ride out to deliver a special parcel (mini side-mode)
- Upgrade shop expands: staff speed, desk capacity, van size

### Layer 3 — Expanding the Office (Days 40-80, ~5-10 hours)
**Unlocks via office expansion (spend money to build new rooms):**
- Second sorting desk (handle two streams)
- Parcel weighing station (walk to scale, auto-weigh, some parcels get rejected = return-to-sender bin)
- Fragile items (must carry slowly — move speed reduced when carrying fragile)
- Staff: Sorter (auto-sorts basic colour mail, you handle complex stuff)
- Staff: Driver (auto-loads outgoing van)
- Delivery van upgrades: bike → van → truck (more capacity per departure)
- Post office expansion: back room, loading dock, bigger counter area
- Daily challenge: "Rush Hour" — survive a massive mail surge for bonus rewards

### Layer 4 — Going National (Days 80-150, ~10-20 hours)
**Unlocks after reaching certain office size/reputation:**
- National mail: new address system (city codes, not just districts)
- 6+ sorting bins — spatial memory game (which bin is Manchester? London? Edinburgh?)
- Customs declaration: international parcels need form-checking (tap to inspect, swipe to approve/reject)
- Contraband detection: some parcels are suspicious (visual cues — heavy, rattling, wrong size)
- X-ray machine: walk parcel to scanner, reveals contents, decide pass/flag
- Staff specialisation: Train staff for specific tasks (counter specialist, sort specialist)
- Vehicle fleet: multiple vans with routes (assign sorted mail to correct vehicle)
- Reputation system: stars → postal service rank (Local → Regional → National)
- Perk tree: passive bonuses earned through reputation
  - "Eagle Eye" — suspicious parcels glow slightly
  - "Swift Hands" — sort swipe speed +20%
  - "Pack Mule" — carry capacity +3
  - "Smooth Talker" — customers more patient

### Layer 5 — International & Endgame (Days 150+, ~20+ hours)
- International routes: Air mail, cargo ship
- Airport customs desk (dedicated room — full inspection mini-game)
- Currency exchange: customers pay in different currencies (quick maths)
- VIP parcels: high-value items with insurance, must handle carefully
- Post office network: open branch offices (idle income from branches you've built)
- Seasonal events: Christmas rush (10x mail volume, special stamps), Valentine's (love letters bonus), Black Friday (parcel chaos)
- Leaderboard: daily shift score vs other players
- Collection book: stamp collection from different eras/countries (completionist)
- Prestige system: "Retire" and restart with permanent bonuses (Postmaster General title)

---

## Progression Systems

### Currency
| Currency | Source | Use |
|----------|--------|-----|
| Coins | Daily revenue, tips | Upgrades, staff wages, office expansion |
| Stamps | Perfect sort streaks, daily challenges | Perk tree, cosmetics |
| Reputation Stars | Day completion (1-3 stars) | Unlock new layers/districts |

### Upgrades (Between Days)
| Category | Examples |
|----------|---------|
| Character | Carry capacity, move speed, sort speed |
| Staff | Hire, train, specialise |
| Office | New rooms, bigger counter, extra desks |
| Vehicles | Bike → Van → Truck → Fleet |
| Perks | Passive bonuses from perk tree |
| Cosmetics | Office paint, uniform, desk decorations |

### The Carry Capacity Spine
This is the PRIMARY upgrade hook (proven in every arcade idle hit):
- Start: carry 3 letters
- Early: carry 5 items (mix of letters + small parcels)
- Mid: carry 8 items (trolley upgrade — visual change)
- Late: carry 15 items (cart upgrade — massive wobbling stack)
- Each upgrade is VISIBLE — stack height on character grows, wobble increases

---

## Sorting Mechanic Deep Dive

### The Desk
When player walks to sorting desk:
1. Movement joystick disappears
2. Current mail item appears centre-screen (large, readable)
3. Bin labels appear at screen edges (colour-coded)
4. Player swipes item toward correct bin
5. Item flies with physics, lands with satisfying thud + haptic
6. Next item appears immediately
7. Walk away from desk = exit sort mode, joystick returns

### Sort Complexity Progression
| Phase | Sort Criteria | Bins | Challenge |
|-------|--------------|------|-----------|
| Tutorial | Colour (red/blue) | 2 | None — learning controls |
| Early | Colour (red/blue/green) | 3 | Speed |
| Mid | District name + colour | 4 | Reading + memory |
| Late | City code + type (letter/parcel/registered) | 6 | Multi-criteria |
| Endgame | Country + customs status + priority level | 8 | Full mental sorting |

### Streak System
- Correct sorts in a row = streak multiplier (1x → 2x → 3x)
- Streak breaks on wrong sort
- Streak bonus applies to coins earned
- Visual: background gets more energetic, items glow, desk sparkles
- Audio: pitch rises with streak (rhythm game feel)

### Wrong Sort Penalty
- Item bounces back to desk (lose time, not money)
- Streak resets
- No harsh punishment — cozy, not punishing

---

## Stations

### MVP Stations (prototype)
| Station | Interaction | Mode |
|---------|------------|------|
| Incoming pile | Auto-pickup on proximity | Movement |
| Sorting desk | Swipe-to-sort | Sorting |
| Customer counter | Auto-serve on proximity | Movement |
| Outgoing area | Auto-deposit on proximity | Movement |

### Expansion Stations (post-MVP, unlocked over time)
| Station | Interaction | Unlock |
|---------|------------|--------|
| Weighing scale | Auto-weigh, shows weight, reject if over | Layer 3 |
| Stamp station | Tap-and-hold to stamp registered mail | Layer 2 |
| X-ray scanner | Walk parcel through, tap to flag suspicious | Layer 4 |
| Customs desk | Inspect form, swipe approve/reject | Layer 5 |
| Loading dock | Auto-load sorted mail onto vehicles | Layer 3 |

---

## Visual Style (Prototype)

Placeholder art — coloured shapes:
- Character: rounded rectangle with face
- Mail: coloured rectangles (letters thin, parcels thick)
- Stations: labelled rectangles with icons
- Bins: coloured squares matching sort categories
- Stack: items pile on character head, wobble with movement
- Post office: top-down view, walls as lines, floor as light colour

Portrait orientation. Camera follows character. Office scrolls as it expands.

**Colour palette:**
- Background: #F5F0E8 (warm paper)
- Primary: #2B4570 (postal blue)
- Secondary: #A37B4F (parcel brown)
- Accent: #D4483B (urgent red)
- Text: #1A1A2E (dark)

---

## Monetisation (Future — Not in Prototype)

| Method | Implementation |
|--------|---------------|
| Rewarded ads | 2x daily coins, extra shift time, instant staff training |
| IAP | Coin packs, stamp packs, cosmetic bundles |
| Battle pass | "Postmaster's Path" — daily progress track with free + premium tier |
| No energy system | Unlimited play sessions — ads are optional boosters |

---

## MVP Scope (Prototype)

What we build NOW:
- [x] Virtual joystick movement
- [x] Character with stack-on-head
- [x] Incoming mail pile (auto-pickup)
- [x] Sorting desk (swipe-to-sort, 2-3 bins)
- [x] Customer counter (auto-serve)
- [x] Outgoing area (auto-deposit)
- [x] Day timer + day end screen
- [x] Basic upgrade shop (carry capacity, move speed)
- [x] 3-star rating per day
- [x] localStorage persistence

What we DO NOT build:
- Staff / automation
- Multiple rooms / office expansion
- District system / national / international
- Vehicles beyond placeholder
- Sound / music
- Polish art
- Monetisation
- Tutorials (implicit through Layer 0 simplicity)
