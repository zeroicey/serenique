BINARY_NAME := serenique
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

.PHONY: build
build:
	go build -ldflags "$(LDFLAGS)" -o bin/$(BINARY_NAME) .

.PHONY: install
install: build
	cp bin/$(BINARY_NAME) /usr/local/bin/$(BINARY_NAME)

.PHONY: build-all
build-all:
	GOOS=linux   GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/$(BINARY_NAME)-linux-amd64   .
	GOOS=linux   GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o bin/$(BINARY_NAME)-linux-arm64   .
	GOOS=darwin  GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/$(BINARY_NAME)-darwin-amd64  .
	GOOS=darwin  GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o bin/$(BINARY_NAME)-darwin-arm64  .
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o bin/$(BINARY_NAME)-windows-amd64.exe .

.PHONY: clean
clean:
	rm -rf bin/

.PHONY: test
test:
	go test ./internal/...

.PHONY: lint
lint:
	golangci-lint run ./...
