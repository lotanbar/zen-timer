import { Asset } from '../types';

const CDN_BASE = 'https://zentimer-assets.b-cdn.net/000%20-%20Samples';
const GITHUB_IMG_BASE = 'https://raw.githubusercontent.com/lotanbar/zen-timer-assets/master/ambient_by_category';

// DEBUG: Test tone for diagnosing loop issues
export const DEBUG_TEST_ASSET: Asset = {
  id: 'debug_stream_120s',
  displayName: '🔧 120s TEST',
  type: 'ambient',
  audioUrl: `${CDN_BASE}/test_loop_120s.mp3`,
  imageUrl: `${GITHUB_IMG_BASE}/nature/images/wild_wind.jpg`,
  category: 'Debug',
};

export const SAMPLE_ASSETS: Asset[] = [
  DEBUG_TEST_ASSET, // Debug test track (120s)
  {
    id: 'sample_moderate_wind',
    displayName: 'Moderate Wind',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Nature%20Essentials%20-%200003%20Moderate%20wind.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/wild_wind.jpg`,
    category: 'Nature Essentials',
  },
  {
    id: 'sample_wind_wires',
    displayName: 'Wind Through Wires',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Winds%20Of%20Nature%20-%200139%20Wind%20modern%20light%20variable%20wires.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/wind_through_the_trees.jpg`,
    category: 'Winds Of Nature',
  },
  {
    id: 'sample_light_rain',
    displayName: 'Light Rain',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Thunder%20And%20Rain%20-%200292%20Rain%20quiet%20light%20tone.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/rain_and_thunder.jpg`,
    category: 'Thunder And Rain',
  },
  {
    id: 'sample_cave_drips',
    displayName: 'Cave Drips',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Flowing%20Water%20-%200336%20Cave%20drippy.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/dripping_cave.jpg`,
    category: 'Flowing Water',
  },
  {
    id: 'sample_ocean_surf',
    displayName: 'Ocean Surf',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Waves%20-%200468%20Surf%20slow%20surges%20rock%20jetty.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/crashing_waves.jpg`,
    category: 'Waves',
  },
  {
    id: 'sample_prairie_wind',
    displayName: 'Prairie Wind',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Prairies%20-%200586%20Soft%20wind.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/british_countryside_ambience.jpg`,
    category: 'Prairies',
  },
  {
    id: 'sample_tropical_evening',
    displayName: 'Tropical Evening',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Tropical%20Forests%20-%200672%20Evening.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/jungle_book_forest.jpg`,
    category: 'Tropical Forests',
  },
  {
    id: 'sample_forest_rain',
    displayName: 'Forest Rain',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Deciduous%20Forests%20-%200983%20Rain%20insects%20birdsongs%20peaceful%20V2.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/pure_sound_of_rain_in_the_forest.jpg`,
    category: 'Deciduous Forests',
  },
  {
    id: 'sample_swamp_morning',
    displayName: 'Swamp Morning',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Wetlands%20-%201018%20Swamp%20early%20morning%20breeze.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/borneo_jungle.jpg`,
    category: 'Wetlands',
  },
  {
    id: 'sample_geothermal',
    displayName: 'Geothermal Bubbles',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Upwellings%20-%201214%20Geothermal%20bubbles%20V2.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/active_volcano.jpg`,
    category: 'Upwellings',
  },
  {
    id: 'sample_bird_chorus',
    displayName: 'Bird Chorus',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Coniferous%20Forests%20-%201245%20Early%20morning%20Bird%20chorus%20V1.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/woodlands_at_dawn.jpg`,
    category: 'Coniferous Forests',
  },
  {
    id: 'sample_desert_dawn',
    displayName: 'Desert Dawn',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Deserts%20-%201560%20Dawn%20songbirds%20diverse%20spacious.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/nature/images/desert_sounds.jpg`,
    category: 'Deserts',
  },
  {
    id: 'sample_thunder_frogs',
    displayName: 'Thunder & Frogs',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Quietudes%20-%201741%20Wetlands%20rain%20thunder%20frogs%20V2.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/epic_thunderstorm_in_johannesburg.jpg`,
    category: 'Quietudes',
  },
  {
    id: 'sample_stream_birds',
    displayName: 'Stream & Birds',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Riparian%20Zones%20-%201826%20Stream%20morning%20birds%20toads.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/dusk_by_a_stream.jpg`,
    category: 'Riparian Zones',
  },
  {
    id: 'sample_ocean_birds',
    displayName: 'Ocean Shore Birds',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Ocean%20Shores%20-%201948%20Day%20Bird%20chorus%20calm%20water%20V2.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/island_paradise.jpg`,
    category: 'Ocean Shores',
  },
  {
    id: 'sample_hawaii_coast',
    displayName: 'Hawaii Coast',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/Hawaii%20-%202064%20Coastal%20day%20birds%20insects%20waves%20busy.mp3`,
    imageUrl: `${GITHUB_IMG_BASE}/water/images/ocean_waves_in_madagascar.jpg`,
    category: 'Hawaii',
  },
];

export function getSampleAssets(): Asset[] {
  return SAMPLE_ASSETS;
}
