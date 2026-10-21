package fma

import (
	"errors"
	"io"
	"strconv"
)

// ReadTrackURLs reads each wanted track's FMA page URL from raw_tracks.csv,
// the only file that has it.
func ReadTrackURLs(r io.Reader, want map[int]bool) (map[int]string, error) {
	t, err := NewTable(r, 1)
	if err != nil {
		return nil, err
	}
	col, err := t.Col("track_url")
	if err != nil {
		return nil, err
	}
	out := make(map[int]string, len(want))
	for {
		row, err := t.Next()
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		id, err := strconv.Atoi(row[0])
		if err != nil || !want[id] {
			continue
		}
		out[id] = row[col]
	}
}
