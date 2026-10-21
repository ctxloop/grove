// Package layout places every track in the world (docs/architecture.md §3).
// It is pure and deterministic: the same tracks give the same coordinates,
// so shared positions stay valid between builds.
package layout

import (
	"fmt"
	"math"
	"sort"
)

// Params are the layout constants. Defaults is what the pipeline uses.
type Params struct {
	// Spacing is the minimum distance between two trees, in meters.
	Spacing float64
	// AreaPerTree is the area per tree of every biome, in m², so all
	// forests are equally dense and no empty bands open up between them.
	AreaPerTree float64
	// MinBiomeRadius keeps tiny biomes walkable, in meters.
	MinBiomeRadius float64
	// GroveFill is the share of a biome's area the grove seed circles start
	// from. They shrink until they pack; they only place each grove's region.
	GroveFill float64
	// MinGroveTrees: smaller groves merge into the core grove.
	MinGroveTrees int
}

// About 7.5 m between neighbours inside groves: far enough apart that the tree you
// stand at is clearly the loudest voice.
var Defaults = Params{Spacing: 6, AreaPerTree: 55, MinBiomeRadius: 20, GroveFill: 0.7, MinGroveTrees: 10}

// Track is one input track. Features are the raw feature values used for
// PCA; Centroid, RMS, and ZCR drive the tree's appearance.
type Track struct {
	ID       int
	Biome    int
	Grove    int // genre id from GroveGenre, or CoreGrove
	Features []float64
	Centroid float64
	RMS      float64
	ZCR      float64
}

type World struct {
	Biomes []Biome // ordered by ID
}

type Biome struct {
	ID     int
	Center [2]float64
	Radius float64
	Groves []Grove // largest first, core last
	Trees  []Tree  // ordered by ID
}

type Grove struct {
	Genre  int // CoreGrove for the core grove
	Center [2]float64
	Radius float64
	Trees  int
}

// Tree is a placed track. Grove indexes Biome.Groves. H, L, and R are the
// height, lightness, and roughness levels, ranked across the whole subset.
type Tree struct {
	ID      int
	X, Z    float64
	Grove   int
	H, L, R uint8
}

// Build lays out all tracks.
func Build(tracks []Track, p Params) (World, error) {
	if len(tracks) == 0 {
		return World{}, fmt.Errorf("no tracks")
	}
	sorted := append([]Track(nil), tracks...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ID < sorted[j].ID })

	// Appearance is ranked across the subset so it is comparable between biomes.
	metric := func(f func(Track) float64) []uint8 {
		v := make([]float64, len(sorted))
		for i, t := range sorted {
			v[i] = f(t)
		}
		return quantize(v)
	}
	h := metric(func(t Track) float64 { return t.RMS })
	l := metric(func(t Track) float64 { return t.Centroid })
	r := metric(func(t Track) float64 { return t.ZCR })

	byBiome := map[int][]int{} // biome id -> indexes into sorted
	for i, t := range sorted {
		byBiome[t.Biome] = append(byBiome[t.Biome], i)
	}
	ids := make([]int, 0, len(byBiome))
	for id := range byBiome {
		ids = append(ids, id)
	}
	sort.Ints(ids)

	var w World
	radii := make([]float64, len(ids))
	for bi, id := range ids {
		b, err := buildBiome(id, sorted, byBiome[id], p, h, l, r)
		if err != nil {
			return World{}, fmt.Errorf("biome %d: %w", id, err)
		}
		w.Biomes = append(w.Biomes, b)
		radii[bi] = b.Radius
	}

	// Biomes touch: trees keep Spacing/2 from their grove edge, groves stay
	// inside their biome, so trees across a border are Spacing apart.
	centers := packFree(radii, 0)
	for bi := range w.Biomes {
		b := &w.Biomes[bi]
		c := centers[bi]
		b.Center = round2(c)
		for gi := range b.Groves {
			g := &b.Groves[gi]
			g.Center = round2(vec{g.Center[0] + c.x, g.Center[1] + c.z})
		}
		for ti := range b.Trees {
			t := &b.Trees[ti]
			t.X, t.Z = round(t.X+c.x), round(t.Z+c.z)
		}
	}
	return w, nil
}

