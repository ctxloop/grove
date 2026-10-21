// Every user-visible string lives here so translations can be added later.
// Strings that need values are functions of plain strings.

export const strings = {
  gate: {
    title: 'grove',
    tagline: 'A walkable forest where every tree is a song.',
    headphones: 'Best experienced with headphones.',
    loading: 'Loading…',
    enter: 'Enter the grove',
    retry: 'Try again',
    failed: 'The forest could not be loaded.',
  },

  hud: {
    controls:
      'Click to look around · WASD to walk · Shift to run · Click a tree to play/stop · Esc to release the mouse',
    touchControls: 'Left thumb to walk · Drag right side to look · Tap a tree to play/stop',
    enterBiome: (name: string) => `Entering ${name}`,
  },

  panel: {
    region: 'Track information',
    album: 'Album',
    biome: 'Biome',
    license: 'License',
    place: (biome: string, grove: string) => `${biome} · ${grove}`,
    fmaLink: 'View on Free Music Archive',
    close: 'Close track information',
    closeGlyph: '×',
    status: {
      idle: 'Click or tap to play',
      loading: 'Loading…',
      playing: 'Playing — click or tap again to stop',
      error: 'This clip could not be played',
    },
  },

  volume: {
    mute: 'Mute',
    muteTip: 'Mute (M)',
    slider: 'Volume',
  },

  attribution: {
    link: 'Credits',
    title: 'Credits',
    intro:
      'Track metadata comes from the Free Music Archive and is available under CC BY 4.0. Every track keeps its own license, listed below. Audio under NonCommercial licenses must not be used commercially.',
    close: 'Close',
    closeGlyph: '×',
    loading: 'Loading credits…',
    failed: 'The credits could not be loaded.',
    retry: 'Try again',
    fmaLink: 'Free Music Archive',
    tracks: (count: number) =>
      count === 1 ? '1 track' : `${count.toLocaleString('en-US')} tracks`,
  },

  search: {
    open: 'Search',
    dialog: 'Search tracks',
    input: 'Search by title or artist',
    results: 'Search results',
    loading: 'Searching…',
    empty: 'No tracks found.',
    failed: 'Search failed. Type again to retry.',
    hint: 'Enter to go · Esc to close',
  },

  share: {
    copy: 'Copy link',
    copied: 'Link copied',
    field: 'Link to this spot',
  },

  minimap: {
    label: 'Map of the forest. Click or tap a spot to go there.',
  },

  notice: {
    dismiss: 'Dismiss',
    dismissGlyph: '×',
    biomeLoadFailed: (name: string) => `Could not load ${name}.`,
    retry: 'Retry',
    audioPaused: 'Audio is paused.',
    resume: 'Click to resume',
  },
} as const;
