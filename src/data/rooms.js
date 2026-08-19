// Room definitions.
// Which SPECIAL stat governs each room, and how each is labelled. Training
// rooms raise the stat itself; service rooms merely run faster.

// ============================================================
// ROOM -> SPECIAL MAPPING
// ============================================================
export const ROOM_STAT_MAP = {
  // Resource production
  Energy1: { stat: 1, group: 'production', label: 'Power Generator' },
  Energy2: { stat: 1, group: 'production', label: 'Power Generator' },
  Energy3: { stat: 1, group: 'production', label: 'Nuclear Reactor' },
  NuclearReactor: { stat: 1, group: 'production', label: 'Nuclear Reactor' },
  Geothermal: { stat: 1, group: 'production', label: 'Geothermal Plant' },
  Water1: { stat: 2, group: 'production', label: 'Water Treatment' },
  Water2: { stat: 2, group: 'production', label: 'Water Treatment' },
  Water3: { stat: 2, group: 'production', label: 'Water Purification' },
  WaterPlant: { stat: 2, group: 'production', label: 'Water Purification' },
  Diner: { stat: 6, group: 'production', label: 'Diner' },
  Cafeteria: { stat: 6, group: 'production', label: 'Diner' },
  Garden: { stat: 6, group: 'production', label: 'Garden' },
  Hydroponic: { stat: 6, group: 'production', label: 'Hydroponic Farm' },
  NukaCola: { stat: 3, group: 'production', label: 'Nuka-Cola Bottler' },
  NukaColaBottler: { stat: 3, group: 'production', label: 'Nuka-Cola Bottler' },
  UltraciteMining: { stat: 3, group: 'production', label: 'Ultracite Mine' },
  // Consumables
  MedBay: { stat: 5, group: 'consumable', label: 'Medbay' },
  ScienceLab: { stat: 5, group: 'consumable', label: 'Science Lab' },
  // Service rooms: the dweller's stat speeds up the room's own process but
  // does NOT train that stat into the dweller.
  Radio: { stat: 4, group: 'facility', label: 'Radio Studio' },
  BarberShop: { stat: 4, group: 'facility', label: 'Barbershop' },
  // Training rooms: these genuinely raise the dweller's base SPECIAL.
  Gym: { stat: 1, group: 'training', label: 'Weight Room' },
  WeightRoom: { stat: 1, group: 'training', label: 'Weight Room' },
  Dojo: { stat: 6, group: 'training', label: 'Athletics Room' },
  AthleticsRoom: { stat: 6, group: 'training', label: 'Athletics Room' },
  Armory: { stat: 2, group: 'training', label: 'Armory' },
  Classroom: { stat: 5, group: 'training', label: 'Classroom' },
  SuperRoom2: { stat: 3, group: 'training', label: 'Fitness Room' },
  FitnessRoom: { stat: 3, group: 'training', label: 'Fitness Room' },
  Bar: { stat: 4, group: 'training', label: 'Lounge' },
  Lounge: { stat: 4, group: 'training', label: 'Lounge' },
  Casino: { stat: 7, group: 'training', label: 'Game Room' },
  GameRoom: { stat: 7, group: 'training', label: 'Game Room' },
  // Crafting: speed depends on the specific recipe being worked, not on one
  // fixed room stat, so this stays an average-of-all-SPECIAL approximation.
  WeaponFactory: { stat: 'ALL', group: 'crafting', label: 'Weapon Workshop' },
  OutfitFactory: { stat: 'ALL', group: 'crafting', label: 'Outfit Workshop' },
  DesignFactory: { stat: 'ALL', group: 'crafting', label: 'Theme Workshop' },
  DecorationFactory: { stat: 'ALL', group: 'crafting', label: 'Decoration Workshop' },
  UltraciteWeaponFactory: { stat: 'ALL', group: 'crafting', label: 'Ultracite Workshop' },
};

export const STAT_NAMES = {
  1: 'Strength', 2: 'Perception', 3: 'Endurance', 4: 'Charisma',
  5: 'Intelligence', 6: 'Agility', 7: 'Luck', ALL: 'Mixed (recipe-dependent)',
};
export const STAT_LETTERS = { 1: 'S', 2: 'P', 3: 'E', 4: 'C', 5: 'I', 6: 'A', 7: 'L', ALL: '?' };
