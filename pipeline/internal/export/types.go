// Package export defines the JSON files the browser reads and writes them.
// The shapes are the data contract described in docs/architecture.md §4 and
// pinned by the fixtures in contract/fixtures.
package export

// SchemaVersion is written into every file. The browser rejects other values.
const SchemaVersion = 1

// World is world.json: everything needed before any biome is loaded.
type World struct {
	Schema   int                `json:"schema"`
	Subset   string             `json:"subset"`
	Bounds   Bounds             `json:"bounds"`
	FMABase  string             `json:"fmaBase"`
	Audio    Audio              `json:"audio"`
	Biomes   []Biome            `json:"biomes"`
	Licenses map[string]License `json:"licenses"`
}

// Bounds is the axis-aligned extent of all biome circles, in meters.
type Bounds struct {
	MinX float64 `json:"minX"`
	MinZ float64 `json:"minZ"`
	MaxX float64 `json:"maxX"`
	MaxZ float64 `json:"maxZ"`
}

// Audio holds the clip file name template. "{id}" is replaced by the track ID.
type Audio struct {
	Path string `json:"path"`
}

// Biome is one top-level genre.
type Biome struct {
	ID      int        `json:"id"`
	Slug    string     `json:"slug"`
	Name    string     `json:"name"`
	Center  [2]float64 `json:"center"`
	Radius  float64    `json:"radius"`
	Palette Palette    `json:"palette"`
	Species string     `json:"species"` // one of layout.Species
	Trees   int        `json:"trees"`
	File    string     `json:"file"`
	Groves  []Grove    `json:"groves"`
}

// Palette is the biome's base color. Both values are in [0, 1].
type Palette struct {
	Hue        float64 `json:"hue"`
	Saturation float64 `json:"saturation"`
}

// Grove is a sub-genre disc inside a biome.
type Grove struct {
	Name   string     `json:"name"`
	Center [2]float64 `json:"center"`
	Radius float64    `json:"radius"`
	Trees  int        `json:"trees"`
}

// License is one entry of the license table, keyed by code.
type License struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

// BiomeFile is biome-<id>.json.
type BiomeFile struct {
	Schema int    `json:"schema"`
	Biome  int    `json:"biome"`
	Trees  []Tree `json:"trees"`
}

// Tree is one track placed in the world. Short keys keep biome files small.
type Tree struct {
	ID     int     `json:"id"`
	X      float64 `json:"x"`
	Z      float64 `json:"z"`
	Grove  int     `json:"g"`
	H      uint8   `json:"h"`
	L      uint8   `json:"l"`
	R      uint8   `json:"r"`
	Title  string  `json:"t"`
	Artist string  `json:"a"`
	Album  string  `json:"al"`
	Lic    string  `json:"lic"`
	URL    string  `json:"url"`
}

// Attribution is attribution.json: every track with its credit.
type Attribution struct {
	Schema   int                `json:"schema"`
	FMABase  string             `json:"fmaBase"`
	Licenses map[string]License `json:"licenses"`
	Tracks   []Credit           `json:"tracks"`
}

// Credit is one attribution entry.
type Credit struct {
	ID     int    `json:"id"`
	Biome  int    `json:"b"`
	Title  string `json:"t"`
	Artist string `json:"a"`
	Lic    string `json:"lic"`
	URL    string `json:"url"`
}
