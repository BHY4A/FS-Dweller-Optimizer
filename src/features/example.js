// Generated demo vault.
// Built in code rather than shipped as a real save, and deliberately
// mismanaged so every step has something to fix.

// ============================================================
// EXAMPLE VAULT
// A small, deliberately badly-run vault, generated rather than shipped as
// somebody's real save file. Every step of the tool has something obvious to
// fix here: strong dwellers are in the wrong rooms, the training room is
// empty, better gear is sitting in storage, two dwellers are unarmed, pets
// are unassigned and nobody is paired up.
// ============================================================
export function makeExampleSave() {
  let seq = 0;
  const dwellers = [];

  // stats given as [S,P,E,C,I,A,L]; index 0 of the saved array is unused.
  function dweller(name, lastName, gender, level, special, opts) {
    opts = opts || {};
    const maxHealth = 100 + (level - 1) * (2.5 + special[2]);
    const stats = [{ value: 1, mod: 0, exp: 0 }];
    special.forEach(v => stats.push({ value: v, mod: 0, exp: 0 }));
    const d = {
      serializeId: ++seq, name, lastName, gender,
      deathTime: -1, pregnant: false, babyReady: false, sawIncident: false,
      savedRoom: -1, assigned: false, wasTemporarilyAssigned: false,
      WillBeEvicted: false, WillGoToWasteland: false, IsEvictedWaitingForFollowers: false,
      rarity: opts.rarity || 'Normal',
      hair: 'Hair1', hairColor: '#3a2a1a', skinColor: '#e8b48a',
      outfitColor: '#2b6cb0', faceMask: -1,
      experience: { experienceValue: level * 100, currentLevel: level, needLvUp: false,
        storage: 0, accum: 0, wastelandExperience: 0 },
      health: { healthValue: opts.hurt ? maxHealth * opts.hurt : maxHealth,
        radiationValue: 0, maxHealth, permanentRadiationValue: 0, lastLevelUpdated: level },
      happiness: { happinessValue: opts.happy != null ? opts.happy : 85 },
      relations: { partner: -1, lastPartner: -1, relationshipType: 0, ascendants: [], marriageCount: 0 },
      stats: { stats },
      equipedOutfit: { id: opts.outfit || 'jumpsuit', type: 'Outfit',
        hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false },
      equipedWeapon: { id: opts.weapon || 'Fist', type: 'Weapon',
        hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false },
      lastChildBorn: '0001-01-01T00:00:00', deathSource: 0,
      pendingExperienceReward: 0, uniqueData: null,
    };
    dwellers.push(d);
    return d.serializeId;
  }

  // --- the roster -------------------------------------------------
  // Strong backs stuck in the diner, quick hands stuck on the reactor:
  // exactly the kind of mismatch Step 1 exists to unpick.
  const brick   = dweller('Brick',   'Halloran', 2, 22, [9, 3, 7, 2, 2, 3, 4], { weapon: 'Rifle_Rusty' });
  const marla   = dweller('Marla',   'Vance',    1, 19, [8, 4, 6, 3, 2, 4, 3], { weapon: 'Fist' });
  const dez     = dweller('Dez',     'Okonkwo',  2, 17, [2, 9, 3, 4, 3, 5, 4], { weapon: 'Pistol_Rusty' });
  const wren    = dweller('Wren',    'Sable',    1, 20, [3, 8, 4, 3, 4, 6, 5], { weapon: 'Fist' });
  const juno    = dweller('Juno',    'Reyes',    1, 24, [3, 3, 4, 4, 9, 4, 5], { weapon: 'BBGun', rarity: 'Rare' });
  const oscar   = dweller('Oscar',   'Pike',     2, 15, [2, 2, 3, 3, 8, 5, 3], { weapon: 'BBGun_Rusty' });
  const tilly   = dweller('Tilly',   'Marsh',    1, 18, [4, 3, 5, 3, 3, 9, 4], { weapon: 'Pistol' });
  const cass    = dweller('Cass',    'Ferro',    1, 21, [3, 4, 4, 9, 3, 4, 6], { weapon: 'Fist', happy: 72 });
  const bo      = dweller('Bo',      'Nkemdi',   2, 12, [5, 4, 8, 2, 2, 3, 3], { weapon: 'Melee_Pickaxe', hurt: 0.42 });
  const mack    = dweller('Mack',    'Duval',    2, 14, [6, 5, 5, 4, 3, 5, 4], { weapon: 'Shotgun_Rusty' });
  const ines    = dweller('Ines',    'Barros',   1, 16, [4, 6, 4, 5, 4, 4, 3], { weapon: 'Fist' });
  const yuki    = dweller('Yuki',    'Tanabe',   1, 13, [3, 4, 4, 6, 5, 4, 4], { weapon: 'Fist' });
  // Rookies with plenty of headroom — the ones Step 1 should send to train
  // rather than leave standing in a job they are bad at.
  const pip     = dweller('Pip',     'Ashford',  2,  4, [2, 2, 2, 2, 2, 2, 2], { happy: 68 });
  const noor    = dweller('Noor',    'Haddad',   1,  3, [1, 2, 2, 3, 2, 1, 2], { happy: 70 });
  const gideon  = dweller('Gideon',  'Frost',    2,  5, [2, 1, 3, 2, 2, 2, 1]);
  const solveig = dweller('Solveig', 'Aas',      1,  6, [3, 2, 2, 2, 3, 2, 2]);

  // --- the layout --------------------------------------------------
  // Columns are thirds of a room; a room spans mergeLevel*3, elevators span 1.
  // Deliberately fewer production seats than dwellers, so the optimiser has a
  // real decision to make about who works and who trains.
  const rooms = [];
  let rid = 0;
  function room(type, row, col, mergeLevel, level, occupants) {
    rooms.push({
      type, row, col, mergeLevel, level: level || 1,
      dwellers: occupants || [], deadDwellers: [], mrHandyList: [],
      power: true, broken: false, emergencyDone: false, rushTask: -1,
      roomHealth: { damageValue: 100, initialValue: 100 },
      currentStateName: 'Idle', currentState: {},
      deserializeID: ++rid, assignedDecoration: '',
      roomVisibility: false, roomOutline: false, class: 'Facility',
    });
  }

  room('Entrance',       0, 0,  2, 1, []);
  room('Elevator',       0, 6,  1, 1, []);
  // Reactor run by the quick and the raw instead of the two strongest.
  room('Energy2',        1, 0,  2, 2, [tilly, dez, pip, noor]);
  room('Elevator',       1, 6,  1, 1, []);
  room('LivingQuarters', 1, 7,  2, 2, [gideon, solveig, yuki, ines]);
  // Water plant staffed by the heavy lifters, who have no Perception at all.
  room('WaterPlant',     2, 0,  1, 2, [brick, marla]);
  room('Cafeteria',      2, 3,  1, 2, [juno, oscar]);   // scientists on the food line
  room('Elevator',       2, 6,  1, 1, []);
  room('Gym',            2, 7,  2, 1, []);              // nobody training at all
  room('MedBay',         3, 0,  1, 1, [bo, mack]);
  room('Radio',          3, 3,  1, 1, [wren, cass]);    // Cass has the Charisma; Wren does not
  room('Elevator',       3, 6,  1, 1, []);
  room('Storage',        3, 7,  2, 2, []);

  // --- storage: the good gear nobody is wearing --------------------
  const items = [];
  const add = (id, type, n, extra) => {
    for (let i = 0; i < n; i++) {
      items.push(Object.assign({ id, type, hasBeenAssigned: false, hasRandonWeaponBeenAssigned: false }, extra || {}));
    }
  };
  add('MilitaryJumpsuit_Officer', 'Outfit', 1);   // +5 Strength
  add('UtilityJumpsuit_Sturdy',   'Outfit', 1);   // +5 Perception
  add('LabCoat_Advanced',         'Outfit', 1);   // +5 Intelligence
  add('HandymanJumpsuit',         'Outfit', 1);   // +3 Agility
  add('AllNightware_Naughty',     'Outfit', 1);   // +5 Charisma
  add('WandererArmor',            'Outfit', 2);
  add('HuntingRifle_Hardened',    'Weapon', 1);
  add('LaserPistol',              'Weapon', 1);
  add('SawedOffShotgun',          'Weapon', 1);
  add('Rifle_Enhanced',           'Weapon', 1);
  add('doberman_c', 'Pet', 1, { extraData: { uniqueName: 'Scrap', bonus: 'HealingBoost', bonusValue: 3 } });
  add('germanshepherd_c', 'Pet', 1, { extraData: { uniqueName: 'Rufus', bonus: 'TrainingBoost', bonusValue: 25 } });
  add('tabby_c', 'Pet', 1, { extraData: { uniqueName: 'Ash', bonus: 'XPBoost', bonusValue: 15 } });

  return {
    vault: {
      VaultName: '111', VaultMode: 'Normal', VaultTheme: 0,
      rooms, inventory: { items },
      storage: { resources: { Nuka: 120, Food: 240, Energy: 180, Water: 210, StimPack: 6, RadAway: 3 },
        bonus: {}, curr: {} },
      wasteland: { teams: [], state: 0 },
      LunchBoxesByType: [], LunchBoxesCount: 0,
      emergencyData: { active: false, currentWave: 0 },
      dwellerFoodConsumption: {}, dwellerWaterConsumption: {}, roomConsumption: {},
    },
    dwellers: { dwellers, actors: [], id: seq + 1, mrhId: 1, min_happiness: 50 },
    questDwellers: { dwellers: [] },
    appVersion: 'example', deviceName: 'Example Vault',
    timeMgr: {}, taskMgr: {}, objectiveMgr: {}, unlockableMgr: {}, happinessManager: {},
    refugeeSpawner: {}, dwellerSpawner: {}, tutorialManager: {}, survivalW: {},
  };
}
