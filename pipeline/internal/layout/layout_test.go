package layout

import (
	"encoding/json"
	"errors"
	"math"
	"math/rand/v2"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"grove/pipeline/internal/fma"
)

func TestPackFreeHasNoOverlapsAndIsCompact(t *testing.T) {
	radii := []float64{120, 80, 80, 60, 45, 45, 40, 30, 30, 30, 30, 30, 30, 30, 30, 30}
	pos := packFree(radii, 0)
	area, extent := 0.0, 0.0
	for i := range pos {
		area += math.Pi * radii[i] * radii[i]
		extent = math.Max(extent, pos[i].len()+radii[i])
		for j := i + 1; j < len(pos); j++ {
			if d := pos[i].sub(pos[j]).len(); d < radii[i]+radii[j]-1e-4 {
				t.Fatalf("circles %d and %d overlap by %.4f", i, j, radii[i]+radii[j]-d)
			}
		}
	}
	// Loose bound: the enclosing circle is at most 2.2x the total area.
	if enclosing := math.Pi * extent * extent; enclosing > 2.2*area {
		t.Fatalf("packing too loose: enclosing area %.0f vs circles %.0f", enclosing, area)
	}
}

func TestPackInside(t *testing.T) {
	radii := []float64{20, 15, 10, 10, 5, 5, 5}
	pos, err := packInside(radii, 40, 0)
	if err != nil {
		t.Fatal(err)
	}
	for i := range pos {
		if pos[i].len()+radii[i] > 40+1e-4 {
			t.Errorf("circle %d sticks out", i)
		}
		for j := i + 1; j < len(pos); j++ {
			if pos[i].sub(pos[j]).len() < radii[i]+radii[j]-1e-4 {
				t.Errorf("circles %d and %d overlap", i, j)
			}
		}
	}
	if _, err := packInside([]float64{20, 20, 20}, 30, 0); !errors.Is(err, errNoFit) {
		t.Fatalf("three r=20 in r=30: err = %v, want errNoFit", err)
	}
	if _, err := packInside([]float64{31}, 30, 0); !errors.Is(err, errNoFit) {
		t.Fatalf("r=31 in r=30: err = %v, want errNoFit", err)
	}
}

func TestProject2DFindsTheMainAxes(t *testing.T) {
	// Points spread widely along (1, 1, 0), narrowly along (0, 0, 1).
	var rows [][]float64
	for i := -10; i <= 10; i++ {
		for j := -1; j <= 1; j++ {
			rows = append(rows, []float64{float64(i), float64(i) + 0.001*float64(j), float64(j)})
		}
	}
	got := project2D(rows)
	for k, p := range got {
		i := float64(k/3 - 10)
		// pc1 = (1, 1, 0)/√2 on standardized data; its sign makes entries positive.
		want := (i/stdOf(rows, 0) + rows[k][1]/stdOf(rows, 1)) / math.Sqrt2
		if math.Abs(p.x-want) > 1e-3 {
			t.Fatalf("row %d: pc1 = %.4f, want %.4f", k, p.x, want)
		}
	}
	if !reflect.DeepEqual(got, project2D(rows)) {
		t.Fatal("project2D is not deterministic")
	}
	if p := project2D([][]float64{{1, 2}, {1, 2}}); p[0] != (vec{}) || p[1] != (vec{}) {
		t.Fatalf("constant rows: got %v, want zeros", p)
	}
}

func stdOf(rows [][]float64, c int) float64 {
	m, s := 0.0, 0.0
	for _, r := range rows {
		m += r[c]
	}
	m /= float64(len(rows))
	for _, r := range rows {
		s += (r[c] - m) * (r[c] - m)
	}
	return math.Sqrt(s / float64(len(rows)))
}

func TestGroveGenre(t *testing.T) {
	g := map[int]fma.Genre{
		12:  {ID: 12, Parent: 0, TopLevel: 12},
		25:  {ID: 25, Parent: 12, TopLevel: 12},
		85:  {ID: 85, Parent: 25, TopLevel: 12},
		86:  {ID: 86, Parent: 85, TopLevel: 12},
		31:  {ID: 31, Parent: 12, TopLevel: 12},
		15:  {ID: 15, Parent: 0, TopLevel: 15},
		296: {ID: 296, Parent: 15, TopLevel: 15},
	}
	for _, c := range []struct {
		genres []int
		want   int
	}{
		{[]int{12}, CoreGrove},
		{nil, CoreGrove},
		{[]int{25}, 25},
		{[]int{86}, 25},         // depth 4 walks up to level 2
		{[]int{31, 85}, 25},     // deepest wins
		{[]int{31, 25}, 25},     // equal depth: lower id
		{[]int{296, 31}, 31},    // other top-level genres are ignored
		{[]int{296}, CoreGrove}, // nothing from this biome
		{[]int{999, 25}, 25},    // unknown ids are ignored
	} {
		if got := GroveGenre(g, c.genres, 12); got != c.want {
			t.Errorf("GroveGenre(%v) = %d, want %d", c.genres, got, c.want)
		}
	}
}

