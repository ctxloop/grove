package fma

import (
	"errors"
	"fmt"
	"io"
	"strconv"
)

// Genre is one node of the FMA genre tree. Parent is 0 for top-level genres.
type Genre struct {
	ID       int
	Parent   int
	TopLevel int
	Title    string
}

// ReadGenres reads genres.csv into a map keyed by genre id.
func ReadGenres(r io.Reader) (map[int]Genre, error) {
	t, err := NewTable(r, 1)
	if err != nil {
		return nil, err
	}
	var idx [4]int
	for i, n := range []string{"id", "parent", "top_level", "title"} {
		if idx[i], err = t.Col(n); err != nil {
			return nil, err
		}
	}
	out := make(map[int]Genre)
	for {
		row, err := t.Next()
		if errors.Is(err, io.EOF) {
			return out, nil
		}
		if err != nil {
			return nil, err
		}
		var g Genre
		var nums [3]int
		for i := 0; i < 3; i++ {
			if nums[i], err = strconv.Atoi(row[idx[i]]); err != nil {
				return nil, fmt.Errorf("genres.csv: %w", err)
			}
		}
		g.ID, g.Parent, g.TopLevel, g.Title = nums[0], nums[1], nums[2], row[idx[3]]
		out[g.ID] = g
	}
}

// Depth is 1 for a top-level genre, 2 for its children, and so on.
func Depth(genres map[int]Genre, id int) int {
	d := 0
	for id != 0 && d <= len(genres) {
		g, ok := genres[id]
		if !ok {
			return 0
		}
		d++
		id = g.Parent
	}
	return d
}
