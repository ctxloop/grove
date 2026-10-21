// Package license is the only place that decides which FMA tracks grove may
// use (CLAUDE.md §3). Allowed: CC BY, BY-SA, BY-NC, BY-NC-SA, CC0, and Public
// Domain. Everything else is excluded: NoDerivatives, missing, and non-CC
// licenses, and any string not in the table.
package license

// Entry is one license string as it appears in tracks.csv.
type Entry struct {
	Raw     string
	Allowed bool
	// Code, Name, and URL are set only for allowed entries. Code is the key
	// of world.json "licenses"; several strings can share a code.
	Code string
	Name string
	URL  string
	// Reason says why an excluded entry fails the allowlist.
	Reason string
}

var byRaw = func() map[string]Entry {
	m := make(map[string]Entry, len(table))
	for _, e := range table {
		m[e.Raw] = e
	}
	return m
}()

// Lookup returns the entry for a raw license string. Unknown strings return
// ok == false and must be treated as excluded.
func Lookup(raw string) (e Entry, ok bool) {
	e, ok = byRaw[raw]
	return e, ok
}

// Allowed reports whether a track with this license string may be used.
func Allowed(raw string) bool {
	e, ok := byRaw[raw]
	return ok && e.Allowed
}

// Entries returns a copy of the whole table.
func Entries() []Entry {
	return append([]Entry(nil), table...)
}
