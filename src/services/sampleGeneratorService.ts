import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from '../types';
import { SAMPLE_ASSETS } from '../constants/sampleAssets';
import { assetCacheService } from './assetCacheService';

const STORAGE_KEY = 'zen_timer_generated_samples';
const STARRED_KEY = 'zen_timer_starred_samples';
const CDN_BASE = 'https://zentimer-assets.b-cdn.net';
const THUMBNAILS_BASE = `${CDN_BASE}/Thumbnails`;

// Bunny.net categories with their audio tracks (from manifest.json)
// Each entry: [folder_name, [track objects with id and filename]]
interface Track {
  id: string;
  filename: string;
  folder: string;
}

// Category definitions from bunny.net manifest (real track data)
const BUNNY_CATEGORIES: Record<string, Track[]> = {
  '001 - Nature Essentials': [
    { id: '0001', filename: '0001 Soft wind.mp3', folder: '001 - Nature Essentials' },
    { id: '0003', filename: '0003 Moderate wind.mp3', folder: '001 - Nature Essentials' },
    { id: '0005', filename: '0005 Howling wind.mp3', folder: '001 - Nature Essentials' },
    { id: '0011', filename: '0011 Soft rain.mp3', folder: '001 - Nature Essentials' },
    { id: '0012', filename: '0012 Moderate rain.mp3', folder: '001 - Nature Essentials' },
    { id: '0016', filename: '0016 Thunderstorm.mp3', folder: '001 - Nature Essentials' },
    { id: '0017', filename: '0017 Sparkling stream.mp3', folder: '001 - Nature Essentials' },
    { id: '0020', filename: '0020 River.mp3', folder: '001 - Nature Essentials' },
  ],
  '002 - Winds Of Nature': [
    { id: '0139', filename: '0139 Wind modern light variable wires.mp3', folder: '002 - Winds Of Nature' },
    { id: '0140', filename: '0140 Wind modern variable building.mp3', folder: '002 - Winds Of Nature' },
    { id: '0142', filename: '0142 Wind modern variable whistling wires.mp3', folder: '002 - Winds Of Nature' },
    { id: '0144', filename: '0144 Wind modern moderate roar howl wires.mp3', folder: '002 - Winds Of Nature' },
    { id: '0146', filename: '0146 Wind modern howling wires.mp3', folder: '002 - Winds Of Nature' },
  ],
  '003 - Thunder And Rain': [
    { id: '0270', filename: '0270 Thunder close.mp3', folder: '003 - Thunder And Rain' },
    { id: '0274', filename: '0274 Thunder long peel.mp3', folder: '003 - Thunder And Rain' },
    { id: '0276', filename: '0276 Thunder echo.mp3', folder: '003 - Thunder And Rain' },
    { id: '0280', filename: '0280 Rain steady.mp3', folder: '003 - Thunder And Rain' },
    { id: '0292', filename: '0292 Rain quiet light tone.mp3', folder: '003 - Thunder And Rain' },
  ],
  '004 - Flowing Water': [
    { id: '0336', filename: '0336 Cave drippy.mp3', folder: '004 - Flowing Water' },
    { id: '0339', filename: '0339 Trickle songful.mp3', folder: '004 - Flowing Water' },
    { id: '0341', filename: '0341 Streamlet.mp3', folder: '004 - Flowing Water' },
    { id: '0337', filename: '0337 Snow melting.mp3', folder: '004 - Flowing Water' },
    { id: '0340', filename: '0340 Trickle rapid.mp3', folder: '004 - Flowing Water' },
  ],
  '005 - Waves': [
    { id: '0456', filename: '0456 Water lap slow.mp3', folder: '005 - Waves' },
    { id: '0458', filename: '0458 Water lap gentle.mp3', folder: '005 - Waves' },
    { id: '0462', filename: '0462 Surf micro.mp3', folder: '005 - Waves' },
    { id: '0460', filename: '0460 Water lap rock.mp3', folder: '005 - Waves' },
    { id: '0463', filename: '0463 Surf micro sweeping.mp3', folder: '005 - Waves' },
  ],
  '006 - Prairies': [
    { id: '0567', filename: '0567 Dawn early.mp3', folder: '006 - Prairies' },
    { id: '0569', filename: '0569 Dawn chorus.mp3', folder: '006 - Prairies' },
    { id: '0572', filename: '0572 Dawn chorus western meadowlark.mp3', folder: '006 - Prairies' },
    { id: '0568', filename: '0568 Dawn.mp3', folder: '006 - Prairies' },
  ],
  '007 - Tropical Forests': [
    { id: '0672', filename: '0672 Evening.mp3', folder: '007 - Tropical Forests' },
    { id: '0673', filename: '0673 Nightfall.mp3', folder: '007 - Tropical Forests' },
    { id: '0676', filename: '0676 Night.mp3', folder: '007 - Tropical Forests' },
    { id: '0679', filename: '0679 Night zephyr.mp3', folder: '007 - Tropical Forests' },
    { id: '0675', filename: '0675 Night early.mp3', folder: '007 - Tropical Forests' },
  ],
  '008 - Deciduous Forests': [
    { id: '0825', filename: '0825 Early bird.mp3', folder: '008 - Deciduous Forests' },
    { id: '0829', filename: '0829 Dawn chorus.mp3', folder: '008 - Deciduous Forests' },
    { id: '0831', filename: '0831 Dawn chorus busy.mp3', folder: '008 - Deciduous Forests' },
    { id: '0826', filename: '0826 Dawn onset.mp3', folder: '008 - Deciduous Forests' },
    { id: '0832', filename: '0832 Dawn chorus active.mp3', folder: '008 - Deciduous Forests' },
  ],
  '009 - Wetlands': [
    { id: '1017', filename: '1017 Swamp early morning trickle.mp3', folder: '009 - Wetlands' },
    { id: '1018', filename: '1018 Swamp early morning breeze.mp3', folder: '009 - Wetlands' },
    { id: '1020', filename: '1020 Swamp early morning frogs V1.mp3', folder: '009 - Wetlands' },
    { id: '1022', filename: '1022 Swamp morning frogs.mp3', folder: '009 - Wetlands' },
    { id: '1024', filename: '1024 Swamp morning birds mosquitoes.mp3', folder: '009 - Wetlands' },
  ],
  '010 - Upwellings': [
    { id: '1213', filename: '1213 Geothermal bubbles V1.mp3', folder: '010 - Upwellings' },
    { id: '1214', filename: '1214 Geothermal bubbles V2.mp3', folder: '010 - Upwellings' },
    { id: '1217', filename: '1217 Geothermal bubbles churning.mp3', folder: '010 - Upwellings' },
    { id: '1218', filename: '1218 Geothermal bubbles steam.mp3', folder: '010 - Upwellings' },
  ],
  '011 - Coniferous Forests': [
    { id: '1244', filename: '1244 Quiet dawn.mp3', folder: '011 - Coniferous Forests' },
    { id: '1245', filename: '1245 Early morning Bird chorus V1.mp3', folder: '011 - Coniferous Forests' },
    { id: '1247', filename: '1247 Morning Bird chorus.mp3', folder: '011 - Coniferous Forests' },
    { id: '1249', filename: '1249 Morning Bird chorus active spacious V1.mp3', folder: '011 - Coniferous Forests' },
  ],
  '012 - Canyons': [
    { id: '1425', filename: '1425 Dawn stillness.mp3', folder: '012 - Canyons' },
    { id: '1429', filename: '1429 Dawn chorus.mp3', folder: '012 - Canyons' },
    { id: '1430', filename: '1430 Dawn chorus active diverse V1.mp3', folder: '012 - Canyons' },
    { id: '1432', filename: '1432 Morning birds.mp3', folder: '012 - Canyons' },
  ],
  '013 - Deserts': [
    { id: '1560', filename: '1560 Dawn songbirds diverse spacious.mp3', folder: '013 - Deserts' },
    { id: '1561', filename: '1561 Dawn birds building.mp3', folder: '013 - Deserts' },
    { id: '1563', filename: '1563 Dawn very active songbirds.mp3', folder: '013 - Deserts' },
    { id: '1565', filename: '1565 Morning birds winged insects sparse V1.mp3', folder: '013 - Deserts' },
  ],
  '014 - Quietudes': [
    { id: '1715', filename: '1715 Campfire embers.mp3', folder: '014 - Quietudes' },
    { id: '1716', filename: '1716 Natural silence.mp3', folder: '014 - Quietudes' },
    { id: '1719', filename: '1719 Dawn spacious.mp3', folder: '014 - Quietudes' },
    { id: '1720', filename: '1720 Dawn expansive V1.mp3', folder: '014 - Quietudes' },
  ],
  '015 - Riparian Zones': [
    { id: '1815', filename: '1815 Stream dawn songbirds.mp3', folder: '015 - Riparian Zones' },
    { id: '1816', filename: '1816 Trickle morning songbirds V1.mp3', folder: '015 - Riparian Zones' },
    { id: '1821', filename: '1821 Wetland trickle morning songbirds V1.mp3', folder: '015 - Riparian Zones' },
    { id: '1818', filename: '1818 Trickle morning songbirds V3.mp3', folder: '015 - Riparian Zones' },
  ],
  '016 - Ocean Shores': [
    { id: '1947', filename: '1947 Day Bird chorus calm water V1.mp3', folder: '016 - Ocean Shores' },
    { id: '1948', filename: '1948 Day Bird chorus calm water V2.mp3', folder: '016 - Ocean Shores' },
    { id: '1951', filename: '1951 Day birds waves rippling close.mp3', folder: '016 - Ocean Shores' },
    { id: '1953', filename: '1953 Day birds waves gurgling close.mp3', folder: '016 - Ocean Shores' },
  ],
  '017 - Hawaii': [
    { id: '2048', filename: '2048 Waves gentle sandy.mp3', folder: '017 - Hawaii' },
    { id: '2050', filename: '2050 Waves gentle sandy rolling with bubbles.mp3', folder: '017 - Hawaii' },
    { id: '2052', filename: '2052 Waves gentle sandy birds faint.mp3', folder: '017 - Hawaii' },
    { id: '2055', filename: '2055 Waves lava cliff shaking.mp3', folder: '017 - Hawaii' },
  ],
};

