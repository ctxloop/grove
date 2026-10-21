package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"grove/pipeline/internal/export"
)

func runStats(args []string) error {
	fs := flag.NewFlagSet("stats", flag.ContinueOnError)
	subset := fs.String("subset", "small", "small or medium")
	meta := fs.String("meta", "", "directory with the extracted fma_metadata CSVs (absolute path)")
	data := fs.String("data", "", "optional build output directory to check against the counts")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *meta == "" {
		fs.Usage()
		return errors.New("missing -meta")
	}
	s, err := selectTracks(*meta, *subset)
	if err != nil {
		return err
	}
	perBiome := map[int]int{}
	for _, b := range s.biome {
		perBiome[b]++
	}
	fmt.Printf("subset %s: %d tracks\n", s.subset, s.total)
	fmt.Printf("  allowed license: %d\n", len(s.tracks)+s.noGenre+s.noAudio)
	for _, r := range sortedKeys(s.excluded) {
		fmt.Printf("  excluded, %s: %d\n", r, s.excluded[r])
	}
	unknown := 0
	for _, n := range s.unknown {
		unknown += n
	}
	fmt.Printf("  unknown license strings: %d (%d tracks)\n", len(s.unknown), unknown)
	fmt.Printf("  allowed but without a top-level genre: %d\n", s.noGenre)
	fmt.Printf("  allowed but with corrupt audio in FMA: %d\n", s.noAudio)
	fmt.Printf("trees: %d\nbiomes: %d\n", len(s.tracks), len(perBiome))
	ids := make([]int, 0, len(perBiome))
	for id := range perBiome {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		fmt.Printf("  %-22s %5d\n", s.genres[id].Title, perBiome[id])
	}
	if *data == "" {
		return nil
	}
	if err := checkData(*data, s.subset, perBiome); err != nil {
		return fmt.Errorf("data %s: %w", *data, err)
	}
	fmt.Printf("data %s: matches\n", *data)
	return nil
}

// checkData verifies that a build output has the expected subset, biomes,
// and per-biome tree counts.
func checkData(dir, subset string, perBiome map[int]int) error {
	var w export.World
	if err := decodeStrict(filepath.Join(dir, export.WorldFile), &w); err != nil {
		return err
	}
	if w.Schema != export.SchemaVersion || w.Subset != subset {
		return fmt.Errorf("schema %d subset %q, want %d %q", w.Schema, w.Subset, export.SchemaVersion, subset)
	}
	if len(w.Biomes) != len(perBiome) {
		return fmt.Errorf("%d biomes, want %d", len(w.Biomes), len(perBiome))
	}
	for _, b := range w.Biomes {
		var f export.BiomeFile
		if err := decodeStrict(filepath.Join(dir, b.File), &f); err != nil {
			return err
		}
		if len(f.Trees) != perBiome[b.ID] || b.Trees != perBiome[b.ID] {
			return fmt.Errorf("biome %d: %d trees (world.json says %d), want %d", b.ID, len(f.Trees), b.Trees, perBiome[b.ID])
		}
	}
	return nil
}

func decodeStrict(path string, v any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}

func sortedKeys(m map[string]int) []string {
	k := make([]string, 0, len(m))
	for s := range m {
		k = append(k, s)
	}
	sort.Strings(k)
	return k
}
