package main

import (
	"github.com/zeroicey/serenique-cli/cmd"
)

// Build metadata, injected via the Makefile's -X main.version etc. ldflags.
// main is the single canonical source of these values: cmd.SetVersion applies
// its own dev defaults for empty values, so no parallel var block exists in
// the cmd package.
var (
	version = "dev"
	commit  = "unknown"
	date    = ""
)

func main() {
	cmd.SetVersion(version, commit, date)
	cmd.Execute()
}
