package layout

import (
	"math"
	"sort"
)

const partitionIterations = 200

// partition splits slots between groves: grove g gets exactly caps[g] slots,
// the ones nearest its seed in a power diagram, so each grove is one compact
// region and together they cover every slot with no gap between them.
//
// Weights start at zero (plain nearest seed) and grow for groves short of
// their capacity until the counts settle. A final pass hands out slots in
// order of weighted distance, so the counts are exact. Deterministic: ties
// go to the lower grove, then the lower slot.
func partition(slots, seeds []vec, caps []int) [][]int {
	g := len(seeds)
	n := len(slots)
	if g == 0 || n == 0 {
		return make([][]int, g)
	}
	// Area per slot over π: the power-distance change that moves a region's
	// edge out by about one slot along its perimeter.
	var extent float64
	for _, s := range slots {
		extent = math.Max(extent, s.len())
	}
	step := extent * extent / float64(n)
	w := make([]float64, g)
	cost := func(s vec, k int) float64 {
		d := s.sub(seeds[k])
		return d.x*d.x + d.z*d.z - w[k]
	}
	count := make([]int, g)
	for it := 0; it < partitionIterations; it++ {
		clear(count)
		for _, s := range slots {
			best := 0
			for k := 1; k < g; k++ {
				if cost(s, k) < cost(s, best) {
					best = k
				}
			}
			count[best]++
		}
		done := true
		for k := range w {
			if count[k] != caps[k] {
				done = false
				w[k] += 0.5 * float64(caps[k]-count[k]) * step
			}
		}
		if done {
			break
		}
	}

	type pair struct {
		slot, grove int
		cost        float64
	}
	pairs := make([]pair, 0, n*g)
	for i, s := range slots {
		for k := range seeds {
			pairs = append(pairs, pair{i, k, cost(s, k)})
		}
	}
	sort.Slice(pairs, func(a, b int) bool {
		pa, pb := pairs[a], pairs[b]
		if pa.cost != pb.cost {
			return pa.cost < pb.cost
		}
		if pa.grove != pb.grove {
			return pa.grove < pb.grove
		}
		return pa.slot < pb.slot
	})
	out := make([][]int, g)
	taken := make([]bool, n)
	for _, p := range pairs {
		if taken[p.slot] || len(out[p.grove]) == caps[p.grove] {
			continue
		}
		taken[p.slot] = true
		out[p.grove] = append(out[p.grove], p.slot)
	}
	for k := range out {
		sort.Ints(out[k])
	}
	return out
}
