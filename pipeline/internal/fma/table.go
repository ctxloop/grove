// Package fma reads the Free Music Archive metadata files.
//
// The CSVs are large (features.csv is ~950 MB), so every reader streams rows
// and keeps only what the caller asks for.
package fma

import (
	"encoding/csv"
	"fmt"
	"io"
	"strings"
)

// Table is a CSV reader whose first headerRows rows are merged into one
// column name per column, joined with ".". Empty header cells are skipped, so
// tracks.csv gives "track.license" and features.csv gives "mfcc.mean.01".
type Table struct {
	r    *csv.Reader
	cols map[string]int
}

// NewTable reads the header rows from r.
func NewTable(r io.Reader, headerRows int) (*Table, error) {
	cr := csv.NewReader(r)
	cr.ReuseRecord = false
	var rows [][]string
	for i := 0; i < headerRows; i++ {
		row, err := cr.Read()
		if err != nil {
			return nil, fmt.Errorf("header row %d: %w", i+1, err)
		}
		rows = append(rows, row)
	}
	cols := make(map[string]int)
	for c := range rows[0] {
		var parts []string
		for _, row := range rows {
			if c < len(row) && row[c] != "" {
				parts = append(parts, row[c])
			}
		}
		name := strings.Join(parts, ".")
		if c == 0 {
			// The index column is labeled only in its own header row
			// ("track_id" or "genre_id"); normalize it.
			name = "id"
		}
		cols[name] = c
	}
	return &Table{r: cr, cols: cols}, nil
}

// Col returns the index of a merged column name.
func (t *Table) Col(name string) (int, error) {
	i, ok := t.cols[name]
	if !ok {
		return 0, fmt.Errorf("missing column %q", name)
	}
	return i, nil
}

// Next returns the next data row, or io.EOF.
func (t *Table) Next() ([]string, error) {
	return t.r.Read()
}
