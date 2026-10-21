package layout

// Species are the tree kinds the browser can draw (data contract). Every
// tree of a biome is of the biome's species; palettes keep biomes that share
// one apart.
var Species = []string{"oak", "birch", "fir", "kapok", "acacia", "magnolia"}

// speciesByGenre maps FMA top-level genre ids to a species.
var speciesByGenre = map[int]string{
	2:    "kapok",    // International
	3:    "acacia",   // Blues
	4:    "acacia",   // Jazz
	5:    "birch",    // Classical
	8:    "oak",      // Old-Time / Historic
	9:    "oak",      // Country
	10:   "magnolia", // Pop
	12:   "fir",      // Rock
	13:   "birch",    // Easy Listening
	14:   "kapok",    // Soul-RnB
	15:   "magnolia", // Electronic
	17:   "oak",      // Folk
	20:   "acacia",   // Spoken
	21:   "kapok",    // Hip-Hop
	38:   "fir",      // Experimental
	1235: "birch",    // Instrumental
}

// SpeciesOf returns the species of a biome by its top-level genre id; genres
// not in the table get "oak".
func SpeciesOf(genre int) string {
	if s, ok := speciesByGenre[genre]; ok {
		return s
	}
	return "oak"
}
