package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"

	"grove/pipeline/internal/fma"
)

// runAudio writes the selected tracks' clips from an FMA audio archive to
// <out>/<track_id>.<format>. With -format mp3 the MP3 is copied out as is;
// with -format m4a it is encoded to mono AAC with ffmpeg. Existing outputs
// are kept, so reruns are cheap. Missing, empty, or failing clips are skipped
// and listed; they do not fail the run.
func runAudio(args []string) error {
	fs := flag.NewFlagSet("audio", flag.ContinueOnError)
	subset := fs.String("subset", "small", "small or medium")
	meta := fs.String("meta", "", "directory with the extracted fma_metadata CSVs (absolute path)")
	zipPath := fs.String("zip", "", "fma_small.zip or fma_medium.zip (absolute path); medium contains small")
	out := fs.String("out", "", "audio output directory (absolute path)")
	format := fs.String("format", "m4a", "mp3 (copy the original) or m4a (encode with ffmpeg)")
	jobs := fs.Int("jobs", runtime.NumCPU(), "parallel workers")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *meta == "" || *zipPath == "" || *out == "" {
		fs.Usage()
		return errors.New("missing -meta, -zip, or -out")
	}
	if *format != "mp3" && *format != "m4a" {
		return fmt.Errorf("unknown format %q (want mp3 or m4a)", *format)
	}
	if *jobs < 1 {
		return errors.New("-jobs must be at least 1")
	}
	encode := copyClip
	if *format == "m4a" {
		if _, err := exec.LookPath("ffmpeg"); err != nil {
			return errors.New("ffmpeg not found in PATH")
		}
		encode = ffmpegEncode
	}
	s, err := selectTracks(*meta, *subset)
	if err != nil {
		return err
	}
	if err := fma.VerifyArchive(*zipPath); err != nil {
		return err
	}
	z, err := fma.OpenZip(*zipPath)
	if err != nil {
		return err
	}
	defer z.Close()
	if err := os.MkdirAll(*out, 0o755); err != nil {
		return err
	}
	want := s.ids()
	found := map[int]bool{}
	var list []clip
	for _, f := range z.File {
		id, ok := trackID(f.Name)
		if !ok || !want[id] {
			continue
		}
		found[id] = true
		list = append(list, clip{id: id, size: f.UncompressedSize64, open: f.Open})
	}
	// zip.File.Open reads through the archive's io.ReaderAt (an *os.File), so
	// workers may open distinct entries concurrently.
	res := runClips(list, *jobs, *out, *format, encode)
	for _, t := range s.tracks {
		if !found[t.ID] {
			res.skipped = append(res.skipped, fmt.Sprintf("%d: not in archive", t.ID))
		}
	}
	for _, line := range res.skipped {
		fmt.Fprintln(os.Stderr, "skipped", line)
	}
	verb := "encoded"
	if *format == "mp3" {
		verb = "copied"
	}
	fmt.Printf("%s: %d tracks, %d %s, %d already present, %d skipped\n", *subset, len(s.tracks), res.done, verb, res.kept, len(res.skipped))
	return nil
}

// clip is one archive entry to turn into an output file.
type clip struct {
	id   int
	size uint64 // uncompressed entry size
	open func() (io.ReadCloser, error)
}

// encodeFunc turns the MP3 stream src into the file dst.
type encodeFunc func(src io.Reader, dst string) error

type clipResult struct {
	done, kept int
	skipped    []string // "<id>: <reason>", sorted by ID
}

// runClips encodes every clip to <out>/<id>.<ext> with the given number of
// workers. An existing output is kept: for mp3 when its size equals the entry
// size, for m4a when it is non-empty. Empty entries and failed encodes are
// skipped and reported, never fatal.
func runClips(clips []clip, workers int, out, ext string, encode encodeFunc) clipResult {
	type outcome struct {
		id     int
		kept   bool
		reason string // empty on success
	}
	in := make(chan clip)
	outc := make(chan outcome)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range in {
				kept, err := processClip(c, out, ext, encode)
				o := outcome{id: c.id, kept: kept}
				if err != nil {
					o.reason = err.Error()
				}
				outc <- o
			}
		}()
	}
	go func() {
		for _, c := range clips {
			in <- c
		}
		close(in)
		wg.Wait()
		close(outc)
	}()
	var res clipResult
	type failure struct {
		id     int
		reason string
	}
	var failed []failure
	for o := range outc {
		switch {
		case o.reason != "":
			failed = append(failed, failure{o.id, o.reason})
		case o.kept:
			res.kept++
		default:
			res.done++
		}
	}
	sort.Slice(failed, func(i, j int) bool { return failed[i].id < failed[j].id })
	for _, f := range failed {
		res.skipped = append(res.skipped, fmt.Sprintf("%d: %s", f.id, f.reason))
	}
	return res
}

func processClip(c clip, out, ext string, encode encodeFunc) (kept bool, err error) {
	if c.size == 0 {
		return false, errors.New("empty entry")
	}
	dst := filepath.Join(out, strconv.Itoa(c.id)+"."+ext)
	if st, err := os.Stat(dst); err == nil && st.Size() > 0 && (ext != "mp3" || uint64(st.Size()) == c.size) {
		return true, nil
	}
	r, err := c.open()
	if err != nil {
		return false, err
	}
	defer r.Close()
	if err := encode(r, dst); err != nil {
		return false, err
	}
	return false, nil
}

// copyClip stores the MP3 stream unchanged.
func copyClip(src io.Reader, dst string) error {
	_, err := writeFile(dst, src)
	return err
}

// ffmpegArgs is the ffmpeg command line that reads an MP3 from stdin and
// writes mono AAC 64 kbps in an MP4 container with the index up front, so the
// browser can start decoding before the download ends. -f mp4 is explicit
// because dst is a temporary name without the .m4a extension.
func ffmpegArgs(dst string) []string {
	return []string{
		"-nostdin", "-hide_banner", "-loglevel", "error", "-y",
		"-i", "pipe:0",
		"-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k",
		"-movflags", "+faststart", "-f", "mp4", dst,
	}
}

// ffmpegEncode encodes src to dst through a temporary file, so a crash never
// leaves a half-written <id>.m4a behind.
func ffmpegEncode(src io.Reader, dst string) error {
	tmp := dst + ".tmp"
	defer os.Remove(tmp) // no-op after a successful rename
	cmd := exec.Command("ffmpeg", ffmpegArgs(tmp)...)
	cmd.Stdin = src
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if msg := trimStderr(stderr.String()); msg != "" {
			return fmt.Errorf("ffmpeg: %v: %s", err, msg)
		}
		return fmt.Errorf("ffmpeg: %v", err)
	}
	if st, err := os.Stat(tmp); err != nil || st.Size() == 0 {
		return errors.New("ffmpeg wrote no output")
	}
	return os.Rename(tmp, dst)
}

// trimStderr joins ffmpeg's error lines into one short line.
func trimStderr(s string) string {
	var lines []string
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			lines = append(lines, l)
		}
	}
	s = strings.Join(lines, " | ")
	if len(s) > 300 {
		s = s[:300] + "..."
	}
	return s
}

// trackID parses "fma_small/000/000140.mp3" as 140.
func trackID(name string) (int, bool) {
	base, ok := strings.CutSuffix(path.Base(name), ".mp3")
	if !ok {
		return 0, false
	}
	id, err := strconv.Atoi(base)
	return id, err == nil
}