// Map bunny categories to UNIQUE thumbnail images (no duplicates across categories)
const CATEGORY_IMAGES: Record<string, string[]> = {
  '001 - Nature Essentials': [
    'wild_wind.jpg', 'wind_through_the_trees.jpg', 'flowing_river.jpg',
  ],
  '002 - Winds Of Nature': [
    'wintery_wind.jpg', 'british_countryside_ambience.jpg', 'storm_clouds.jpg',
  ],
  '003 - Thunder And Rain': [
    'rain_and_thunder.jpg', 'epic_thunderstorm_in_johannesburg.jpg', 'summer_storm.jpg',
  ],
  '004 - Flowing Water': [
    'babbling_brook.jpg', 'gentle_waterfall.jpg', 'scandinavian_stream.jpg',
  ],
  '005 - Waves': [
    'crashing_waves.jpg', 'lapping_waves.jpg', 'ocean_waves_in_madagascar.jpg',
  ],
  '006 - Prairies': [
    'dusk_in_the_country.jpg', 'sardinia_by_night.jpg', 'dawn_chorus_scotland.jpg',
  ],
  '007 - Tropical Forests': [
    'jungle_book_forest.jpg', 'amazon_jungle.jpg', 'dusk_in_the_borneo_rainforest.jpg',
  ],
  '008 - Deciduous Forests': [
    'woodlands_at_dawn.jpg', 'transylvania_forest.jpg', 'pure_sound_of_rain_in_the_forest.jpg',
  ],
  '009 - Wetlands': [
    'frogs_and_birds.jpg', 'frogs_croaking_in_the_cloud_forest.jpg', 'moonlight_chorus.jpg',
  ],
  '010 - Upwellings': [
    'active_volcano.jpg', 'underwater_glacier.jpg', 'dripping_cave.jpg',
  ],
  '011 - Coniferous Forests': [
    'pine_forest.jpg', 'himalayan_dawn.jpg', 'nordic_creek_and_birds.jpg',
  ],
  '012 - Canyons': [
    'desert_sounds.jpg', 'the_expanse.jpg', 'horizon.jpg',
  ],
  '013 - Deserts': [
    'campfire_in_the_savanna.jpg', 'outback_sunrise.jpg', 'balmy_evening.jpg',
  ],
  '014 - Quietudes': [
    'gentle_dewdrops_and_birdsong.jpg', 'sunrise_birdcall.jpg', 'forest_mornings.jpg',
  ],
  '015 - Riparian Zones': [
    'dusk_by_a_stream.jpg', 'himalayan_stream.jpg', 'spring_garden.jpg',
  ],
  '016 - Ocean Shores': [
    'island_paradise.jpg', 'windswept_beach.jpg', 'ocean_seagulls.jpg',
  ],
  '017 - Hawaii': [
    'tropical_nights.jpg', 'rainy_day_on_a_pacific_island.jpg', 'calm_waters.jpg',
  ],
};

