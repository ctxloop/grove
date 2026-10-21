package fma

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Headers below copy the real layout of each file, cut to a few columns.

const tracksCSV = `,album,artist,set,set,track,track,track,track
,title,name,split,subset,genre_top,genres,license,title
track_id,,,,,,,,
2,AWOL - A Way Of Life,AWOL,training,small,Hip-Hop,[21],Attribution-NonCommercial-ShareAlike 3.0 International,Food
5,"Album, with comma",Artist,test,medium,,"[2, 811]",,"Title ""quoted"""
`

func TestNewTableMergesHeaderRows(t *testing.T) {
	tab, err := NewTable(strings.NewReader(tracksCSV), 3)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]int{"id": 0, "album.title": 1, "artist.name": 2, "set.split": 3, "set.subset": 4, "track.genre_top": 5, "track.genres": 6, "track.license": 7, "track.title": 8}
	if !reflect.DeepEqual(tab.cols, want) {
		t.Fatalf("cols = %v, want %v", tab.cols, want)
	}
	if _, err := tab.Col("track.nope"); err == nil {
		t.Fatal("missing column: want error")
	}
}

func TestReadTracks(t *testing.T) {
	got, err := ReadTracks(strings.NewReader(tracksCSV))
	if err != nil {
		t.Fatal(err)
	}
	want := []Track{
		{ID: 2, Title: "Food", Artist: "AWOL", Album: "AWOL - A Way Of Life", License: "Attribution-NonCommercial-ShareAlike 3.0 International", Subset: "small", GenreTop: "Hip-Hop", Genres: []int{21}},
		{ID: 5, Title: `Title "quoted"`, Artist: "Artist", Album: "Album, with comma", License: "", Subset: "medium", GenreTop: "", Genres: []int{2, 811}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
}

func TestParseIDList(t *testing.T) {
	for _, c := range []struct {
		in   string
		want []int
		err  bool
	}{
		{"[]", nil, false},
		{"[21]", []int{21}, false},
		{"[21, 811, 3]", []int{21, 811, 3}, false},
		{" [ 1,2 ] ", []int{1, 2}, false},
		{"21", nil, true},
		{"[a]", nil, true},
	} {
		got, err := ParseIDList(c.in)
		if (err != nil) != c.err || !reflect.DeepEqual(got, c.want) {
			t.Errorf("ParseIDList(%q) = %v, %v; want %v, err=%v", c.in, got, err, c.want, c.err)
		}
	}
}

const genresCSV = `genre_id,#tracks,parent,title,top_level
12,100,0,Rock,12
25,50,12,Punk,12
85,10,25,Oi,12
`

func TestReadGenresAndDepth(t *testing.T) {
	g, err := ReadGenres(strings.NewReader(genresCSV))
	if err != nil {
		t.Fatal(err)
	}
	if want := (Genre{ID: 25, Parent: 12, TopLevel: 12, Title: "Punk"}); g[25] != want {
		t.Fatalf("g[25] = %+v, want %+v", g[25], want)
	}
	for id, want := range map[int]int{12: 1, 25: 2, 85: 3, 999: 0} {
		if d := Depth(g, id); d != want {
			t.Errorf("Depth(%d) = %d, want %d", id, d, want)
		}
	}
}

const featuresCSV = `feature,mfcc,mfcc,tonnetz
statistics,mean,mean,std
number,01,02,01
track_id,,,
2,1.5,-2,0.25
3,9,9,9
5,0,1e-3,7
`

func TestReadFeaturesKeepsWantedTracksAndColumns(t *testing.T) {
	got, err := ReadFeatures(strings.NewReader(featuresCSV), []string{"mfcc.mean.02", "tonnetz.std.01"}, map[int]bool{2: true, 5: true})
	if err != nil {
		t.Fatal(err)
	}
	want := map[int][]float64{2: {-2, 0.25}, 5: {0.001, 7}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

const rawTracksCSV = `track_id,album_id,track_url
2,1,http://freemusicarchive.org/music/AWOL/AWOL_-_A_Way_Of_Life/Food
3,1,http://freemusicarchive.org/music/AWOL/AWOL_-_A_Way_Of_Life/Electric_Ave
`

func TestReadTrackURLs(t *testing.T) {
	got, err := ReadTrackURLs(strings.NewReader(rawTracksCSV), map[int]bool{2: true})
	if err != nil {
		t.Fatal(err)
	}
	want := map[int]string{2: "http://freemusicarchive.org/music/AWOL/AWOL_-_A_Way_Of_Life/Food"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestVerifyArchive(t *testing.T) {
	dir := t.TempDir()
	bad := filepath.Join(dir, "fma_small.zip")
	if err := os.WriteFile(bad, []byte("not the archive"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := VerifyArchive(bad); err == nil || !strings.Contains(err.Error(), "SHA1") {
		t.Fatalf("wrong content: err = %v, want SHA1 mismatch", err)
	}
	unknown := filepath.Join(dir, "other.zip")
	if err := os.WriteFile(unknown, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := VerifyArchive(unknown); err == nil {
		t.Fatal("unknown archive: want error")
	}
}
