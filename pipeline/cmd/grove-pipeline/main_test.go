package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"

	"grove/pipeline/internal/fma"
	"grove/pipeline/internal/license"
)

func TestSlug(t *testing.T) {
	for in, want := range map[string]string{
		"Rock":                "rock",
		"Old-Time / Historic": "old-time-historic",
		"Soul-RnB":            "soul-rnb",
		"Hip-Hop":             "hip-hop",
		"Easy Listening":      "easy-listening",
		"  Spoken!":           "spoken",
	} {
		if got := slug(in); got != want {
			t.Errorf("slug(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRelativeURL(t *testing.T) {
	for in, want := range map[string]string{
		"http://freemusicarchive.org/music/AWOL/AWOL_-_A_Way_Of_Life/Food":  "AWOL/AWOL_-_A_Way_Of_Life/Food",
		"https://freemusicarchive.org/music/AWOL/AWOL_-_A_Way_Of_Life/Food": "AWOL/AWOL_-_A_Way_Of_Life/Food",
	} {
		if got, err := relativeURL(in); err != nil || got != want {
			t.Errorf("relativeURL(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "http://freemusicarchive.org/music/", "http://example.com/music/x"} {
		if _, err := relativeURL(bad); err == nil {
			t.Errorf("relativeURL(%q): want error", bad)
		}
	}
}

func TestTrackID(t *testing.T) {
	if id, ok := trackID("fma_small/000/000140.mp3"); !ok || id != 140 {
		t.Fatalf("trackID = %d, %v", id, ok)
	}
	for _, bad := range []string{"fma_small/README.txt", "fma_small/checksums", "fma_small/000/x.mp3"} {
		if _, ok := trackID(bad); ok {
			t.Errorf("trackID(%q): want not ok", bad)
		}
	}
}

func TestFeatureColumns(t *testing.T) {
	if len(featureColumns) != 30 {
		t.Fatalf("%d feature columns, want 30", len(featureColumns))
	}
	for i, want := range map[int]string{colCentroid: "spectral_centroid.mean.01", colRMS: "rmse.mean.01", colZCR: "zcr.mean.01"} {
		if featureColumns[i] != want {
			t.Errorf("column %d = %q, want %q", i, featureColumns[i], want)
		}
	}
}

func TestAssemble(t *testing.T) {
	s := &selection{
		subset: "small",
		genres: map[int]fma.Genre{12: {ID: 12, Title: "Rock", TopLevel: 12}, 25: {ID: 25, Parent: 12, TopLevel: 12, Title: "Punk"}, 2: {ID: 2, Title: "International", TopLevel: 2}},
		biome:  map[int]int{},
	}
	feats := map[int][]float64{}
	urls := map[int]string{}
	for id := 1; id <= 30; id++ {
		tr := fma.Track{ID: id, Title: "T", Artist: "A", License: "Attribution", Genres: []int{25}}
		s.biome[id] = 12
		if id > 20 {
			tr.License = "CC0 1.0 Universal"
			tr.Genres = []int{2}
			s.biome[id] = 2
		}
		s.tracks = append(s.tracks, tr)
		f := make([]float64, 30)
		for j := range f {
			f[j] = float64((id*7+j*3)%11) + float64(j)
		}
		feats[id] = f
		urls[id] = "http://freemusicarchive.org/music/A/B/T" + string(rune('a'+id%26))
	}
	w, files, a, err := assemble(s, feats, urls)
	if err != nil {
		t.Fatal(err)
	}
	if len(w.Biomes) != 2 || w.Biomes[0].Name != "International" || w.Biomes[1].Slug != "rock" {
		t.Fatalf("biomes = %+v", w.Biomes)
	}
	if g := w.Biomes[1].Groves; len(g) != 1 || g[0].Name != "Punk" || g[0].Trees != 20 {
		t.Fatalf("rock groves = %+v", g)
	}
	if g := w.Biomes[0].Groves; len(g) != 1 || g[0].Name != "core" {
		t.Fatalf("international groves = %+v", g)
	}
	if len(w.Licenses) != 2 || w.Licenses["by-4.0"].Name != "CC BY 4.0" || w.Licenses["cc0-1.0"].URL == "" {
		t.Fatalf("licenses = %+v", w.Licenses)
	}
	if len(a.Tracks) != 30 || a.Tracks[0].ID != 1 || a.Tracks[29].ID != 30 || a.Tracks[0].URL != "A/B/Tb" {
		t.Fatalf("attribution = %+v", a.Tracks)
	}
	if len(files) != 2 || len(files[1].Trees) != 20 || files[1].Trees[0].Lic != "by-4.0" {
		t.Fatalf("files = %+v", files)
	}
	for _, b := range w.Biomes {
		if b.Center[0]-b.Radius < w.Bounds.MinX || b.Center[0]+b.Radius > w.Bounds.MaxX || b.Center[1]-b.Radius < w.Bounds.MinZ || b.Center[1]+b.Radius > w.Bounds.MaxZ {
			t.Errorf("biome %d outside bounds %+v", b.ID, w.Bounds)
		}
	}
	if w.Biomes[0].Palette == w.Biomes[1].Palette {
		t.Error("biomes share a palette")
	}
	delete(feats, 3)
	if _, _, _, err := assemble(s, feats, urls); err == nil {
		t.Fatal("missing features: want error")
	}
}

// TestSubsetCounts pins each subset's counts against the real metadata:
// tracks that pass the license filter, trees (those minus fma.BrokenAudio),
// tracks without audio, and biomes. Set GROVE_META to the extracted
// fma_metadata directory.
func TestSubsetCounts(t *testing.T) {
	meta := os.Getenv("GROVE_META")
	if meta == "" {
		t.Skip("GROVE_META not set")
	}
	for subset, want := range map[string][4]int{"small": {5188, 5187, 1, 8}, "medium": {14598, 14586, 12, 16}} {
		s, err := selectTracks(meta, subset)
		if err != nil {
			t.Fatal(err)
		}
		biomes := map[int]bool{}
		for _, b := range s.biome {
			biomes[b] = true
		}
		allowed := len(s.tracks) + s.noGenre + s.noAudio
		if allowed != want[0] || len(s.tracks) != want[1] || s.noAudio != want[2] || len(biomes) != want[3] || len(s.unknown) != 0 {
			t.Errorf("%s: %d allowed, %d trees, %d without audio, %d biomes, %d unknown licenses; want %v and 0 unknown",
				subset, allowed, len(s.tracks), s.noAudio, len(biomes), len(s.unknown), want)
		}
	}
}

// TestEveryFMALicenseIsInTheTable needs the real metadata (GROVE_META). Every
// license string in tracks.csv and raw_tracks.csv must have an entry in
// internal/license, so no track is excluded merely for being unknown.
func TestEveryFMALicenseIsInTheTable(t *testing.T) {
	meta := os.Getenv("GROVE_META")
	if meta == "" {
		t.Skip("GROVE_META not set")
	}
	missing := map[string]int{}
	check := func(raw string) {
		if _, ok := license.Lookup(raw); !ok {
			missing[raw]++
		}
	}

	tracks, err := readCSV(meta, "tracks.csv", fma.ReadTracks)
	if err != nil {
		t.Fatal(err)
	}
	for _, tr := range tracks {
		check(tr.License)
	}

	f, err := os.Open(filepath.Join(meta, "raw_tracks.csv"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	tbl, err := fma.NewTable(f, 1)
	if err != nil {
		t.Fatal(err)
	}
	col, err := tbl.Col("license_title")
	if err != nil {
		t.Fatal(err)
	}
	for {
		row, err := tbl.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		check(row[col])
	}

	for raw, n := range missing {
		t.Errorf("license %q (%d tracks) is not in internal/license", raw, n)
	}
}
