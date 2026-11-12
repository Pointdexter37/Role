import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoleMatch",
  description: "Find roles that fit your resume and improve your application."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
