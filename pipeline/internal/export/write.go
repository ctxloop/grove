package export

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
)

// WorldFile and AttributionFile are the fixed file names in the output
// directory. Biome files are named by World.Biomes[].File.
const (
	WorldFile       = "world.json"
	AttributionFile = "attribution.json"
)

// WriteAll writes world.json, one file per biome, and attribution.json into
// dir. Each file is written to a temporary name and renamed, so a failed run
// never leaves a half-written file. It returns the bytes written per file.
func WriteAll(dir string, w World, biomes []BiomeFile, a Attribution) (map[string]int, error) {
	if len(biomes) != len(w.Biomes) {
		return nil, fmt.Errorf("%d biome files for %d biomes", len(biomes), len(w.Biomes))
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	sizes := map[string]int{}
	write := func(name string, v any) error {
		var buf bytes.Buffer
		if err := Encode(&buf, v); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path+".tmp", buf.Bytes(), 0o644); err != nil {
			return err
		}
		sizes[name] = buf.Len()
		return os.Rename(path+".tmp", path)
	}
	for i, b := range w.Biomes {
		if biomes[i].Biome != b.ID {
			return nil, fmt.Errorf("biome file %d is for biome %d, want %d", i, biomes[i].Biome, b.ID)
		}
		if err := write(b.File, biomes[i]); err != nil {
			return nil, err
		}
	}
	if err := write(AttributionFile, a); err != nil {
		return nil, err
	}
	// world.json goes last: a reader that sees it can rely on every biome file.
	if err := write(WorldFile, w); err != nil {
		return nil, err
	}
	return sizes, nil
}
