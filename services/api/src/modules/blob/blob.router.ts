import { Hono } from "hono";
import { blobHandler } from "@/modules/blob/blob.handler";

export const blobRouter = new Hono()
  .post("/blobs/upload", blobHandler.upload)
  .get("/blobs", blobHandler.list)
  .post("/blobs/:id/attachments", blobHandler.createAttachment)
  .get("/blobs/:id/attachments", blobHandler.listAttachments)
  .get("/blobs/:id/file", blobHandler.getFile)
  .get("/blobs/:id", blobHandler.get)
  .delete("/blobs/:id", blobHandler.delete)
  .delete("/blob-attachments/:id", blobHandler.deleteAttachment);