const CATEGORIES = Object.keys(BUNNY_CATEGORIES);

function toDisplayName(filename: string): string {
  // Remove ID prefix and extension: "0003 Moderate wind.mp3" -> "Moderate Wind"
  return filename
    .replace(/^\d+\s+/, '')  // Remove leading numbers
    .replace(/\.mp3$/i, '')  // Remove extension
    .replace(/V\d+$/i, '')   // Remove version suffix
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function encodeUrl(str: string): string {
  return encodeURIComponent(str).replace(/%20/g, '%20');
}

function createAsset(track: Track, imageFilename: string): Asset {
  const folderEncoded = encodeUrl(track.folder);
  const filenameEncoded = encodeUrl(track.filename);

  return {
    id: `bunny_${track.id}`,
    displayName: toDisplayName(track.filename),
    type: 'ambient',
    category: track.folder.replace(/^\d+\s*-\s*/, ''), // Remove "001 - " prefix
    audioUrl: `${CDN_BASE}/${folderEncoded}/${filenameEncoded}`,
    imageUrl: `${THUMBNAILS_BASE}/${imageFilename}`,
  };
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

/**
 * Generate a new set of sample assets by picking one random track from each category.
 * Results in 17 tracks total (17 categories × 1).
 * Each track gets a random relevant image from its category's image pool.
 */
export function generateRandomSamples(): Asset[] {
  const samples: Asset[] = [];

  for (const category of CATEGORIES) {
    const tracks = BUNNY_CATEGORIES[category];
    const images = CATEGORY_IMAGES[category] || ['calm_waters.jpg'];

    // Pick 1 random track from this category
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

    // Pick a random relevant image for this track
    const randomImage = images[Math.floor(Math.random() * images.length)];

    samples.push(createAsset(randomTrack, randomImage));
  }

  return samples;
}

/**
 * Save generated samples to AsyncStorage.
 */
export async function saveSamples(samples: Asset[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch (error) {
    console.error('Failed to save samples:', error);
  }
}

/**
 * Load saved samples from AsyncStorage.
 * Returns null if no saved samples exist.
 */
export async function loadSamples(): Promise<Asset[] | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as Asset[];
    }
  } catch (error) {
    console.error('Failed to load samples:', error);
  }
  return null;
}