func TestPlaceTreesKeepsSpacingAndDisc(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	pts := make([]vec, 400)
	for i := range pts {
		pts[i] = vec{rng.NormFloat64(), rng.NormFloat64() * 0.3}
	}
	pts[5], pts[6] = vec{}, vec{} // duplicates must still separate
	limit := math.Sqrt(400 * 11.2 / math.Pi)
	place := func(pts []vec, limit, spacing float64) ([]vec, error) {
		pos := mapToSlots(pts, discSlots(len(pts), limit))
		return pos, repel(pos, limit, spacing)
	}
	pos, err := place(pts, limit, 2.52)
	if err != nil {
		t.Fatal(err)
	}
	for i := range pos {
		if pos[i].len() > limit+1e-9 {
			t.Fatalf("tree %d outside the disc", i)
		}
		for j := i + 1; j < len(pos); j++ {
			if d := pos[i].sub(pos[j]).len(); d < 2.52*(1-1e-6) {
				t.Fatalf("trees %d and %d are %.3f apart", i, j, d)
			}
		}
	}
	// Feature-space structure survives: the outlier lands on the rim on its
	// own side, the point at the mean lands near the center.
	pts[0], pts[1] = vec{50, 0}, vec{0.0001, 0}
	pos, err = place(pts, limit, 2.52)
	if err != nil {
		t.Fatal(err)
	}
	if pos[0].len() < 0.9*limit || pos[0].x < 0 {
		t.Errorf("outlier placed at %v, want near the +x rim", pos[0])
	}
	if pos[1].len() > 0.2*limit {
		t.Errorf("central point placed at %v, want near the center", pos[1])
	}
	if _, err := place(make([]vec, 50), 3, 2.5); !errors.Is(err, errCrowded) {
		t.Fatalf("50 trees in r=3: err = %v, want errCrowded", err)
	}
}

func TestPartitionIsExactCompactAndCoversEverySlot(t *testing.T) {
	slots := discSlots(1000, 100)
	seeds := []vec{{-40, 0}, {40, 10}, {0, -60}, {10, 70}}
	caps := []int{500, 250, 200, 50}
	parts := partition(slots, seeds, caps)
	seen := make([]bool, len(slots))
	for g, p := range parts {
		if len(p) != caps[g] {
			t.Fatalf("grove %d got %d slots, want %d", g, len(p), caps[g])
		}
		// Compact: a region holding a share of the disc has about the radius
		// of a disc of that share, not much more.
		var c vec
		for _, i := range p {
			c = c.add(slots[i])
		}
		c = c.scale(1 / float64(len(p)))
		far := 0.0
		for _, i := range p {
			if seen[i] {
				t.Fatalf("slot %d assigned twice", i)
			}
			seen[i] = true
			far = math.Max(far, slots[i].sub(c).len())
		}
		if want := 100 * math.Sqrt(float64(caps[g])/1000); far > 2.2*want {
			t.Errorf("grove %d reaches %.1f from its centroid, a compact region would reach about %.1f", g, far, want)
		}
	}
	for i, ok := range seen {
		if !ok {
			t.Fatalf("slot %d unassigned", i)
		}
	}
	if !reflect.DeepEqual(parts, partition(slots, seeds, caps)) {
		t.Fatal("partition is not deterministic")
	}
}

func TestQuantize(t *testing.T) {
	if got, want := quantize([]float64{3, 1, 2, 100}), []uint8{170, 0, 85, 255}; !reflect.DeepEqual(got, want) {
		t.Fatalf("quantize = %v, want %v", got, want)
	}
	if got := quantize([]float64{7}); got[0] != 128 {
		t.Fatalf("single value = %d, want 128", got[0])
	}
	if got := quantize(nil); len(got) != 0 {
		t.Fatalf("empty = %v", got)
	}
}

// synthetic builds tracks for three biomes of different sizes, with groves
// big and small, and random features.
func synthetic() []Track {
	rng := rand.New(rand.NewPCG(7, 11))
	var out []Track
	id := 1
	add := func(biome, grove, n int) {
		for k := 0; k < n; k++ {
			f := make([]float64, 30)
			for j := range f {
				f[j] = rng.NormFloat64() + float64(grove%7)
			}
			out = append(out, Track{ID: id, Biome: biome, Grove: grove, Features: f, Centroid: f[20], RMS: f[21], ZCR: f[22]})
			id += 1 + rng.IntN(3)
		}
	}
	add(12, 25, 300)
	add(12, 31, 120)
	add(12, CoreGrove, 80)
	add(12, 40, 4) // below MinGroveTrees: merges into core
	add(15, 296, 150)
	add(15, CoreGrove, 30)
	add(2, CoreGrove, 12)
	return out
}

