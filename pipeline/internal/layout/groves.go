package layout

import "grove/pipeline/internal/fma"

// CoreGrove is the grove id of tracks without a sub-genre and of groves too
// small to stand alone. Its exported name is "core".
const CoreGrove = 0

// GroveGenre picks a track's grove: take the deepest of the track's genres
// that belongs to the biome's top-level genre (ties go to the lower id), then
// walk up to its level-2 ancestor. Tracks tagged only with the top-level
// genre go to CoreGrove.
func GroveGenre(genres map[int]fma.Genre, trackGenres []int, top int) int {
	best, bestDepth := 0, 0
	for _, id := range trackGenres {
		g, ok := genres[id]
		if !ok || g.TopLevel != top {
			continue
		}
		d := fma.Depth(genres, id)
		if d > bestDepth || (d == bestDepth && id < best) {
			best, bestDepth = id, d
		}
	}
	if bestDepth < 2 {
		return CoreGrove
	}
	for ; bestDepth > 2; bestDepth-- {
		best = genres[best].Parent
	}
	return best
}