/**
 * Generate new samples and save them.
 */
export async function generateAndSave(): Promise<Asset[]> {
  const samples = generateRandomSamples();
  await saveSamples(samples);
  return samples;
}

/**
 * Load existing samples or return defaults if none exist.
 * Does NOT auto-generate - returns SAMPLE_ASSETS as fallback.
 */
export async function getOrCreateSamples(): Promise<Asset[]> {
  const saved = await loadSamples();
  if (saved && saved.length > 0) {
    return saved;
  }
  // Return default samples without generating new ones
  return SAMPLE_ASSETS;
}

/**
 * Save starred sample IDs to AsyncStorage.
 */
export async function saveStarredIds(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STARRED_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('Failed to save starred IDs:', error);
  }
}

/**
 * Load starred sample IDs from AsyncStorage.
 */
export async function loadStarredIds(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(STARRED_KEY);
    if (stored) {
      return JSON.parse(stored) as string[];
    }
  } catch (error) {
    console.error('Failed to load starred IDs:', error);
  }
  return [];
}

/**
 * Get the category for a given asset.
 */
export function getCategoryForAsset(asset: Asset): string | null {
  for (const [category, tracks] of Object.entries(BUNNY_CATEGORIES)) {
    if (tracks.some(t => `bunny_${t.id}` === asset.id)) {
      return category;
    }
  }
  return null;
}

/**
 * Generate new samples, keeping starred assets in place.
 * Starred categories are locked - no new tracks from those categories.
 */
export function generateWithStarred(
  currentAssets: Asset[],
  starredIds: string[]
): Asset[] {
  // Find which categories are locked (have starred assets)
  const lockedCategories = new Set<string>();
  const starredAssets: Asset[] = [];

  for (const asset of currentAssets) {
    if (starredIds.includes(asset.id)) {
      const category = getCategoryForAsset(asset);
      if (category) {
        lockedCategories.add(category);
        starredAssets.push(asset);
      }
    }
  }

  // Generate new samples for unlocked categories only
  const newSamples: Asset[] = [];

  for (const category of CATEGORIES) {
    if (lockedCategories.has(category)) {
      // Keep the starred asset from this category
      const starredFromCategory = starredAssets.find(
        a => getCategoryForAsset(a) === category
      );
      if (starredFromCategory) {
        newSamples.push(starredFromCategory);
      }
    } else {
      // Generate new random track for this category
      const tracks = BUNNY_CATEGORIES[category];
      const images = CATEGORY_IMAGES[category] || ['calm_waters.jpg'];
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
      const randomImage = images[Math.floor(Math.random() * images.length)];
      newSamples.push(createAsset(randomTrack, randomImage));
    }
  }

  return newSamples;
}

/**
 * Generate new samples (preserving starred) and save them.
 * Clears the image cache to ensure fresh downloads.
 */
export async function generateAndSaveWithStarred(
  currentAssets: Asset[],
  starredIds: string[]
): Promise<Asset[]> {
  // Clear image cache to remove any corrupted cached images
  await assetCacheService.clearCache();
  const samples = generateWithStarred(currentAssets, starredIds);
  await saveSamples(samples);
  return samples;
}
