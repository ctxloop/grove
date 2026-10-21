package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"

	"grove/pipeline/internal/fma"
)

func runExtract(args []string) error {
	fs := flag.NewFlagSet("extract", flag.ContinueOnError)
	zipPath := fs.String("zip", "", "FMA archive (absolute path)")
	out := fs.String("out", "", "output directory; entries keep their base name")
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "usage: grove-pipeline extract -zip <archive> -out <dir> <entry>...")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *zipPath == "" || *out == "" || fs.NArg() == 0 {
		fs.Usage()
		return errors.New("missing -zip, -out, or entry names")
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
	for _, name := range fs.Args() {
		f, err := z.Open(name)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		dst := filepath.Join(*out, path.Base(name))
		n, err := writeFile(dst, f)
		f.Close()
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		fmt.Printf("%s: %d bytes\n", dst, n)
	}
	return nil
}

// writeFile writes r to a temporary file and renames it into place, so an
// interrupted run never leaves a truncated CSV behind.
func writeFile(dst string, r io.Reader) (int64, error) {
	tmp := dst + ".tmp"
	w, err := os.Create(tmp)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(w, r)
	if cerr := w.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp)
		return 0, err
	}
	return n, os.Rename(tmp, dst)
}
