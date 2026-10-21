package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestFFmpegArgs(t *testing.T) {
	got := strings.Join(ffmpegArgs("/o/1.m4a.tmp"), " ")
	for _, want := range []string{"-i pipe:0", "-vn", "-ac 1", "-c:a aac", "-b:a 64k", "-movflags +faststart", "-f mp4 /o/1.m4a.tmp"} {
		if !strings.Contains(got, want) {
			t.Errorf("args %q lack %q", got, want)
		}
	}
	args := ffmpegArgs("x")
	if args[len(args)-1] != "x" {
		t.Errorf("output path must come last: %v", args)
	}
}

func TestTrimStderr(t *testing.T) {
	if got := trimStderr("  a\n\nb c\n"); got != "a | b c" {
		t.Errorf("got %q", got)
	}
	if got := trimStderr(strings.Repeat("x", 400)); len(got) != 303 {
		t.Errorf("len %d, want 303", len(got))
	}
}

func testClip(id int, data string) clip {
	return clip{id: id, size: uint64(len(data)), open: func() (io.ReadCloser, error) {
		return io.NopCloser(strings.NewReader(data)), nil
	}}
}

// fakeEncode writes the input to dst, failing for clips whose data is "bad".
func fakeEncode(src io.Reader, dst string) error {
	b, _ := io.ReadAll(src)
	if string(b) == "bad" {
		return errors.New("ffmpeg: exit status 1: Invalid data")
	}
	return os.WriteFile(dst, b, 0o644)
}

func TestRunClips(t *testing.T) {
	out := t.TempDir()
	if err := os.WriteFile(filepath.Join(out, "2.m4a"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(out, "7.m4a"), nil, 0o644); err != nil { // empty output is redone
		t.Fatal(err)
	}
	clips := []clip{
		testClip(1, "one"),
		testClip(2, "two"),
		testClip(3, "bad"),
		{id: 4, size: 0, open: func() (io.ReadCloser, error) { t.Error("empty entry opened"); return nil, nil }},
		{id: 5, size: 3, open: func() (io.ReadCloser, error) { return nil, errors.New("zip: corrupt") }},
		testClip(6, "six"),
		testClip(7, "sev"),
	}
	res := runClips(clips, 3, out, "m4a", fakeEncode)
	if res.done != 3 || res.kept != 1 {
		t.Errorf("done %d kept %d, want 3 and 1", res.done, res.kept)
	}
	want := []string{
		"3: ffmpeg: exit status 1: Invalid data",
		"4: empty entry",
		"5: zip: corrupt",
	}
	if !reflect.DeepEqual(res.skipped, want) {
		t.Errorf("skipped %q, want %q", res.skipped, want)
	}
	if b, _ := os.ReadFile(filepath.Join(out, "2.m4a")); string(b) != "old" {
		t.Errorf("existing output overwritten: %q", b)
	}
	if b, _ := os.ReadFile(filepath.Join(out, "7.m4a")); string(b) != "sev" {
		t.Errorf("empty output not redone: %q", b)
	}
	if _, err := os.Stat(filepath.Join(out, "3.m4a")); err == nil {
		t.Error("failed clip left an output")
	}
}

func TestRunClipsMP3KeepsOnlyMatchingSize(t *testing.T) {
	out := t.TempDir()
	os.WriteFile(filepath.Join(out, "1.mp3"), []byte("abc"), 0o644)
	os.WriteFile(filepath.Join(out, "2.mp3"), []byte("ab"), 0o644) // truncated
	res := runClips([]clip{testClip(1, "abc"), testClip(2, "abc")}, 1, out, "mp3", copyClip)
	if res.done != 1 || res.kept != 1 || len(res.skipped) != 0 {
		t.Errorf("%+v", res)
	}
	if b, _ := os.ReadFile(filepath.Join(out, "2.mp3")); string(b) != "abc" {
		t.Errorf("truncated output not redone: %q", b)
	}
}

func TestFFmpegEncode(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg not installed")
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Skip("ffprobe not installed")
	}
	dir := t.TempDir()
	src := filepath.Join(dir, "in.mp3")
	gen := exec.Command(ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
		"-ac", "2", "-b:a", "128k", src)
	if b, err := gen.CombinedOutput(); err != nil {
		t.Skipf("cannot generate a test MP3: %v: %s", err, b)
	}
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	res := runClips([]clip{testClip(9, string(data))}, 1, dir, "m4a", ffmpegEncode)
	if res.done != 1 || len(res.skipped) != 0 {
		t.Fatalf("%+v", res)
	}
	dst := filepath.Join(dir, "9.m4a")
	if _, err := os.Stat(dst + ".tmp"); err == nil {
		t.Error("temporary file left behind")
	}
	var probe bytes.Buffer
	cmd := exec.Command(ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,channels", "-of", "json", dst)
	cmd.Stdout = &probe
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	var p struct {
		Streams []struct {
			Codec    string `json:"codec_name"`
			Channels int    `json:"channels"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(probe.Bytes(), &p); err != nil || len(p.Streams) != 1 {
		t.Fatalf("ffprobe output %q: %v", probe.String(), err)
	}
	if s := p.Streams[0]; s.Codec != "aac" || s.Channels != 1 {
		t.Errorf("stream %s with %d channels, want aac with 1", s.Codec, s.Channels)
	}

	// Garbage input must fail cleanly without leaving files.
	res = runClips([]clip{testClip(10, "not an mp3")}, 1, dir, "m4a", ffmpegEncode)
	if res.done != 0 || len(res.skipped) != 1 || !strings.HasPrefix(res.skipped[0], "10: ffmpeg:") {
		t.Errorf("%+v", res)
	}
	for _, name := range []string{"10.m4a", "10.m4a.tmp"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
			t.Errorf("%s left behind", name)
		}
	}
}
