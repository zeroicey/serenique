import { describe, expect, test } from "bun:test";
import { buildUploadEndpoint } from "./tools/blob.tools";

// Regression for the Docker scenario where upload_blob guidance leaked the
// compose-service hostname (http://api:3000), which host-side agents cannot
// resolve. buildUploadEndpoint must prefer the host-reachable public URL.
describe("buildUploadEndpoint", () => {
  test("prefers the public base URL when configured", () => {
    expect(
      buildUploadEndpoint(
        "http://api:3000", // internal compose-service hostname
        "http://192.168.1.10:3000", // host-reachable
      ),
    ).toBe("http://192.168.1.10:3000/api/blobs/upload");
  });

  test("falls back to the API base URL when no public URL is set", () => {
    expect(buildUploadEndpoint("http://localhost:3000")).toBe(
      "http://localhost:3000/api/blobs/upload",
    );
  });

  test("strips a trailing slash from either base", () => {
    expect(
      buildUploadEndpoint("http://api:3000/", "http://localhost:3000/"),
    ).toBe("http://localhost:3000/api/blobs/upload");
  });
});
