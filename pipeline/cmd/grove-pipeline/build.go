package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"sort"
	"strings"

	"grove/pipeline/internal/export"
	"grove/pipeline/internal/fma"
	"grove/pipeline/internal/layout"
	"grove/pipeline/internal/license"
)

const fmaBase = "https://freemusicarchive.org/music/"

// audioPath is the clip name template. Clips are AAC in MP4 (see runAudio).
const audioPath = "{id}.m4a"

// featureColumns feed the PCA (docs/architecture.md §3). The last three
// singles are also the appearance inputs.
var featureColumns = func() []string {
	var c []string
	for i := 1; i <= 20; i++ {
		c = append(c, fmt.Sprintf("mfcc.mean.%02d", i))
	}
	for i := 1; i <= 7; i++ {
		c = append(c, fmt.Sprintf("spectral_contrast.mean.%02d", i))
	}
	return append(c, "spectral_centroid.mean.01", "rmse.mean.01", "zcr.mean.01")
}()

const (
	colCentroid = 27
	colRMS      = 28
	colZCR      = 29
	saturation  = 0.55
)

func runBuild(args []string) error {
	fs := flag.NewFlagSet("build", flag.ContinueOnError)
	subset := fs.String("subset", "small", "small or medium")
	meta := fs.String("meta", "", "directory with the extracted fma_metadata CSVs (absolute path)")
	out := fs.String("out", "", "output directory, e.g. web/public/data/<subset>")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *meta == "" || *out == "" {
		fs.Usage()
		return errors.New("missing -meta or -out")
	}
	s, err := selectTracks(*meta, *subset)
	if err != nil {
		return err
	}
	want := s.ids()
	feats, err := readCSV(*meta, "features.csv", func(r io.Reader) (map[int][]float64, error) {
		return fma.ReadFeatures(r, featureColumns, want)
	})
	if err != nil {
		return err
	}
	urls, err := readCSV(*meta, "raw_tracks.csv", func(r io.Reader) (map[int]string, error) {
		return fma.ReadTrackURLs(r, want)
	})
	if err != nil {
		return err
	}
	w, files, a, err := assemble(s, feats, urls)
	if err != nil {
		return err
	}
	sizes, err := export.WriteAll(*out, w, files, a)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(sizes))
	total := 0
	for n, b := range sizes {
		names = append(names, n)
		total += b
	}
	sort.Strings(names)
	for _, n := range names {
		fmt.Printf("%-20s %9d bytes\n", n, sizes[n])
	}
	fmt.Printf("%s: %d trees in %d biomes, %d bytes\n", *subset, len(a.Tracks), len(w.Biomes), total)
	return nil
}

// assemble lays out the selection and builds the three output shapes.
func assemble(s *selection, feats map[int][]float64, urls map[int]string) (export.World, []export.BiomeFile, export.Attribution, error) {
	var none export.World
	in := make([]layout.Track, 0, len(s.tracks))
	byID := map[int]fma.Track{}
	for _, t := range s.tracks {
		f, ok := feats[t.ID]
		if !ok {
			return none, nil, export.Attribution{}, fmt.Errorf("track %d has no features", t.ID)
		}
		b := s.biome[t.ID]
		in = append(in, layout.Track{ID: t.ID, Biome: b, Grove: layout.GroveGenre(s.genres, t.Genres, b), Features: f,
			Centroid: f[colCentroid], RMS: f[colRMS], ZCR: f[colZCR]})
		byID[t.ID] = t
	}
	lw, err := layout.Build(in, layout.Defaults)
	if err != nil {
		return none, nil, export.Attribution{}, err
	}

	w := export.World{Schema: export.SchemaVersion, Subset: s.subset, FMABase: fmaBase, Audio: export.Audio{Path: audioPath}, Licenses: map[string]export.License{}}
	a := export.Attribution{Schema: export.SchemaVersion, FMABase: fmaBase, Licenses: w.Licenses}
	var files []export.BiomeFile
	first := true
	for bi, lb := range lw.Biomes {
		name := s.genres[lb.ID].Title
		b := export.Biome{ID: lb.ID, Slug: slug(name), Name: name, Center: lb.Center, Radius: lb.Radius,
			Palette: export.Palette{Hue: float64(bi) / float64(len(lw.Biomes)), Saturation: saturation},
			Species: layout.SpeciesOf(lb.ID),
			Trees:   len(lb.Trees), File: fmt.Sprintf("biome-%d.json", lb.ID)}
		for _, g := range lb.Groves {
			gname := "core"
			if g.Genre != layout.CoreGrove {
				gname = s.genres[g.Genre].Title
			}
			b.Groves = append(b.Groves, export.Grove{Name: gname, Center: g.Center, Radius: g.Radius, Trees: g.Trees})
		}
		bf := export.BiomeFile{Schema: export.SchemaVersion, Biome: lb.ID}
		for _, lt := range lb.Trees {
			t := byID[lt.ID]
			lic, _ := license.Lookup(t.License)
			w.Licenses[lic.Code] = export.License{Name: lic.Name, URL: lic.URL}
			rel, err := relativeURL(urls[t.ID])
			if err != nil {
				return none, nil, export.Attribution{}, fmt.Errorf("track %d: %w", t.ID, err)
			}
			bf.Trees = append(bf.Trees, export.Tree{ID: t.ID, X: lt.X, Z: lt.Z, Grove: lt.Grove, H: lt.H, L: lt.L, R: lt.R,
				Title: t.Title, Artist: t.Artist, Album: t.Album, Lic: lic.Code, URL: rel})
			a.Tracks = append(a.Tracks, export.Credit{ID: t.ID, Biome: lb.ID, Title: t.Title, Artist: t.Artist, Lic: lic.Code, URL: rel})
		}
		files = append(files, bf)
		w.Biomes = append(w.Biomes, b)

		minX, maxX := lb.Center[0]-lb.Radius, lb.Center[0]+lb.Radius
		minZ, maxZ := lb.Center[1]-lb.Radius, lb.Center[1]+lb.Radius
		if first {
			w.Bounds = export.Bounds{MinX: minX, MinZ: minZ, MaxX: maxX, MaxZ: maxZ}
			first = false
		}
		w.Bounds.MinX, w.Bounds.MaxX = min(w.Bounds.MinX, minX), max(w.Bounds.MaxX, maxX)
		w.Bounds.MinZ, w.Bounds.MaxZ = min(w.Bounds.MinZ, minZ), max(w.Bounds.MaxZ, maxZ)
	}
	sort.Slice(a.Tracks, func(i, j int) bool { return a.Tracks[i].ID < a.Tracks[j].ID })
	return w, files, a, nil
}

// relativeURL strips the FMA music prefix from a raw_tracks.csv track URL.
func relativeURL(u string) (string, error) {
	for _, p := range []string{"http://freemusicarchive.org/music/", "https://freemusicarchive.org/music/"} {
		if rest, ok := strings.CutPrefix(u, p); ok && rest != "" {
			return rest, nil
		}
	}
	return "", fmt.Errorf("unexpected track URL %q", u)
}

// slug lowercases a genre name and joins its letters and digits with "-":
// "Old-Time / Historic" becomes "old-time-historic".
func slug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			b.WriteRune(r)
			dash = false
		} else {
			dash = true
		}
	}
	return b.String()
}
