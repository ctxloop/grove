package fma

import (
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// Track is the subset of tracks.csv that grove uses.
type Track struct {
	ID       int
	Title    string
	Artist   string
	Album    string
	License  string // raw license string, see internal/license
	Subset   string // "small", "medium", or "large"
	GenreTop string // empty when the track spans several top-level genres
	Genres   []int  // track.genres: the genres the artist chose
}

// ReadTracks reads every track from tracks.csv (3 header rows).
func ReadTracks(r io.Reader) ([]Track, error) {
	t, err := NewTable(r, 3)
	if err != nil {
		return nil, err
	}
	names := []string{"id", "track.title", "artist.name", "album.title", "track.license", "set.subset", "track.genre_top", "track.genres"}
	idx := make([]int, len(names))
	for i, n := range names {
		if idx[i], err = t.Col(n); err != nil {
			return nil, err
		}
	}
	var out []Track
	for line := 4; ; line++ {
		row, err := t.Next()
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		id, err := strconv.Atoi(row[idx[0]])
		if err != nil {
			return nil, fmt.Errorf("tracks.csv row %d: track id: %w", line, err)
		}
		genres, err := ParseIDList(row[idx[7]])
		if err != nil {
			return nil, fmt.Errorf("tracks.csv track %d: genres: %w", id, err)
		}
		out = append(out, Track{
			ID:       id,
			Title:    row[idx[1]],
			Artist:   row[idx[2]],
			Album:    row[idx[3]],
			License:  row[idx[4]],
			Subset:   row[idx[5]],
			GenreTop: row[idx[6]],
			Genres:   genres,
		})
	}
}

// ParseIDList parses a Python-style list of integers such as "[21, 811]".
func ParseIDList(s string) ([]int, error) {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "[") || !strings.HasSuffix(s, "]") {
		return nil, fmt.Errorf("not a list: %q", s)
	}
	s = strings.TrimSpace(s[1 : len(s)-1])
	if s == "" {
		return nil, nil
	}
	parts := strings.Split(s, ",")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil {
			return nil, fmt.Errorf("list %q: %w", s, err)
		}
		out = append(out, n)
	}
	return out, nil
}
