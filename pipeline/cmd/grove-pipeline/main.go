// Command grove-pipeline turns the FMA archives into the static files the
// browser reads. See docs/architecture.md §2.
package main

import (
	"fmt"
	"os"
)

const usage = `usage: grove-pipeline <command> [flags]

commands:
  extract  copy entries out of an FMA zip after verifying its SHA1
  build    write world.json, biome files, and attribution.json
  audio    extract or encode the clips for a subset
  stats    print counts and check a build against them

Run "grove-pipeline <command> -h" for flags.
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	cmds := map[string]func([]string) error{
		"extract": runExtract,
		"build":   runBuild,
		"audio":   runAudio,
		"stats":   runStats,
	}
	run, ok := cmds[os.Args[1]]
	if !ok {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err := run(os.Args[2:]); err != nil {
		fmt.Fprintf(os.Stderr, "grove-pipeline %s: %v\n", os.Args[1], err)
		os.Exit(1)
	}
}
