package license

import (
	"strings"
	"testing"
)

// The expected classification is written out independently of table.go, one
// line per license string found in FMA, so any change to the table has to be
// made here too.

var wantAllowed = []string{
	"Attribution-Noncommercial-Share Alike 3.0 United States",
	"Attribution-NonCommercial-ShareAlike 3.0 International",
	"Attribution-NonCommercial-ShareAlike",
	"Attribution",
	"Attribution-NonCommercial 3.0 International",
	"Attribution-NonCommercial",
	"Attribution-ShareAlike",
	"Attribution-Noncommercial 3.0 United States",
	"Creative Commons Attribution",
	"CC0 1.0 Universal",
	"Attribution-ShareAlike 3.0 International",
	"Attribution-Noncommercial-Share Alike 2.0 UK: England ",
	"Attribution 3.0 United States",
	"Public Domain / Sound Recording Common Law Protection",
	"Attribution-NonCommercial-ShareAlike 3.0 (Will Not Appear in Vimeo Music Store)",
	"Attribution 3.0 International",
	"Attribution-Share Alike 3.0 United States",
	"Public Domain Mark 1.0",
	"Attribution-Noncommercial-Share Alike 3.0 Netherlands",
	"Attribution-Noncommercial-Share Alike 3.0 Germany",
	"Attribution-Noncommercial-Share Alike 2.5 Italy",
	"Public Domain",
	"Attribution-Noncommercial 2.5 Switzerland",
	"Attribution-Noncommercial-Share Alike 3.0 New Zealand",
	"Attribution 1.0 Finland",
	"Attribution-Noncommercial-Share Alike 2.0 France",
	"Attribution-Noncommercial-Share Alike 3.0 Spain",
	"Attribution-Noncommercial-Share Alike 3.0 Romania",
	"Attribution-Noncommercial-Share Alike 3.0 Brazil",
	"Attribution-Noncommercial-Share Alike 2.5 Canada",
	"Attribution 3.0 Netherlands",
	"Attribution-Noncommercial 2.1 Japan",
	"Attribution-NonCommercial-ShareAlike 2.1 Japan",
	"Attribution-Share Alike 2.0 UK: England ",
	"Attribution 2.0 France",
	"Attribution-Noncommercial 3.0 Germany",
	"Attribution-Noncommercial 3.0 Brazil",
	"Attribution-Noncommercial 3.0 Netherlands",
	"Attribution-Noncommercial-Share Alike 2.5 UK: Scotland",
	"Attribution-Share Alike 2.0 France",
	"Attribution-NonCommercial-ShareAlike 3.0 Italy",
	"Attribution-NonCommercial 2.5",
	"Attribution 3.0 France",
	"Attribution-NonCommercial 2.0 Chile",
	"Attribution-Noncommercial-Share Alike 2.0 Germany",
	"Attribution-Noncommercial-Share Alike 2.5 Mexico",
	"Attribution-Share Alike 3.0 Netherlands",
	"Attribution-ShareAlike 3.0 Romania",
	"Attribution-NonCommercial 3.0 France",
	"Attribution NonCommercial 2.5",
	"Attribution-Noncommercial 2.0 France",
	"Attribution-Noncommercial 3.0 New Zealand",
	"Attribution-ShareAlike 2.5 Portugal",
	"Attribution-NonCommercial-ShareAlike 3.0 France",
	"Attribution 2.0 UK: England ",
	"Attribution-Share Alike 3.0 Germany",
	"Attribution-Noncommercial-Share Alike 2.5 Israel",
	"Attribution-ShareAlike 2.5 Canada",
	"Attribution-Noncommercial 2.0 UK: England ",
	"Attribution-Noncommercial-Share Alike 2.0 Generic",
	"Attribution-Noncommercial 2.5 Canada",
	"Attribution-Share Alike 3.0 Brazil",
	"Attribution 2.5 Italy",
	"Attribution-Noncommercial 2.5 Brazil",
	"Attribution-Noncommercial 3.0 Austria",
	"Attribution 2.5 Canada",
}

