package export

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func readStrict(t *testing.T, path string, v any) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
}

func TestWriteAllRoundTrips(t *testing.T) {
	w := World{Schema: SchemaVersion, Subset: "small", FMABase: "https://freemusicarchive.org/music/", Audio: Audio{Path: "{id}.m4a"},
		Biomes:   []Biome{{ID: 12, Slug: "rock", Name: "Rock", File: "biome-12.json", Groves: []Grove{{Name: "core"}}, Trees: 1}},
		Licenses: map[string]License{"by-4.0": {Name: "CC BY 4.0", URL: "https://creativecommons.org/licenses/by/4.0/"}}}
	files := []BiomeFile{{Schema: SchemaVersion, Biome: 12, Trees: []Tree{{ID: 7, X: 1.25, Z: -3, Title: "A & B <live>", Lic: "by-4.0", URL: "x/y"}}}}
	a := Attribution{Schema: SchemaVersion, FMABase: w.FMABase, Licenses: w.Licenses, Tracks: []Credit{{ID: 7, Biome: 12, Title: "A & B <live>", Lic: "by-4.0", URL: "x/y"}}}
	dir := t.TempDir()
	sizes, err := WriteAll(dir, w, files, a)
	if err != nil {
		t.Fatal(err)
	}
	var gw World
	var gb BiomeFile
	var ga Attribution
	readStrict(t, filepath.Join(dir, WorldFile), &gw)
	readStrict(t, filepath.Join(dir, "biome-12.json"), &gb)
	readStrict(t, filepath.Join(dir, AttributionFile), &ga)
	if !reflect.DeepEqual(gw, w) || !reflect.DeepEqual(gb, files[0]) || !reflect.DeepEqual(ga, a) {
		t.Fatal("files do not round-trip")
	}
	raw, _ := os.ReadFile(filepath.Join(dir, "biome-12.json"))
	if !bytes.Contains(raw, []byte(`"A & B <live>"`)) {
		t.Fatalf("HTML characters were escaped: %s", raw)
	}
	if sizes["biome-12.json"] != len(raw) {
		t.Fatalf("size = %d, want %d", sizes["biome-12.json"], len(raw))
	}
	if matches, _ := filepath.Glob(filepath.Join(dir, "*.tmp")); len(matches) != 0 {
		t.Fatalf("temporary files left: %v", matches)
	}
}

func TestWriteAllRejectsMismatchedBiomes(t *testing.T) {
	w := World{Biomes: []Biome{{ID: 12, File: "biome-12.json"}}}
	if _, err := WriteAll(t.TempDir(), w, []BiomeFile{{Biome: 15}}, Attribution{}); err == nil {
		t.Fatal("want error for a biome file with the wrong id")
	}
	if _, err := WriteAll(t.TempDir(), w, nil, Attribution{}); err == nil {
		t.Fatal("want error for a missing biome file")
	}
}
