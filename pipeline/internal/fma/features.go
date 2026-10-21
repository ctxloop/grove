package fma

import (
	"errors"
	"fmt"
	"io"
	"strconv"
)

// ReadFeatures streams features.csv (4 header rows) and returns, for each
// track in want, the values of cols in that order. Column names are
// "feature.statistic.index", for example "mfcc.mean.01".
func ReadFeatures(r io.Reader, cols []string, want map[int]bool) (map[int][]float64, error) {
	t, err := NewTable(r, 4)
	if err != nil {
		return nil, err
	}
	idx := make([]int, len(cols))
	for i, c := range cols {
		if idx[i], err = t.Col(c); err != nil {
			return nil, err
		}
	}
	out := make(map[int][]float64, len(want))
	for {
		row, err := t.Next()
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		id, err := strconv.Atoi(row[0])
		if err != nil {
			return nil, fmt.Errorf("features.csv: track id: %w", err)
		}
		if !want[id] {
			continue
		}
		v := make([]float64, len(idx))
		for i, c := range idx {
			if v[i], err = strconv.ParseFloat(row[c], 64); err != nil {
				return nil, fmt.Errorf("features.csv track %d %s: %w", id, cols[i], err)
			}
		}
		out[id] = v
	}
}
