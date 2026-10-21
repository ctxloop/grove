package layout

import "sort"

// quantize maps values to 0..255 by rank, so outliers do not squash
// everyone else into a few levels. Ties keep input order. A single value
// maps to the middle.
func quantize(values []float64) []uint8 {
	n := len(values)
	out := make([]uint8, n)
	if n == 1 {
		out[0] = 128
	}
	if n < 2 {
		return out
	}
	order := make([]int, n)
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return values[order[a]] < values[order[b]] })
	for rank, i := range order {
		out[i] = uint8((rank*255 + (n-1)/2) / (n - 1))
	}
	return out
}