func TestBuild(t *testing.T) {
	in := synthetic()
	w, err := Build(in, Defaults)
	if err != nil {
		t.Fatal(err)
	}
	if got := []int{w.Biomes[0].ID, w.Biomes[1].ID, w.Biomes[2].ID}; !reflect.DeepEqual(got, []int{2, 12, 15}) {
		t.Fatalf("biome order = %v", got)
	}

	type placed struct {
		x, z float64
	}
	var all []placed
	seen := map[int]bool{}
	for _, b := range w.Biomes {
		sum := 0
		for gi, g := range b.Groves {
			sum += g.Trees
			if g.Genre == 40 {
				t.Errorf("biome %d: grove 40 has %d trees and should have merged into core", b.ID, g.Trees)
			}
			if g.Genre == CoreGrove && gi != len(b.Groves)-1 {
				t.Errorf("biome %d: core is not the last grove", b.ID)
			}
		}
		if sum != len(b.Trees) {
			t.Errorf("biome %d: groves hold %d trees, biome has %d", b.ID, sum, len(b.Trees))
		}
		for _, tr := range b.Trees {
			if seen[tr.ID] {
				t.Fatalf("tree %d placed twice", tr.ID)
			}
			seen[tr.ID] = true
			g := b.Groves[tr.Grove]
			if d := math.Hypot(tr.X-g.Center[0], tr.Z-g.Center[1]); d > g.Radius+0.02 {
				t.Errorf("tree %d is %.2f from its grove center, radius %.2f", tr.ID, d, g.Radius)
			}
			if d := math.Hypot(tr.X-b.Center[0], tr.Z-b.Center[1]); d > b.Radius+0.02 {
				t.Errorf("tree %d outside biome %d", tr.ID, b.ID)
			}
			if tr.X != round(tr.X) || tr.Z != round(tr.Z) {
				t.Errorf("tree %d not rounded to 1 cm", tr.ID)
			}
			all = append(all, placed{tr.X, tr.Z})
		}
	}
	if len(seen) != len(in) {
		t.Fatalf("placed %d trees, want %d", len(seen), len(in))
	}
	for i := range all {
		for j := i + 1; j < len(all); j++ {
			if d := math.Hypot(all[i].x-all[j].x, all[i].z-all[j].z); d < Defaults.Spacing {
				t.Fatalf("two trees are %.3f m apart", d)
			}
		}
	}
	for i, a := range w.Biomes {
		for _, b := range w.Biomes[i+1:] {
			if d := math.Hypot(a.Center[0]-b.Center[0], a.Center[1]-b.Center[1]); d < a.Radius+b.Radius-0.05 {
				t.Errorf("biomes %d and %d overlap", a.ID, b.ID)
			}
		}
	}

	// Determinism, independent of input order.
	rev := append([]Track(nil), in...)
	for i, j := 0, len(rev)-1; i < j; i, j = i+1, j-1 {
		rev[i], rev[j] = rev[j], rev[i]
	}
	w2, err := Build(rev, Defaults)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(w, w2) {
		t.Fatal("Build is not deterministic")
	}
}

func TestBuildDensity(t *testing.T) {
	w, err := Build(synthetic(), Defaults)
	if err != nil {
		t.Fatal(err)
	}
	// Every biome above the minimum radius has about AreaPerTree m² per tree,
	// a bit more if groves needed room.
	for _, b := range w.Biomes {
		if b.Radius <= Defaults.MinBiomeRadius*1.3 {
			continue
		}
		perTree := math.Pi * b.Radius * b.Radius / float64(len(b.Trees))
		if perTree < Defaults.AreaPerTree-0.1 || perTree > 1.5*Defaults.AreaPerTree {
			t.Fatalf("biome %d: %.1f m² per tree", b.ID, perTree)
		}
	}
	if small := w.Biomes[0]; small.Radius < Defaults.MinBiomeRadius {
		t.Fatalf("biome 2 radius %.1f below minimum", small.Radius)
	}
}

func TestSpeciesOfIsAlwaysAKnownSpecies(t *testing.T) {
	known := map[string]bool{}
	for _, s := range Species {
		known[s] = true
	}
	for genre, s := range speciesByGenre {
		if !known[s] {
			t.Errorf("genre %d maps to unknown species %q", genre, s)
		}
	}
	if got := SpeciesOf(999999); got != "oak" {
		t.Errorf("unknown genre gets %q, want oak", got)
	}
	used := map[string]bool{}
	for _, s := range speciesByGenre {
		used[s] = true
	}
	if len(used) != len(Species) {
		t.Errorf("table uses %d of %d species", len(used), len(Species))
	}
}

// The species list is part of the data contract: web/src/world/schema.ts
// checks the same fixture.
func TestSpeciesMatchesTheContractFixture(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "contract", "fixtures", "species.json"))
	if err != nil {
		t.Fatal(err)
	}
	var want []string
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(Species, want) {
		t.Fatalf("Species = %v, fixture %v", Species, want)
	}
}
