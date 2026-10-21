package export

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// The fixtures are shared with web/src/world/schema.test.ts. Decoding them
// strictly and re-encoding must give the same JSON value, so a field added,
// removed, or renamed on the Go side fails here.
func TestContractFixtures(t *testing.T) {
	cases := []struct {
		file string
		into func() any
	}{
		{"world.json", func() any { return new(World) }},
		{"biome.json", func() any { return new(BiomeFile) }},
		{"attribution.json", func() any { return new(Attribution) }},
	}
	for _, c := range cases {
		t.Run(c.file, func(t *testing.T) {
			raw, err := os.ReadFile(filepath.Join("..", "..", "..", "contract", "fixtures", c.file))
			if err != nil {
				t.Fatal(err)
			}
			v := c.into()
			dec := json.NewDecoder(bytes.NewReader(raw))
			dec.DisallowUnknownFields()
			if err := dec.Decode(v); err != nil {
				t.Fatalf("strict decode: %v", err)
			}
			var buf bytes.Buffer
			if err := Encode(&buf, v); err != nil {
				t.Fatal(err)
			}
			var want, got any
			if err := json.Unmarshal(raw, &want); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(buf.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(want, got) {
				t.Errorf("round trip differs\nwant %v\ngot  %v", want, got)
			}
			if s := reflect.ValueOf(v).Elem().FieldByName("Schema"); s.Int() != SchemaVersion {
				t.Errorf("schema = %d, want %d", s.Int(), SchemaVersion)
			}
		})
	}
}
