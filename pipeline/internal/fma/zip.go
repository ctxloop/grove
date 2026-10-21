package fma

import (
	"archive/zip"
	"compress/bzip2"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// methodBzip2 is zip compression method 12, used by every FMA archive.
// macOS unzip cannot read it (exit 81); Go's archive/zip can once a
// decompressor is registered.
const methodBzip2 = 12

// OpenZip opens an FMA archive with bzip2 support.
func OpenZip(path string) (*zip.ReadCloser, error) {
	z, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	z.RegisterDecompressor(methodBzip2, func(r io.Reader) io.ReadCloser {
		return io.NopCloser(bzip2.NewReader(r))
	})
	return z, nil
}

// ArchiveSHA1 holds the published checksums of the FMA archives
// (https://github.com/mdeff/fma, README "Data").
var ArchiveSHA1 = map[string]string{
	"fma_metadata.zip": "f0df49ffe5f2a6008d7dc83c6915b31835dfe733",
	"fma_small.zip":    "ade154f733639d52e35e32f5593efe5be76c6d70",
	"fma_medium.zip":   "c67b69ea232021025fca9231fc1c7c1a063ab50b",
}

// VerifyArchive checks a downloaded archive against ArchiveSHA1.
func VerifyArchive(path string) error {
	want, ok := ArchiveSHA1[filepath.Base(path)]
	if !ok {
		return fmt.Errorf("%s: no known checksum", path)
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha1.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != want {
		return fmt.Errorf("%s: SHA1 %s, want %s", path, got, want)
	}
	return nil
}