var wantExcluded = []string{
	"Attribution-NonCommercial-NoDerivatives (aka Music Sharing) 3.0 International",
	"Creative Commons Attribution-NonCommercial-NoDerivatives 4.0",
	"Attribution-Noncommercial-No Derivative Works 3.0 United States",
	"Attribution-Noncommercial-NoDerivatives 2.0 France",
	"Attribution-NoDerivatives 3.0 International",
	"Attribution-NoDerivatives 4.0 International",
	"Attribution-Noncommercial-No Derivative Works 3.0 Germany",
	"Attribution-NonCommercial-NoDerivatives 2.0 Germany",
	"Free Music Philosophy",
	"Attribution-Noncommercial-No Derivative Works 2.5 Italy",
	"Attribution-Noncommercial-No Derivative Works 2.0 UK: England ",
	"",
	"Attribution-Noncommercial-NoDerivatives 2.5 Canada",
	"Attribution-No Derivative Works 3.0 United States",
	"Attribution-Noncommercial-NoDerivatives 2.5 Argentina",
	"Attribution-Noncommercial-No Derivative Works 2.5 Hungary",
	"Attribution-NonCommercial-NoDerivs 3.0 France",
	"Attribution-NoDerivatives",
	"CopyrightPlus",
	"Attribution-Noncommercial-No Derivative Works 2.5 Generic",
	"Attribution-NonCommercial-NoDerivs 2.5 Israel",
	"Noncommercial Sampling Plus",
	"Attribution-NonCommercial-NoDerivs 3.0 Italy",
	"Attribution-Noncommercial-NoDerivatives 2.0 Generic",
	"Music Sharing",
	"Attribution-Noncommercial-No Derivative Works 2.5 Mexico",
	"Attribution-Noncommercial-NoDerivatives 2.1 Japan",
	"Art Libre",
	"Sampling Plus",
	"Attribution-Noncommercial-No Derivative Works 3.0 Netherlands",
	"Attribution-Noncommercial-No Derivative Works 3.0 Spain",
	"Attribution-NoDerivs 2.5 Canada",
	"ideology.de",
	"Attribution-Noncommercial-NoDerivatives 2.5 Australia",
	"Attribution-NonCommercial-NoDerivs 3.0 Portugal",
	"Attribution-NoDerivs 2.0 UK: England & Wales",
	"Electronic Frontier Foundation Open Audio License",
	"Orphan Work",
	"Attribution-Noncommercial-No Derivative Works 2.5 Switzerland",
	"Attribution-No Derivative Works 2.5 Italy",
	"Attribution-Noncommercial-No Derivative Works 3.0 Croatia",
	"Attribution-NonCommercial-NoDerivs 3.0 Poland",
	"Attribution-Noncommercial-No Derivative Works 2.5 Sweden",
	"Attribution-Noncommercial-NoDerivatives 2.0 Belgium",
	"Attribution-Noncommercial-No Derivative Works 2.5 Portugal",
	"PennSound",
	"Attribution-NonCommercial-NoDerivs 2.5 Colombia",
	"Attribution-Noncommercial-No Derivative Works 2.5 Denmark",
	"FMA-Limited: Download Only",
}

func TestEveryFMAStringIsClassified(t *testing.T) {
	if got, want := len(table), len(wantAllowed)+len(wantExcluded); got != want {
		t.Fatalf("table has %d entries, test lists %d", got, want)
	}
	for _, raw := range wantAllowed {
		if !Allowed(raw) {
			t.Errorf("%q: want allowed", raw)
		}
	}
	for _, raw := range wantExcluded {
		e, ok := Lookup(raw)
		if !ok {
			t.Errorf("%q: missing from table", raw)
			continue
		}
		if e.Allowed || Allowed(raw) {
			t.Errorf("%q: want excluded", raw)
		}
		if e.Reason == "" {
			t.Errorf("%q: excluded without a reason", raw)
		}
	}
}

func TestTableIsUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, e := range table {
		if seen[e.Raw] {
			t.Errorf("duplicate %q", e.Raw)
		}
		seen[e.Raw] = true
	}
}

func TestUnknownAndMissingAreExcluded(t *testing.T) {
	for _, raw := range []string{"", "Attribution 9.0", "attribution", "All Rights Reserved"} {
		if Allowed(raw) {
			t.Errorf("%q: want excluded", raw)
		}
	}
	if _, ok := Lookup("Attribution 9.0"); ok {
		t.Error("unknown string: Lookup ok, want false")
	}
}

// Allowed entries must agree with their URL: allowed CC families only, never
// NoDerivatives, and one name and URL per code.
func TestAllowedEntriesAreConsistent(t *testing.T) {
	families := []string{"by-nc-sa-", "by-nc-", "by-sa-", "by-"}
	pd := map[string]bool{"cc0-1.0": true, "pdm-1.0": true, "pd": true, "pd-common-law": true}
	byCode := map[string]Entry{}
	for _, e := range table {
		if !e.Allowed {
			if e.Code != "" || e.Name != "" || e.URL != "" {
				t.Errorf("%q: excluded entry has code, name, or URL", e.Raw)
			}
			continue
		}
		if e.Code == "" || e.Name == "" || e.URL == "" {
			t.Errorf("%q: allowed entry missing code, name, or URL", e.Raw)
		}
		if strings.Contains(e.URL, "-nd/") || strings.HasPrefix(e.Code, "nd") || strings.Contains(e.Code, "-nd-") {
			t.Errorf("%q: NoDerivatives entry is allowed", e.Raw)
		}
		ok := pd[e.Code]
		for _, f := range families {
			if strings.HasPrefix(e.Code, f) {
				fam := strings.TrimSuffix(f, "-")
				ok = strings.HasPrefix(e.URL, "https://creativecommons.org/licenses/"+fam+"/")
				break
			}
		}
		if !ok {
			t.Errorf("%q: code %q does not match URL %q", e.Raw, e.Code, e.URL)
		}
		if prev, dup := byCode[e.Code]; dup && (prev.Name != e.Name || prev.URL != e.URL) {
			t.Errorf("code %q has two names or URLs: %q and %q", e.Code, prev.Raw, e.Raw)
		}
		byCode[e.Code] = e
	}
}
