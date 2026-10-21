package layout

import (
	"errors"
	"math"
	"sort"
)

// Circle packing by iterative relaxation. Both packers are deterministic:
// the start positions come from a golden-angle spiral in a fixed order, and
// every pass visits circles and pairs in index order.

const (
	packIterations   = 3000
	settleIterations = 2000
	packTolerance    = 1e-6
	goldenAngle      = 2.399963229728653 // π(3 - √5)
)

type vec struct{ x, z float64 }

func (a vec) add(b vec) vec       { return vec{a.x + b.x, a.z + b.z} }
func (a vec) sub(b vec) vec       { return vec{a.x - b.x, a.z - b.z} }
func (a vec) scale(s float64) vec { return vec{a.x * s, a.z * s} }
func (a vec) len() float64        { return math.Hypot(a.x, a.z) }
func spiral(i int, step float64) vec {
	return polar(step*math.Sqrt(float64(i)), float64(i)*goldenAngle)
}
func polar(r, theta float64) vec { return vec{r * math.Cos(theta), r * math.Sin(theta)} }

// bySizeDesc returns circle indices, largest first, ties by index, so the
// biggest circles start nearest the middle.
func bySizeDesc(radii []float64) []int {
	order := make([]int, len(radii))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return radii[order[a]] > radii[order[b]] })
	return order
}

func startPositions(radii []float64) []vec {
	mean := 0.0
	for _, r := range radii {
		mean += r
	}
	mean /= float64(max(len(radii), 1))
	pos := make([]vec, len(radii))
	for rank, i := range bySizeDesc(radii) {
		pos[i] = spiral(rank, 2*mean)
	}
	return pos
}

// separate pushes overlapping pairs apart so they are at least gap apart.
// The smaller circle moves more. It returns the largest overlap it found.
func separate(pos []vec, radii []float64, gap float64) float64 {
	worst := 0.0
	for i := range pos {
		for j := i + 1; j < len(pos); j++ {
			d := pos[j].sub(pos[i])
			dist := d.len()
			need := radii[i] + radii[j] + gap
			if dist >= need {
				continue
			}
			worst = math.Max(worst, need-dist)
			dir := vec{1, 0}
			if dist > 0 {
				dir = d.scale(1 / dist)
			} else {
				dir = polar(1, float64(i+j)*goldenAngle)
			}
			ai, aj := radii[i]*radii[i], radii[j]*radii[j]
			wi := 0.5
			if ai+aj > 0 {
				wi = aj / (ai + aj)
			}
			push := need - dist
			pos[i] = pos[i].sub(dir.scale(push * wi))
			pos[j] = pos[j].add(dir.scale(push * (1 - wi)))
		}
	}
	return worst
}

// contain pulls circles back inside a container of radius limit centered on
// the origin and returns the largest protrusion it found.
func contain(pos []vec, radii []float64, limit float64) float64 {
	worst := 0.0
	for i := range pos {
		room := limit - radii[i]
		if d := pos[i].len(); d > room {
			worst = math.Max(worst, d-room)
			if d > 0 {
				pos[i] = pos[i].scale(room / d)
			}
		}
	}
	return worst
}

// packFree packs circles in the open plane as tightly as relaxation gets
// them: every pass pulls all circles toward the origin, then separates them.
// The result has no overlaps, so neighbors touch at their borders.
func packFree(radii []float64, gap float64) []vec {
	pos := startPositions(radii)
	for it := 0; it < packIterations; it++ {
		for i := range pos {
			pos[i] = pos[i].scale(0.98)
		}
		separate(pos, radii, gap)
	}
	for it := 0; it < settleIterations; it++ {
		if separate(pos, radii, gap) <= packTolerance {
			break
		}
	}
	return pos
}

var errNoFit = errors.New("circles do not fit")

// packInside packs circles inside a container of radius limit centered on
// the origin, at least gap apart. It fails if relaxation cannot remove every
// overlap and protrusion.
func packInside(radii []float64, limit, gap float64) ([]vec, error) {
	for _, r := range radii {
		if r > limit {
			return nil, errNoFit
		}
	}
	pos := startPositions(radii)
	for it := 0; it < packIterations; it++ {
		for i := range pos {
			pos[i] = pos[i].scale(0.995)
		}
		separate(pos, radii, gap)
		contain(pos, radii, limit)
	}
	for it := 0; it < settleIterations; it++ {
		overlap := separate(pos, radii, gap)
		out := contain(pos, radii, limit)
		if overlap <= packTolerance && out <= packTolerance {
			return pos, nil
		}
	}
	return nil, errNoFit
}
