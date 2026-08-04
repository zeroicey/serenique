package main

import (
	"github.com/zeroicey/serenique-cli/cmd"
)

// Build metadata, injected via the Makefile's -X main.version etc. ldflags.
// These are the ldflags targets; cmd.SetVersion copies them into the cmd
// package's own (defaulted) copies, which are the single mutation point. The
// two var blocks must stay in sync in name and default — see cmd/root.go.
var (
	version = "dev"
	commit  = "unknown"
	date    = ""
)

func main() {
	cmd.SetVersion(version, commit, date)
	cmd.Execute()
}
