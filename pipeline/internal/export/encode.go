package export

import (
	"encoding/json"
	"io"
)

// Encode writes v as compact JSON followed by a newline. HTML escaping is off
// so titles keep their "&", "<" and ">" characters as written.
func Encode(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}
