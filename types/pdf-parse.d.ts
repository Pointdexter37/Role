declare module "pdf-parse" {
  type PdfData = { text: string };
  export default function pdfParse(buffer: Buffer): Promise<PdfData>;
}
