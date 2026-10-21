package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"

	"grove/pipeline/internal/fma"
	"grove/pipeline/internal/license"
)

// subsets lists, per subset, the set.subset values it contains. FMA subsets
// are nested: medium includes every small track.
var subsets = map[string][]string{
	"small":  {"small"},
	"medium": {"small", "medium"},
}

// selection is the tracks of one subset that pass the license filter, with
// the counts stats reports.
type selection struct {
	subset   string
	genres   map[int]fma.Genre
	tracks   []fma.Track // allowed tracks, by ID
	biome    map[int]int // track ID -> biome (top-level genre ID)
	total    int         // tracks in the subset
	excluded map[string]int
	unknown  map[string]int // license strings not in the table
	noGenre  int            // allowed but without a top-level genre
	noAudio  int            // allowed, with a genre, but the audio in FMA is corrupt
}

func selectTracks(meta, subset string) (*selection, error) {
	members, ok := subsets[subset]
	if !ok {
		return nil, fmt.Errorf("unknown subset %q (want small or medium)", subset)
	}
	in := map[string]bool{}
	for _, m := range members {
		in[m] = true
	}
	genres, err := readCSV(meta, "genres.csv", fma.ReadGenres)
	if err != nil {
		return nil, err
	}
	all, err := readCSV(meta, "tracks.csv", fma.ReadTracks)
	if err != nil {
		return nil, err
	}
	topByTitle := map[string]int{}
	for _, g := range genres {
		if g.Parent == 0 {
			topByTitle[g.Title] = g.ID
		}
	}
	s := &selection{subset: subset, genres: genres, biome: map[int]int{}, excluded: map[string]int{}, unknown: map[string]int{}}
	for _, t := range all {
		if !in[t.Subset] {
			continue
		}
		s.total++
		e, known := license.Lookup(t.License)
		switch {
		case !known:
			s.unknown[t.License]++
			continue
		case !e.Allowed:
			s.excluded[e.Reason]++
			continue
		}
		top, ok := topByTitle[t.GenreTop]
		if !ok {
			s.noGenre++
			continue
		}
		if fma.BrokenAudio[t.ID] {
			s.noAudio++
			continue
		}
		s.tracks = append(s.tracks, t)
		s.biome[t.ID] = top
	}
	sort.Slice(s.tracks, func(i, j int) bool { return s.tracks[i].ID < s.tracks[j].ID })
	return s, nil
}

func (s *selection) ids() map[int]bool {
	m := make(map[int]bool, len(s.tracks))
	for _, t := range s.tracks {
		m[t.ID] = true
	}
	return m
}

func readCSV[T any](dir, name string, read func(io.Reader) (T, error)) (T, error) {
	var zero T
	f, err := os.Open(filepath.Join(dir, name))
	if err != nil {
		return zero, err
	}
	defer f.Close()
	v, err := read(f)
	if err != nil {
		return zero, fmt.Errorf("%s: %w", name, err)
	}
	return v, nil
}
