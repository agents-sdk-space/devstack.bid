import "./globals.css";

export const metadata = { title: "__TITLE__", description: "__DESCRIPTION__" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
