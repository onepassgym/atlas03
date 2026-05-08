'use strict';

const WORDS = [
  'TIGER','EAGLE','WOLF','BULL','BEAR','LION','HAWK','LYNX',
  'COBRA','VIPER','CRANE','RAVEN','BISON','MOOSE','PUMA',
  'BOLT','IRON','APEX','FLUX','PEAK','FORGE','STORM','NOVA',
  'BLAZE','SURGE','PULSE','FORCE','DRIVE','SPARK','FLARE',
  'STONE','STEEL','FROST','EMBER','RIDGE','CLIFF','DUNE',
  'CEDAR','MAPLE','FLINT','SLATE','ONYX','SWIFT','DASH',
  'VAULT','LEAP','RUSH','CLIMB','THRUST','PIVOT','GRIND',
  'GRIT','CORE','TITAN','VALOR','CREST','CROWN','SHIELD',
  'LANCE','ARROW','SPEAR','BLADE','RIVER','THUNDER','SOLAR',
  'LUNAR','ORBIT','ZENITH','DELTA','SIGMA','ATLAS','ORION',
  'PHOENIX','FALCON','CONDOR','JAGUAR','PANTHER','CHEETAH',
  'BRONCO','MUSTANG','RAPIDS','SUMMIT','CANYON','TUNDRA',
  'SIERRA','DRAKE','OSPREY','KESTREL','MERLIN','SABLE',
  'DINGO','RHINO','MAMBA','PYTHON','NOMAD','RANGER','SCOUT',
  'ROVER','REBEL','MAVERICK','CIPHER','AXIOM','NEXUS','VERTEX',
  'HUSTLE','PUSH','SPRINT','GLIDE','LAUNCH','QUARTZ','SAVANNA',
  'SMOKE','COMET','VORTEX','TORQUE','DYNAMO','RECON',
  'RAMPART','ZENON','STRIDER','BRAWL','KODIAK','RAPTOR',
  'LANCER','SPECTER','OBSIDIAN','GRANITE'
];

const POOL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateOpgId() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const key = Array.from({ length: 4 }, () =>
    POOL[Math.floor(Math.random() * POOL.length)]).join('');
  return `OPG-${word}-${key}`;
}

async function generateUniqueOpgId(GymModel) {
  let id, exists, attempts = 0;
  do {
    if (attempts > 100) throw new Error('opgId generation exceeded 100 attempts');
    id = generateOpgId();
    exists = await GymModel.exists({ opgId: id });
    attempts++;
  } while (exists);
  return id;
}

function isValidOpgId(str) {
  return /^OPG-[A-Z]+-[A-Z2-9]{4}$/.test(str);
}

module.exports = { generateOpgId, generateUniqueOpgId, isValidOpgId };
