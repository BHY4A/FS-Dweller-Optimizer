# Vault Dweller Optimizer

A browser tool for **Fallout Shelter** saves. It works out the best room for every dweller based on
their SPECIAL stats, then hands out the right outfits, weapons and pets.

Fully made by Claude.

Available at: https://bhy4a.github.io/FS-Dweller-Optimizer/

---

## Features

- **Room assignments** — matches dwellers to the rooms their stats actually suit
- **Outfits** — redistributes every outfit you own to whoever benefits most
- **Weapons** — puts the best guns in the hands of your best fighters
- **Pets** — assigns pet bonuses to the dwellers who can use them
- **Breeding suggestions** — ranks the pairings most likely to produce strong children
- **Vault map** — see your layout before and after, shaded by each room's average stat
- **Backups** — every load and export is snapshotted so you can roll back
- **Light and dark themes**, and a layout that works on phones

There's an example vault built in, so you can see what the tool does without loading your own save.

---

## Quick start

1. Download [`dist/vault-optimizer.html`](dist/vault-optimizer.html).
2. Close Fallout Shelter completely.
3. Get hold of your save file (on Android this takes an extra step — see below) and make a backup
   copy of it.
4. Open the downloaded file in your browser and drop your save onto it.
5. Press **Run all steps**, review the changes, then **Download optimized save**.
6. Copy the result back over your original, keeping the same filename.

### Where your save lives

| Platform | Path |
|---|---|
| Android | `Android/data/com.bethsoft.falloutshelter/files/Vault1.sav` |
| Windows (Steam) | `%USERPROFILE%\Documents\My Games\Fallout Shelter\` |
| Windows (Bethesda) | `%LOCALAPPDATA%Low\BethesdaSoftworks\Fallout Shelter\` |
| iOS | Through an iTunes/Finder file-share backup of the app |

The number in the filename is the save slot, not your vault number. Files ending in `.sav.bkp` are
the game's own recovery backups — leave those alone.

### Getting the file off Android

Since Android 11, apps can't browse into another app's folder under `Android/data`, and from Android
13–14 the built-in file manager is blocked too. So the folder will often look empty or refuse to
open, even though the save is there.

Two ways around it:

**Use a PC.** Connect the phone over USB with USB debugging on, then:

```bash
adb pull /sdcard/Android/data/com.bethsoft.falloutshelter/files/Vault1.sav
```

**Or use [Shizuku](https://shizuku.rikka.app/) on the phone itself.** Shizuku grants apps ADB-level
permissions without root, and file managers that support it can then read `Android/data`.

1. Install Shizuku and start its service — via wireless debugging (no PC needed) or a one-off ADB
   command from a computer. It has to be restarted after every reboot.
2. Install a file manager with Shizuku support, such as FV File Manager, ZArchiver or MiXplorer, and
   enable Shizuku in its settings.
3. Copy `Vault1.sav` out to `Downloads` first, and work on that copy — don't edit the file in place.
4. Copy the optimised file back to the same folder under the same name.

If your phone is rooted, any root-capable file manager does the same job without Shizuku.

---

## How the optimisation works

### Room assignments

Each production room is governed by one SPECIAL stat, and a dweller's output scales with it. Matching
dwellers to rooms is an **assignment problem**, solved exactly with the **Hungarian algorithm**
rather than greedily — a greedy pass gets stuck, because taking your Strength-10 dweller for the
reactor may leave the water plant with nobody good.

Production slots are scored by the dweller's effective stat:

```
score = base stat + gear bonus
```

Training rooms are scored differently, since they produce nothing today — they raise a stat over
time. So they use **growth headroom**, based on the base stat only, because gear doesn't affect
training speed:

```
score = training_weight × max(0, 10 − base stat)
```

A dweller already at 10 scores zero for that training room, which is correct — they can't improve.
Both kinds of slot are scored on the same scale in one solve, so weak dwellers end up training while
specialists take the jobs they're good at.

The **training priority** slider sets `training_weight` (default `0.20`):

- `0.00` — nobody trains, maximum output today
- `0.20` — a few of your weakest dwellers go and improve
- `0.60` — heavily favour building up the next generation

Room capacity is `min(6, max(2, mergeLevel × 2))`, except the Barbershop, which holds one dweller.

### Outfits

Every worn and stored outfit is pooled, then matched to dwellers so each bonus lands where it helps
most — scored against the stat that the dweller's **newly assigned** room needs. Also solved with the
Hungarian algorithm, which is why this step needs the room assignments first.

### Weapons

Weapons are ranked by average damage. Dwellers are ranked by a combat rating:

```
combat rating = Strength × Agility × (1 + 0.05 × (Perception + Luck)) × (max HP / 100)
```

- **Strength** pushes damage toward the top of the weapon's range
- **Agility** sets attack rate
- **Perception** slows the crit reticle, making crits easier to land
- **Luck** sets how often crit opportunities appear
- **max HP** decides how long they survive to keep attacking (the game derives it from level and
  trained Endurance)

Total firepower is `Σ (combat rating × weapon damage)`. For a sum of products like that, sorting both
lists and pairing rank-for-rank is provably optimal, so the best gun goes to the best fighter.

### Pets

A pet's bonus type and value are stored in the save itself, so the only question is who benefits:

| Bonus | Goes to |
|---|---|
| Training speed | someone assigned to a training room, with the most headroom left |
| Crafting speed/cost | someone in a workshop |
| Wasteland finds | someone currently exploring |
| Healing | the most badly hurt dweller |
| XP gain | the lowest-level dweller |
| Child SPECIAL / twins | the dweller with the highest SPECIAL total |
| Happiness | the unhappiest dweller |
| Damage / resistance / HP | the best fighter |

If nobody can use a bonus, the pet stays in storage rather than being wasted.

### Breeding

A child inherits its highest **base** stat from one parent at roughly even odds (gear doesn't count),
and a higher combined parent SPECIAL total raises the chance of a Rare or Legendary child. Charisma
speeds up conception. Pairs are ranked by combined base SPECIAL.

This step is advisory only — it isn't written to the save, because pairing in-game also requires
putting both dwellers in Living Quarters together.

---

## Room reference

**Production** — output scales with the stat:

| Room | Stat |
|---|---|
| Power Generator, Nuclear Reactor, Geothermal | Strength |
| Water Treatment, Water Purification | Perception |
| Diner, Garden, Hydroponic Farm | Agility |
| Nuka-Cola Bottler, Ultracite Mine | Endurance |
| Medbay, Science Lab | Intelligence |

**Training** — the stat itself increases over time:

| Room | Stat |
|---|---|
| Weight Room | Strength |
| Armory | Perception |
| Fitness Room | Endurance |
| Lounge | Charisma |
| Classroom | Intelligence |
| Athletics Room | Agility |
| Game Room | Luck |

**Service** — the stat speeds the room up but isn't trained: Radio Studio and Barbershop (Charisma).

**Workshops** — crafting speed depends on the specific recipe being made, which the save doesn't
record, so these use an average of all seven stats and should be treated as a rough guide.

---

## Data sources

Weapon damage and outfit bonuses come from the game's own data files, covering the full item
catalogue. Two independent extractions were cross-checked against each other and spot-checked against
the Fallout Wiki.

If a game update adds items this build hasn't seen, weapons fall back to an estimate based on the
weapon family and its quality suffix (`Rusty`, `Hardened`, `ArmorPiercing`, and so on) and are marked
**estimated** in the results. Unknown outfits are left alone rather than guessed at.
