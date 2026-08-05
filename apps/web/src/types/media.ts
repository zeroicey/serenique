// 媒体文件：新建时为本地文件（带 file），展示时为已上传项（url 为 fileUrl）。
export interface MediaFile {
  id: string
  name: string
  type: string
  url: string
  file?: File
}
