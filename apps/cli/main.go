package main

import (
	"github.com/zeroicey/serenique-cli/cmd"
)

// Build metadata, injected via the Makefile's -X main.version etc. ldflags.
var (
	version = "dev"
	commit  = "unknown"
	date    = ""
)

func main() {
	cmd.SetVersion(version, commit, date)
	cmd.Execute()
}