// buildBiome lays out one biome around the origin.
func buildBiome(id int, all []Track, members []int, p Params, h, l, r []uint8) (Biome, error) {
	n := len(members)
	area := math.Max(p.AreaPerTree*float64(n), math.Pi*p.MinBiomeRadius*p.MinBiomeRadius)
	radius := math.Sqrt(area / math.Pi)

	// Groves, with small ones merged into core.
	count := map[int]int{}
	for _, i := range members {
		count[all[i].Grove]++
	}
	groveOf := func(t Track) int {
		if count[t.Grove] < p.MinGroveTrees {
			return CoreGrove
		}
		return t.Grove
	}
	merged := map[int][]int{}
	for _, i := range members {
		g := groveOf(all[i])
		merged[g] = append(merged[g], i)
	}
	genres := make([]int, 0, len(merged))
	for g := range merged {
		genres = append(genres, g)
	}
	sort.Slice(genres, func(a, b int) bool {
		ga, gb := genres[a], genres[b]
		if (ga == CoreGrove) != (gb == CoreGrove) {
			return gb == CoreGrove
		}
		if len(merged[ga]) != len(merged[gb]) {
			return len(merged[ga]) > len(merged[gb])
		}
		return ga < gb
	})

	// Seeds: grove circles sized by tree count, packed inside the biome. They
	// only decide where each grove's region lies, so circles that do not fit
	// shrink; the trees themselves fill the whole biome (see below).
	groveRadii := make([]float64, len(genres))
	for gi, g := range genres {
		groveRadii[gi] = math.Sqrt(p.GroveFill * area * float64(len(merged[g])) / float64(n) / math.Pi)
	}
	var centers []vec
	for {
		var err error
		if centers, err = packInside(groveRadii, radius, 0); err == nil {
			break
		}
		for gi := range groveRadii {
			groveRadii[gi] *= 0.98
		}
	}

	// Slots spread evenly over the whole biome disc, split between groves by
	// proximity to their seeds, so neither groves nor biomes leave empty
	// bands between them.
	// Rounding to 1 cm moves each tree up to 0.71 cm, so aim slightly wide.
	spacing := p.Spacing + 0.02
	limit := math.Max(radius-p.Spacing/2, 0)
	slots := discSlots(n, limit)
	caps := make([]int, len(genres))
	for gi, g := range genres {
		caps[gi] = len(merged[g])
	}
	parts := partition(slots, centers, caps)

	// Trees: PCA over the whole biome, then each grove maps its own trees
	// onto its own slots.
	rows := make([][]float64, n)
	for k, i := range members {
		rows[k] = all[i].Features
	}
	proj := project2D(rows)
	projOf := make(map[int]vec, n)
	for k, i := range members {
		projOf[i] = proj[k]
	}
	var (
		pos     = make([]vec, 0, n)
		track   = make([]int, 0, n) // index into all, per entry of pos
		inGrove = make([]int, 0, n) // index into genres, per entry of pos
	)
	for gi, g := range genres {
		idx := merged[g]
		pts := make([]vec, len(idx))
		for k, i := range idx {
			pts[k] = projOf[i]
		}
		own := make([]vec, len(parts[gi]))
		for k, si := range parts[gi] {
			own[k] = slots[si]
		}
		pos = append(pos, mapToSlots(pts, own)...)
		track = append(track, idx...)
		for range idx {
			inGrove = append(inGrove, gi)
		}
	}
	if err := repel(pos, limit, spacing); err != nil {
		return Biome{}, fmt.Errorf("%d trees in radius %.1f: %w", n, limit, err)
	}

	b := Biome{ID: id, Radius: round(radius)}
	// A grove is reported as the disc around its trees' centroid that holds them all.
	for gi, g := range genres {
		var c vec
		for k := range pos {
			if inGrove[k] == gi {
				c = c.add(pos[k])
			}
		}
		c = c.scale(1 / float64(caps[gi]))
		r := 0.0
		for k := range pos {
			if inGrove[k] == gi {
				r = math.Max(r, pos[k].sub(c).len())
			}
		}
		b.Groves = append(b.Groves, Grove{Genre: g, Center: [2]float64{c.x, c.z}, Radius: round(r + p.Spacing/2), Trees: caps[gi]})
	}
	for k, i := range track {
		t := all[i]
		b.Trees = append(b.Trees, Tree{ID: t.ID, X: pos[k].x, Z: pos[k].z, Grove: inGrove[k], H: h[i], L: l[i], R: r[i]})
	}
	sort.Slice(b.Trees, func(i, j int) bool { return b.Trees[i].ID < b.Trees[j].ID })
	return b, nil
}

func round(v float64) float64 { return math.Round(v*100) / 100 }

func round2(v vec) [2]float64 { return [2]float64{round(v.x), round(v.z)} }
