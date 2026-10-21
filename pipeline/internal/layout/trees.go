package layout

import (
	"errors"
	"math"
	"sort"
)

const repulsionIterations = 500

// discSlots fills a disc of radius limit, centered on the origin, with n
// sunflower (Vogel spiral) slots: slot k sits at radius limit·√((k+½)/n),
// so slots are evenly spread and far apart.
func discSlots(n int, limit float64) []vec {
	slots := make([]vec, n)
	for k := range slots {
		slots[k] = polar(limit*math.Sqrt((float64(k)+0.5)/float64(n)), float64(k)*goldenAngle)
	}
	return slots
}

// mapToSlots gives each feature-space point one of the slots (len(slots) ==
// len(proj)), keeping each point's distance rank and, roughly, its angle
// around the points' mean.
//
// Points sorted by distance from their mean take the slots sorted by
// distance from the slots' centroid, ring by ring of about √n slots; inside
// a ring, points and slots are both sorted by angle and paired up.
func mapToSlots(proj, slots []vec) []vec {
	n := len(proj)
	if n == 0 {
		return nil
	}
	centered := func(vs []vec) []vec {
		var mean vec
		for _, v := range vs {
			mean = mean.add(v)
		}
		mean = mean.scale(1 / float64(len(vs)))
		out := make([]vec, len(vs))
		for i, v := range vs {
			out[i] = v.sub(mean)
		}
		return out
	}
	rel, srel := centered(proj), centered(slots)
	byRadius := func(vs []vec) []int {
		order := make([]int, len(vs))
		for i := range order {
			order[i] = i
		}
		sort.SliceStable(order, func(a, b int) bool { return vs[order[a]].len() < vs[order[b]].len() })
		return order
	}
	angle := func(v vec) float64 { return math.Atan2(v.z, v.x) }
	order, sorder := byRadius(rel), byRadius(srel)

	pos := make([]vec, n)
	ring := int(math.Ceil(math.Sqrt(float64(n))))
	for lo := 0; lo < n; lo += ring {
		hi := min(lo+ring, n)
		pts := append([]int(nil), order[lo:hi]...)
		sort.SliceStable(pts, func(a, b int) bool { return angle(rel[pts[a]]) < angle(rel[pts[b]]) })
		ks := append([]int(nil), sorder[lo:hi]...)
		sort.SliceStable(ks, func(a, b int) bool { return angle(srel[ks[a]]) < angle(srel[ks[b]]) })
		for i, p := range pts {
			pos[p] = slots[ks[i]]
		}
	}
	return pos
}

var errCrowded = errors.New("trees cannot reach the minimum spacing")

// repel pushes pairs closer than spacing apart and clamps trees into the
// disc, using a grid with cells of size spacing so each pass is linear.
func repel(pos []vec, limit, spacing float64) error {
	type cell struct{ x, z int }
	grid := make(map[cell][]int)
	for it := 0; it < repulsionIterations; it++ {
		clear(grid)
		for i, p := range pos {
			c := cell{int(math.Floor(p.x / spacing)), int(math.Floor(p.z / spacing))}
			grid[c] = append(grid[c], i)
		}
		moved := false
		for i := range pos {
			c := cell{int(math.Floor(pos[i].x / spacing)), int(math.Floor(pos[i].z / spacing))}
			for dx := -1; dx <= 1; dx++ {
				for dz := -1; dz <= 1; dz++ {
					for _, j := range grid[cell{c.x + dx, c.z + dz}] {
						if j <= i {
							continue
						}
						d := pos[j].sub(pos[i])
						l := d.len()
						if l >= spacing*(1-1e-9) {
							continue
						}
						dir := polar(1, float64(i)*goldenAngle)
						if l > 0 {
							dir = d.scale(1 / l)
						}
						push := (spacing - l) / 2 * 1.01
						pos[i] = pos[i].sub(dir.scale(push))
						pos[j] = pos[j].add(dir.scale(push))
						moved = true
					}
				}
			}
		}
		for i, p := range pos {
			if l := p.len(); l > limit {
				pos[i] = p.scale(limit / l)
				moved = true
			}
		}
		if !moved {
			return nil
		}
	}
	return errCrowded
}
