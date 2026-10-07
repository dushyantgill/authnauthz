import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AuthNAuthZ · Summit Ridge Properties",
  description: "Configurable enterprise identity simulator",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
